import { generateText } from 'ai';
import { cacheResponse, findCachedResponse } from './cache';
import { aigateway, openai } from './gateway';

const provider = 'openai';
const prompt = "Who's Tin Dejphachon?";

let response = findCachedResponse(provider, prompt);

if (response) {
	console.log('(cached)', response);
} else {
	response = await generateText({
		model: aigateway(openai.chat('gpt-4.1-mini')),
		prompt,
	});
	cacheResponse(provider, prompt, response);
	console.log(response);
}
