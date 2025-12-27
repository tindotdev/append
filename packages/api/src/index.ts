import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { apiError } from './shared/api-error';
import { createAuth } from './lib/auth';
// Feature routes (vertical slice architecture)
import { batchRoutes } from './features/batch/routes';
import { suggestionsRoutes } from './features/suggestions/routes';
import { acceptRoutes } from './features/accept/routes';
// Legacy routes (not yet migrated)
import { bucketRoutes } from './routes/bucket';
import { candidateRoutes } from './routes/candidate';
import { exportRoutes } from './routes/export';

type Bindings = {
	DB: D1Database;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	// Allowlist (ADR 0001)
	ALLOWED_SUB?: string;
	ALLOWED_EMAIL?: string;
	// Test-only: enable email/password auth (§5.2)
	ENABLE_TEST_EMAIL_PASSWORD_AUTH?: string;
};

type Variables = {
	auth: ReturnType<typeof createAuth>;
	userId: string;
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
// =============================================================================

app.use(
	'/auth/*',
	cors({
		origin: ['http://localhost:5173', 'https://append.tindev.dev'],
		allowMethods: ['POST', 'GET', 'OPTIONS'],
		credentials: true,
	})
);

// =============================================================================
// CORS for API routes (§3.1)
// Must be registered BEFORE auth guard middleware
// =============================================================================

app.use(
	'/api/*',
	cors({
		origin: ['http://localhost:5173', 'https://append.tindev.dev'],
		allowMethods: ['POST', 'GET', 'PUT', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
		credentials: true,
	})
);

// Explicit OPTIONS preflight handler for /api/* (§3.1)
// Prevents auth middleware from intercepting preflight requests
app.options('/api/*', (c) => c.body(null, 204));

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
app.route('/api/batch', batchRoutes);
app.route('/api', suggestionsRoutes);
app.route('/api', acceptRoutes);
// Legacy routes (not yet migrated)
app.route('/api/bucket', bucketRoutes);
app.route('/api/candidate', candidateRoutes);
app.route('/api/export', exportRoutes);

export default app;
