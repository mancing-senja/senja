# NPC AI provider

NPC conversation generation runs only on the server through `/api/npc-talk`.
The browser never receives the provider API key.

## Provider

Senja uses the OpenAI-compatible NaraRouter API:

- base URL: `https://router.bynara.id/v1`
- endpoint: `/chat/completions`
- production model: selected through the Vercel environment variable `SENJA_AI_MODEL`

The model is intentionally **not pinned in `vercel.json`**. This keeps model
selection operational: changing models should only require editing the Vercel
environment variable and creating a new deployment, not changing application
source code.

Set these values in the Vercel project environment:

```text
SENJA_AI_API_KEY=<provider secret>
SENJA_AI_MODEL=muse-spark-1.2-contributor
```

`BYNARA_API_KEY` is also accepted as a convenience alias for the API key.

For the current test, use `muse-spark-1.2-contributor`. To test another model,
replace only the value of `SENJA_AI_MODEL` in Vercel and redeploy.

After adding or changing provider secrets/configuration in Vercel, create a new
production deployment so the updated environment is available to the running
serverless functions.

## Optional configuration

```text
SENJA_AI_PROVIDER=NaraRouter
SENJA_AI_BASE_URL=https://router.bynara.id/v1
SENJA_AI_MODEL=muse-spark-1.2-contributor
```

For another OpenAI-compatible router, change `SENJA_AI_BASE_URL`,
`SENJA_AI_MODEL`, and the key. If a provider exposes an unusual exact Chat
Completions path, set `SENJA_AI_CHAT_URL` to the complete endpoint instead.

The provider request uses OpenAI Chat Completions format and asks for low
reasoning effort because NPC dialogue values latency over deep reasoning.
Providers that ignore `reasoning_effort` can still be used.

## Failure behavior

Provider errors never make the game unplayable. The client catches a failed
`/api/npc-talk` request and falls back to Senja's deterministic local dialogue
engine.

During the temporary repeat-NPC test mode, relationship persistence is paused so
repeated provider tests do not pollute NPC relationship data.

Do not commit API keys to this repository or expose them through client-side
Vite variables.
