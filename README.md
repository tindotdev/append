# Append

`append` is the concept that builds on top of eng-log.

## Quick Start

```bash
just setup  # First-time setup: deps, secrets, migrations
just dev    # Start development servers
just help   # Show all available commands
```

See `docs/runbook.md` for detailed setup and operations.

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
