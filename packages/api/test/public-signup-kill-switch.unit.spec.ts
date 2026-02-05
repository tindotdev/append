import { APIError } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';
import { accountCreateBeforeHook } from '../src/lib/auth/index';

describe('public sign-up kill switch', () => {
	it('public mode + PUBLIC_SIGNUP_ENABLED=0 fails with sign-up disabled (not allowlist errors)', async () => {
		const env = {
			AUTH_MODE: 'public',
			PUBLIC_SIGNUP_ENABLED: '0',
		} as any;

		const db = {
			query: {
				user: {
					findFirst: vi.fn(),
				},
			},
		} as any;

		let error: unknown;
		try {
			await accountCreateBeforeHook(env, db, {
				providerId: 'google',
				userId: 'user-1',
				accountId: 'sub-1',
			});
		} catch (err) {
			error = err;
		}

		expect(error).toBeInstanceOf(APIError);
		expect(error).toMatchObject({
			statusCode: 403,
			body: { message: 'Sign-up is temporarily disabled' },
		});

		expect(db.query.user.findFirst).not.toHaveBeenCalled();
	});

	it('public mode + PUBLIC_SIGNUP_ENABLED=1 does not require allowlist configuration', async () => {
		const env = {
			AUTH_MODE: 'public',
			PUBLIC_SIGNUP_ENABLED: '1',
		} as any;

		const db = {
			query: {
				user: {
					findFirst: vi.fn(),
				},
			},
		} as any;

		await expect(
			accountCreateBeforeHook(env, db, {
				providerId: 'google',
				userId: 'user-1',
				accountId: 'sub-1',
			})
		).resolves.toBeUndefined();

		expect(db.query.user.findFirst).not.toHaveBeenCalled();
	});

	it('restricted mode without allowlist fails closed with allowlist-not-configured', async () => {
		const env = {
			AUTH_MODE: 'restricted',
		} as any;

		const db = {
			query: {
				user: {
					findFirst: vi.fn(),
				},
			},
		} as any;

		await expect(
			accountCreateBeforeHook(env, db, {
				providerId: 'google',
				userId: 'user-1',
				accountId: 'sub-1',
			})
		).rejects.toMatchObject({
			statusCode: 403,
			body: { message: 'Access denied: allowlist not configured' },
		});

		expect(db.query.user.findFirst).not.toHaveBeenCalled();
	});
});
