import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./lib/auth";

type Bindings = {
	DB: D1Database;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	// Allowlist (ADR 0001)
	ALLOWED_SUB?: string;
	ALLOWED_EMAIL?: string;
};

type Variables = {
	auth: ReturnType<typeof createAuth>;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS for auth routes (web app needs to call these)
app.use(
	"/auth/*",
	cors({
		origin: ["http://localhost:5173", "https://append.tindev.dev"],
		allowMethods: ["POST", "GET", "OPTIONS"],
		credentials: true,
	})
);

// Middleware to initialize auth instance for each request
app.use("*", async (c, next) => {
	const auth = createAuth(c.env, (c.req.raw as any).cf || {});
	c.set("auth", auth);
	await next();
});

// Handle all auth routes
app.all("/auth/*", async (c) => {
	const auth = c.get("auth");
	return auth.handler(c.req.raw);
});

// Health check
app.get("/", (c) => c.json({ status: "ok" }));

export default app;
