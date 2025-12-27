import { valibotSchema } from '@ai-sdk/valibot';
import { BUCKET_LIST, BucketSchema } from '@append/contracts';
import { generateText, Output } from 'ai';
import { strictObject, string } from 'valibot';
import { type CacheKey, cacheResponse, findCachedResponse } from './cache';
import { aigateway, type OpenAIModel, openai } from './gateway';

const system = `You are a concise technical glossary assistant for a software engineer's personal learning log.

Given a technical term or concept, respond with:
1. A one-liner explanation (1-2 sentences max, practical and memorable)
2. A bucket classification from exactly one of: ${BUCKET_LIST}

Bucket definitions:
- foundations: Core CS concepts, algorithms, data structures
- backend: Server-side patterns, APIs, databases, storage
- frontend: UI patterns, React, state management, conflict UX, accept workflows
- dx-tooling: Build tools, migrations, scripts, CI/CD, developer experience
- deep-concepts: Model Context Protocol, CAP theorem, system design philosophy

Response format (JSON):
{"bucket": "<bucket-slug>", "text": "<one-liner explanation>"}

Guidelines:
- Be practical, not academic—explain like a senior engineer would to a peer
- Prefer concrete examples over abstract definitions when helpful
- Keep it under 200 characters for the one-liner
- Only output valid JSON, nothing else`;

const key: CacheKey<OpenAIModel> = {
	provider: 'openai',
	model: 'gpt-5-mini',
	prompt: 'Cloudflare',
};

let response = findCachedResponse(key);

if (response) {
	console.log('(cached)', response);
} else {
	response = await generateText({
		system,
		model: aigateway(openai.chat(key.model)),
		prompt: key.prompt,
		output: Output.object({
			schema: valibotSchema(
				strictObject({
					bucket: BucketSchema,
					text: string(),
				})
			),
		}),
	});
	cacheResponse(key, response);
	console.log(response);
}
