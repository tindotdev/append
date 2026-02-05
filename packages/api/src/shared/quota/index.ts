/**
 * Quota enforcement module (ADR 0026).
 *
 * Provides per-user lifetime quotas and global monthly budget pools
 * for LLM-powered features like term suggestions.
 */

export * from './global-budget';
export * from './user-quota';
export * from './window';
