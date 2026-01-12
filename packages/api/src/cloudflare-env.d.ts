/**
 * Cloudflare Worker Env augmentation.
 *
 * `wrangler types` does not reliably include Worker secrets (especially when
 * injected at deploy time via Doppler), so we augment the generated Env type
 * to keep type coverage for those secrets.
 */

declare namespace Cloudflare {
	interface Env {
		/**
		 * OpenAI API key (synced from Doppler at deploy time).
		 *
		 * REQUIRED when SUGGESTIONS_PROVIDER='openai' (production).
		 * Optional when SUGGESTIONS_PROVIDER='stub' (preview/test).
		 */
		OPENAI_API_KEY?: string;

		/** Optional AI Gateway token for unified billing (deprecated) */
		CF_AIG_TOKEN?: string;
	}
}

export {};
