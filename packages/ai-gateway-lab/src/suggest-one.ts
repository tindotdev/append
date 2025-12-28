import { valibotSchema } from '@ai-sdk/valibot';
import { BucketSchema } from '@append/contracts';
import { generateText, Output } from 'ai';
import { strictObject, string } from 'valibot';
import type { Suggestion } from './batch-events';
import { aigateway, type OpenAIModel, openai } from './gateway';
import { SYSTEM_PROMPT } from './system-prompt';

export const MODEL: OpenAIModel = 'gpt-5-mini';

const SuggestionSchema = strictObject({
	bucket: BucketSchema,
	text: string(),
});

export async function suggestOne(term: string): Promise<Suggestion> {
	const response = await generateText({
		system: SYSTEM_PROMPT,
		model: aigateway(openai.chat(MODEL)),
		prompt: term,
		output: Output.object({
			schema: valibotSchema(SuggestionSchema),
		}),
	});
	return response.output as Suggestion;
}
