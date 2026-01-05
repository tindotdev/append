import { Hono } from 'hono';
import { cors } from 'hono/cors';
// Feature routes (vertical slice architecture)
import { acceptRoutes } from './features/accept/routes';
import { batchRoutes } from './features/batch/routes';
import { bucketRoutes } from './features/bucket/routes';
import { candidateRoutes } from './features/candidate/routes';
import { exportRoutes } from './features/export/routes';
import { importRoutes } from './features/import/routes';
import { suggestionsRoutes } from './features/suggestions/routes';
import { termRoutes } from './features/term/routes';
import { termSenseRoutes } from './features/term-sense/routes';
import { userBucketRoutes } from './features/user-bucket/routes';
import { createAuth, getAllowedOrigins, isPreviewEnv } from './lib/auth';
import { e2eLoginRoute } from './lib/auth/e2e-login';
import type { Variables as BaseVariables, Bindings } from './platform/bindings';
import { attachDb } from './platform/context';
import { apiError } from './shared/api-error';

/** Max length for wildcard segment (DNS label limit) */
const MAX_WILDCARD_SEGMENT_LENGTH = 63;

/**
 * Check if origin matches allowed origins (ADR 0019).
 * Supports wildcard patterns like https://*.append-web.pages.dev
 *
 * Uses simple string matching instead of regex to avoid ReDoS attacks.
 *
 * @internal Exported for testing only
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Simple conditional logic, not actually complex
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
	// Validate origin is a reasonable URL format (prevent malformed input)
	if (!origin || origin.length > 256 || !origin.startsWith('http')) {
		return false;
	}

	for (const allowed of allowedOrigins) {
		if (allowed.includes('*')) {
			// Simple wildcard matching: split on * and check prefix/suffix
			const parts = allowed.split('*');
			if (parts.length !== 2) {
				// Only support single wildcard
				continue;
			}
			const [prefix, suffix] = parts;
			// Origin must start with prefix, end with suffix, and have content between
			if (origin.startsWith(prefix) && origin.endsWith(suffix) && origin.length > prefix.length + suffix.length) {
				// Validate wildcard segment length (DNS label limit: 63 chars)
				const wildcardSegment = origin.slice(prefix.length, origin.length - suffix.length);
				if (wildcardSegment.length <= MAX_WILDCARD_SEGMENT_LENGTH) {
					return true;
				}
			}
		} else if (allowed === origin) {
			return true;
		}
	}
	return false;
}

type Variables = BaseVariables & {
	auth: ReturnType<typeof createAuth>;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// =============================================================================
// Global error handlers for /api/* routes (§4.0)
// =============================================================================

app.onError((err, c) => {
	// Only apply contract error shape to /api/* routes
	if (!c.req.path.startsWith('/api/')) {
		throw err;
	}

	console.error('API error:', err);

	// JSON parsing errors
	if (err instanceof SyntaxError && err.message.includes('JSON')) {
		return apiError(c, 400, 'INVALID_JSON', 'Invalid JSON in request body');
	}

	// Default to internal error
	return apiError(c, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
});

app.notFound((c) => {
	// Only apply contract error shape to /api/* routes
	if (c.req.path.startsWith('/api/')) {
		return apiError(c, 404, 'NOT_FOUND', 'Resource not found');
	}
	// Default behavior for non-API routes
	return c.text('Not Found', 404);
});

// =============================================================================
// CORS for auth routes (web app needs to call these)
// Uses dynamic origins for preview environment (ADR 0019)
// =============================================================================

app.use('/auth/*', async (c, next) => {
	const allowedOrigins = getAllowedOrigins(c.env);
	return cors({
		origin: (origin) => (isOriginAllowed(origin, allowedOrigins) ? origin : null),
		allowMethods: ['POST', 'GET', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'x-e2e-secret'],
		credentials: true,
	})(c, next);
});

// =============================================================================
// CORS for API routes (§3.1)
// Must be registered BEFORE auth guard middleware
// Uses dynamic origins for preview environment (ADR 0019)
// =============================================================================

app.use('/api/*', async (c, next) => {
	const allowedOrigins = getAllowedOrigins(c.env);
	return cors({
		origin: (origin) => (isOriginAllowed(origin, allowedOrigins) ? origin : null),
		allowMethods: ['POST', 'GET', 'PUT', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'X-Import-Id'],
		credentials: true,
	})(c, next);
});

// Explicit OPTIONS preflight handler for /api/* (§3.1)
// Prevents auth middleware from intercepting preflight requests
app.options('/api/*', (c) => c.body(null, 204));

// =============================================================================
// Preview-only origin validation for state-changing requests (ADR 0019)
// Defense-in-depth: SameSite=None cookies are cross-site sendable
// =============================================================================

app.use('/api/*', async (c, next) => {
	// Only apply in preview environment
	if (!isPreviewEnv(c.env)) {
		return next();
	}

	// Only apply to state-changing methods
	const method = c.req.method;
	if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
		return next();
	}

	// Require valid Origin header for POST/PUT/DELETE in preview
	const origin = c.req.header('origin');
	if (!origin) {
		return apiError(c, 403, 'ORIGIN_FORBIDDEN', 'Origin header required');
	}

	const allowedOrigins = getAllowedOrigins(c.env);
	if (!isOriginAllowed(origin, allowedOrigins)) {
		return apiError(c, 403, 'ORIGIN_FORBIDDEN', 'Invalid origin');
	}

	return next();
});

// =============================================================================
// Auth instance initializer (must be early so c.get("auth") is available)
// =============================================================================

app.use('*', async (c, next) => {
	const auth = createAuth(c.env, (c.req.raw as any).cf || {});
	c.set('auth', auth);
	await next();
});

// =============================================================================
// Auth guard middleware for /api/* routes (§2)
// =============================================================================

app.use('/api/*', async (c, next) => {
	const auth = c.get('auth');

	// Call getSession with returnHeaders to capture set-cookie for token refresh
	const { headers, response: session } = await auth.api.getSession({
		headers: c.req.raw.headers,
		returnHeaders: true,
	});

	// Forward set-cookie headers for token refresh (use append semantics)
	const setCookie = headers.get('set-cookie');
	if (setCookie) {
		c.res.headers.append('set-cookie', setCookie);
	}

	// 401 if no valid session
	if (!session) {
		return apiError(c, 401, 'UNAUTHORIZED', 'Authentication required');
	}

	// Set userId for downstream handlers
	c.set('userId', session.user.id);
	await next();
});

// =============================================================================
// DB context for /api/* routes
// =============================================================================

app.use('/api/*', attachDb);

// =============================================================================
// E2E Auth Bootstrap (ADR 0019) - must be BEFORE generic /auth/* handler
// =============================================================================

app.route('/auth/e2e', e2eLoginRoute);

// =============================================================================
// Handle all auth routes (Better Auth)
// =============================================================================

app.all('/auth/*', async (c) => {
	const auth = c.get('auth');
	return auth.handler(c.req.raw);
});

// =============================================================================
// Health check
// =============================================================================

app.get('/', (c) => c.json({ status: 'ok' }));

// =============================================================================
// API routes
// =============================================================================

// Feature routes (vertical slice architecture)
// Chain routes for Hono RPC type inference
const apiRoutes = app
	.route('/api', acceptRoutes)
	.route('/api/batch', batchRoutes)
	.route('/api/bucket', bucketRoutes)
	.route('/api/candidate', candidateRoutes)
	.route('/api/export', exportRoutes)
	.route('/api/import', importRoutes)
	.route('/api', suggestionsRoutes)
	.route('/api/term', termRoutes)
	.route('/api/term-sense', termSenseRoutes)
	.route('/api/user-bucket', userBucketRoutes);

// Export type for Hono RPC client
export type AppType = typeof apiRoutes;

export default app;
