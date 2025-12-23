import { schema } from "./schema";

// Re-export schema for use in other files
export { schema };

// Re-export individual tables for drizzle-kit
export * from "./auth.schema";
export * from "./domain.schema";
export * from "./schema";
