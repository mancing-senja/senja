# NPC AI provider

NPC conversation generation runs only on the server through `/api/npc-talk`.
The browser never receives the provider API key.

## Default provider

Senja defaults to the OpenAI-compatible NaraRouter API:

- base URL: `https://router.bynara.id/v1`
- model: `deepseek-v4-flash-free`
- endpoint: `/chat/completions`

The Vercel deployment pins `SENJA_AI_MODEL=deepseek-v4-flash-free` in
`vercel.json`, so production does not use NaraRouter's automatic model routing.

Set this secret in the deployment environment:

```text
SENJA_AI_API_KEY=<provider secret>
```

`BYNARA_API_KEY` is also accepted as a convenience alias.

## Optional configuration

```text
SENJA_AI_PROVIDER=NaraRouter
SENJA_AI_BASE_URL=https://router.bynara.id/v1
SENJA_AI_MODEL=deepseek-v4-flash-free
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
engine. NPC cooldown and persistent relationship memory continue to work.

Do not commit API keys to this repository or expose them through client-side
Vite variables.
