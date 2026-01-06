# Append

`append` is the concept that builds on top of eng-log.

## Development Setup

First-time setup (including git worktrees):

```bash
pnpm setup
```

This will:
1. Install dependencies
2. Initialize the local D1 database with migrations

Then start the development servers:

```bash
pnpm dev
```

This runs both the API (http://localhost:8787) and Web (http://localhost:5173) servers in parallel.

## Deployment (Cloudflare)

- API (Workers): `pnpm deploy:api`
- Web (SPA): deploy `packages/web` to Cloudflare Pages (ADR `docs/adr/0004-spa-hono-workers.md`)
  - Git-based Pages build: build output is `packages/web/dist`
  - CLI upload: `pnpm --filter @append/web build` then `wrangler pages deploy packages/web/dist --project-name @append/web`

## Secrets management

Secrets are managed via Cloudflare's native tooling:

- **Local dev**: `.dev.vars` in `packages/api/` (gitignored)
- **Production**: `wrangler secret put <NAME>` (stored in Cloudflare)

Required secrets for auth:

```bash
cd packages/api
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put BETTER_AUTH_SECRET
pnpm wrangler secret put BETTER_AUTH_URL      # https://api.append.tindev.dev
pnpm wrangler secret put ALLOWED_SUB          # or ALLOWED_EMAIL for bootstrap
```

See `docs/runbook.md` for detailed auth setup.

## Status

Canonical docs live in `docs/`:

- `docs/design.md`
- `docs/adr/README.md`

Supporting docs:
- `docs/runbook.md`

## Usecases

### Case1: Off-load the brain

"There're so many jargon technical terms. I couldn't keep up with it."

1. Add words (lots of them!)
2. Click a button
3. Get suggested descriptions and its category (bucket) for all of them
4. Accept/ Accept all
5. Done

### Case2: I'll explain this myself (if it is wrong)

"Here's what I learn. Let me condense my brain and understanding to explain it"

1. Add words
2. Go learn it
3. Comeback trying to explain it (aka. add descriptions)
   Note: the descriptions could be either of all of these five forms
   1. AHA one-liner
   2. Analogy
   3. Pseudocode
   4. Actual code (this one tricky. request for further discussion)
   5. Vocal explanation (require transcription)
4. See feedback by checking if the explanation is correct or not

## Reference

- eng-log (legacy format contract): https://github.com/tindotdev/eng-log

## Case3: Open in ChatGpt or Claude

Please educate me and explain what does {term} mean in simple terms with real-world examples.
Please add a funny memorable anology if that helps.

### Example from Prisma documentation

Intent question:

```
Read https://prisma.io/docs/getting-started/ so I can ask questions about it.
```

Claude Example:
<https://claude.ai/new?q=Read%20https://prisma.io/docs/getting-started/%20so%20I%20can%20ask%20questions%20about%20it>.

Open AI Example:
<https://chatgpt.com/?q=Read+https%3A%2F%2Fprisma.io%2Fdocs%2Fgetting-started%2F+so+I+can+ask+questions+about+it>.
<https://chatgpt.com/?prompt=Read+https%3A%2F%2Fprisma.io%2Fdocs%2Fgetting-started%2F+so+I+can+ask+questions+about+it>.

Note: the `q` is changed to `prompt` in the OpenAI example
