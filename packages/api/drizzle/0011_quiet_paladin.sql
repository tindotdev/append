-- Migration 0011: Drop bucket.color column
-- IRREVERSIBLE: This migration permanently removes the color column.
--
-- Deployment sequence (REQUIRED):
-- 1. Run migration 0010 (adds icon column)
-- 2. Deploy code that reads/writes both icon and color (if backfill needed)
-- 3. Backfill icon from color values (if needed)
-- 4. Deploy code that ONLY uses icon (remove all bucket.color references)
-- 5. Run THIS migration (0011) to drop the color column
--
-- CRITICAL: Verify no code on main references bucket.color before running this migration.
-- Any in-flight requests referencing bucket.color will fail after this migration runs.

ALTER TABLE `bucket` DROP COLUMN `color`;