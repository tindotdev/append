import * as authSchema from './auth.schema';
import * as domainSchema from './domain.schema';

// Combine all schemas here for migrations
export const schema = {
	...authSchema,
	...domainSchema,
} as const;
