import { drizzle } from 'drizzle-orm/d1';
import type { MiddlewareHandler } from 'hono';
import { schema } from '../db';
import type { Bindings, Variables } from './bindings';

export const attachDb: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
	c.set('db', drizzle(c.env.DB, { schema }));
	await next();
};
