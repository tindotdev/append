/**
 * Cloudflare Worker Env augmentation.
 *
 * `wrangler types` does not reliably include Worker secrets (especially when
 * injected at deploy time via Doppler), so we augment the generated Env type
 * to keep type coverage for those secrets.
 */

declare namespace Cloudflare {
	interface Env {
		OPENAI_API_KEY?: string;
		CF_AIG_TOKEN?: string;
	}
}

export {};
