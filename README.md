# Append

`append` is the concept that builds on top of eng-log.

## Deployment (Cloudflare)

- API (Workers): `pnpm deploy:api`
- Web (SPA): deploy `packages/web` to Cloudflare Pages (ADR `docs/adr/0004-spa-hono-workers.md`)
  - Git-based Pages build: build output is `packages/web/dist`
  - CLI upload: `pnpm --filter append-web build` then `wrangler pages deploy packages/web/dist --project-name append-web`

## Secrets management

- secrets are managed by `doppler` and can be accessed using cli

## Status

Planning docs live in `docs/`:

- `docs/design.md`
- `docs/build-plan.md`
- `docs/vertical-slice.md`
- `docs/risk-register.md`
- `docs/adr/README.md`

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
   Note: the descriptions could be either of all of these five forms 1. AHA one-liner 2. Analogy 3. Pseudocode 4. Actual code (this one tricky. request for further discussion) 5. Vocal explaination (require transcription)
4. See feedback by checking if the explanation is correct or not

## Reference

- eng-log: /mnt/68ce8b89-5b49-4f3f-857c-8c9edca5b28e/code/github/eng-log/README.md
