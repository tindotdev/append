import * as authSchema from './auth.schema';
import * as domainSchema from './domain.schema';
import * as eventsSchema from './events.schema';

// Combine all schemas here for migrations
export const schema = {
	...authSchema,
	...domainSchema,
	...eventsSchema,
} as const;
