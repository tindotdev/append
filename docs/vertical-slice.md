# Append — First vertical slice (runnable path)

## Goal

Ship a usable “off-load the brain” flow end-to-end, with canonical storage inside `append`.

## Slice definition

1. Google SSO login.
2. Paste 20–200 terms into “New batch”.
3. Worker API generates suggestions (bucket + one-liner).
4. UI shows a review list with:
   - per-term edit of bucket + text
   - “accept all” button
5. Accept-all creates `Term` + `TermSense` rows (append-only) and marks the batch done.
6. Bucket feed page shows newly appended entries.
7. Export page downloads 5 markdown files in ENG-LOG format (convenience).

## Done criteria

- Re-running accept-all (retry) creates zero duplicates.
- Edits are version-checked (409 on conflict).
- Export output is deterministic and stable across refreshes.
