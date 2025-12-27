import { generateText } from 'ai';
import { createAiGateway } from 'ai-gateway-provider';
import { createOpenAI } from 'ai-gateway-provider/providers/openai';

const accountId = process.env.CF_ACCOUNT_ID!;
const gateway = process.env.AI_GATEWAY_ID!;
const apiKey = process.env.CF_AIG_TOKEN!;

const aigateway = createAiGateway({
	accountId,
	gateway,
	apiKey,
});

const openai = createOpenAI();

const response = await generateText({
	model: aigateway(openai.chat('gpt-5-mini')),
	prompt: "Who's Tin Dejphachon?",
});

console.log(response);
