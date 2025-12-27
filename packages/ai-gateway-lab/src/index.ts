import { generateText } from 'ai';
import { cacheResponse, type CacheKey, findCachedResponse } from './cache';
import { aigateway, openai, type OpenAIModel } from './gateway';

const key: CacheKey<OpenAIModel> = {
	provider: 'openai',
	model: 'gpt-4.1-mini',
	prompt: "Who's Tin Dejphachon?",
};

let response = findCachedResponse(key);

if (response) {
	console.log('(cached)', response);
} else {
	response = await generateText({
		model: aigateway(openai.chat(key.model)),
		prompt: key.prompt,
	});
	cacheResponse(key, response);
	console.log(response);
}
