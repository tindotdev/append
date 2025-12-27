import { createAiGateway } from 'ai-gateway-provider';
import { createOpenAI } from 'ai-gateway-provider/providers/openai';

const accountId = process.env.CF_ACCOUNT_ID;
const gatewayId = process.env.AI_GATEWAY_ID;
const apiKey = process.env.CF_AIG_TOKEN;

if (!accountId || !gatewayId || !apiKey) {
	throw new Error('Missing required env vars: CF_ACCOUNT_ID, AI_GATEWAY_ID, CF_AIG_TOKEN');
}

export const aigateway = createAiGateway({
	accountId,
	gateway: gatewayId,
	apiKey,
});

export const openai = createOpenAI();

export type OpenAIModel = Parameters<typeof openai.chat>[0];
