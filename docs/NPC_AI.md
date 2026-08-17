# NPC AI provider

NPC conversation generation runs only on the server through `/api/npc-talk`.
The browser never receives the provider API key.

## Provider

Senja uses the OpenAI-compatible Agnes AI Chat Completions API:

- base URL: `https://apihub.agnes-ai.com/v1`
- endpoint: `/chat/completions`
- default model: `agnes-2.5-flash`
- production model: selected through the Vercel environment variable `SENJA_AI_MODEL`

The model is intentionally **not pinned in `vercel.json`**. This keeps model
selection operational: changing models should only require editing the Vercel
environment variable and creating a new deployment, not changing application
source code.

Set these values in the Vercel project environment:

```text
SENJA_AI_API_KEY=<Agnes API key>
SENJA_AI_MODEL=agnes-2.5-flash
```

`AGNES_API_KEY` is also accepted as a convenience alias for the API key. The
legacy `BYNARA_API_KEY` alias remains accepted only so an old local setup does
not break abruptly; production should use `SENJA_AI_API_KEY`.

After adding or changing provider secrets/configuration in Vercel, create a new
production deployment so the updated environment is available to the running
serverless functions.

## Optional configuration

```text
SENJA_AI_PROVIDER=Agnes AI
SENJA_AI_BASE_URL=https://apihub.agnes-ai.com/v1
SENJA_AI_MODEL=agnes-2.5-flash
```

For another OpenAI-compatible provider later, change `SENJA_AI_BASE_URL`,
`SENJA_AI_MODEL`, and the key. If a provider exposes an unusual exact Chat
Completions path, set `SENJA_AI_CHAT_URL` to the complete endpoint instead.

The provider request uses OpenAI Chat Completions format. Senja does not enable
Agnes Thinking mode for NPC dialogue because this path values low latency and
stable structured JSON over deep reasoning. The request uses a moderate
temperature and a small output budget appropriate for one NPC turn.

## Failure behavior

Provider errors never make the game unplayable. The server retries transient
5xx/timeout failures once, and the client falls back to Senja's deterministic
local dialogue engine if the provider still fails.

During the temporary repeat-NPC test mode, relationship persistence is paused so
repeated provider tests do not pollute NPC relationship data.

Do not commit API keys to this repository or expose them through client-side
Vite variables.
