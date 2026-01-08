import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema';

export const DEVICE_TYPE = ['chrome_extension', 'web', 'unknown'] as const;
export type DeviceType = (typeof DEVICE_TYPE)[number];

/**
 * Device: a client installation that emits events (MVP: Chrome extension).
 */
export const device = sqliteTable(
	'device',
	{
		id: text('id').primaryKey(), // client-generated UUID
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		type: text('type').notNull().$type<DeviceType>().default('unknown'),
		installedAt: integer('installed_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
		lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
	},
	(table) => [index('device_user_last_seen_idx').on(table.userId, table.lastSeenAt)]
);

export const EVENT_TYPE = ['artifact_active', 'capture', 'topic_override', 'aha_candidate'] as const;
export type EventType = (typeof EVENT_TYPE)[number];

/**
 * Event: immutable facts emitted by clients, stored append-only.
 *
 * Deduplication is canonical on (user_id, device_id, event_id).
 */
export const event = sqliteTable(
	'event',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		deviceId: text('device_id')
			.notNull()
			.references(() => device.id, { onDelete: 'cascade' }),
		eventId: text('event_id').notNull(),

		schemaVersion: integer('schema_version').notNull(),
		type: text('type').notNull().$type<EventType>(),

		emittedAt: integer('emitted_at', { mode: 'timestamp_ms' }).notNull(),
		receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),

		artifactHost: text('artifact_host'),
		artifactUrlHash: text('artifact_url_hash'),
		artifactPathHint: text('artifact_path_hint'),
		titleHint: text('title_hint'),

		payloadJson: text('payload_json').notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.deviceId, table.eventId] }),
		index('event_user_emitted_idx').on(table.userId, table.emittedAt),
		index('event_user_artifact_emitted_idx').on(table.userId, table.artifactUrlHash, table.emittedAt),
	]
);
