# ADR 0024 — Accept individual candidates

Status: Accepted
Date: 2026-01-13

## Context

The batch workflow currently only supports "Accept All", which atomically materializes all ready candidates in a batch into Term/TermSense entries. Users need more granular control:

- Accept individual candidates one at a time
- Bulk-select multiple candidates and accept them together
- Review/edit candidates before accepting
- See clear status for each candidate (pending, ready, accepted, error)

Constraints:

- Follow existing patterns from bucket feed table (ADR 0023) and export route
- Maintain idempotency and optimistic locking patterns (ADR 0008, ADR 0017)
- Keep Term/TermSense materialization as "legacy/optional enrichment" per ADR 0020
- Preserve "Accept All" as a convenience action for processing entire batches

## Decision

### 1) Add individual accept endpoint

New endpoint:

- `POST /api/candidate/:id/accept` `{ clientRequestId, expectedVersion }`

Owner-only, idempotent via `clientRequestId`.

Behavior:

- Validate candidate is owned by user (via batch relationship)
- Validate candidate is ready (has effective bucket + text)
- Validate candidate is not already accepted (`materialized_term_sense_id IS NULL`)
- Validate optimistic lock (`candidate.version === expectedVersion`)
- Materialize Term (find existing or create new) and TermSense
- Update candidate with `materialized_term_id`, `materialized_term_sense_id`, `version++`

### 2) Use data table UI with checkbox selection

Replace card-based CandidateList with CandidateTable:

- TanStack React Table with row selection (`rowSelection` state)
- Checkbox column (only selectable for "ready" status candidates)
- Columns: term, bucket, definition, status, actions dropdown
- Row click opens CandidateDetailSheet for editing

### 3) Add floating bulk action bar

CandidateBulkActionBar appears when `selectedCount > 0`:

- Shows count of selected items
- Clear selection button
- "Accept N selected" button
- Processes accepts sequentially, reports partial failures via toast

### 4) Add side sheet for candidate editing

CandidateDetailSheet provides:

- AI suggestion display (bucket + text)
- Suggestion status (in_progress, error)
- Edit form for bucket and definition overrides
- Save/Clear overrides buttons
- Accept button (for ready candidates)

### 5) Candidate status logic

```typescript
type CandidateStatus = 'ready' | 'pending' | 'accepted' | 'error';

function getCandidateStatus(candidate: Candidate): CandidateStatus {
  if (candidate.materializedTermSenseId !== null) return 'accepted';
  if (candidate.suggestionStatus === 'in_progress') return 'pending';
  if (candidate.suggestionStatus === 'error') return 'error';
  if (effectiveBucket && effectiveText) return 'ready';
  return 'pending';
}
```

Only "ready" candidates can be selected/accepted.

### 6) API error mappings

New error codes:

- `ALREADY_ACCEPTED`: Candidate already materialized (409)
- `CANDIDATE_NOT_READY`: Missing effective bucket or text (400)
- `SUGGESTION_IN_PROGRESS`: Suggestion still generating (400)

## Consequences

### Positive

- Granular control over batch processing
- Consistent UI patterns with bucket feed table
- Bulk operations without losing individual precision
- Clear visual status for each candidate

### Negative / risks

- More API surface (1 new endpoint)
- Sequential bulk processing may be slow for large selections
- UI complexity increases with selection state management

## Alternatives considered

- Inline accept buttons per candidate row: rejected (doesn't scale for bulk operations, inconsistent with existing table patterns)
- Accept via PATCH on candidate: rejected (command-style endpoint is clearer for stateful transition)
- Parallel bulk accept API: deferred (sequential is simpler and sufficient for v1)

## Approved implementation checklist

### API (Workers + D1)

- [x] Add `POST /api/candidate/:id/accept` endpoint with idempotency
- [x] Add `requireCandidateOwned` shared query helper
- [x] Add `acceptCandidate` usecase with Term/TermSense materialization
- [x] Add new error codes: `ALREADY_ACCEPTED`, `CANDIDATE_NOT_READY`, `SUGGESTION_IN_PROGRESS`
- [x] Add `accept_candidate` to IdempotencyScope

### Web (SPA)

- [x] Create `CandidateTable` component (TanStack React Table)
- [x] Create `candidate-columns.tsx` with column definitions and status helpers
- [x] Create `CandidateBulkActionBar` component
- [x] Create `CandidateDetailSheet` component
- [x] Add `acceptCandidate` client API function
- [x] Update `BatchDetailPage` to use new table-based UI
- [x] Wire row selection state and bulk accept handler

### Verification

- [x] `pnpm -r --if-present typecheck`
