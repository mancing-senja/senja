# NPC AI provider

NPC conversation generation runs only on the server through `/api/npc-talk`.
Nearby NPC intent thoughts use the separate lightweight `/api/npc-thought` route.
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
stable structured JSON over deep reasoning.

## Request budget

The Starter-plan planning ceiling is treated as 1,500 text requests per five
hours and 15,000 per week. Senja therefore does **not** ask Agnes to run every
NPC continuously.

Daily schedules, movement, fishing decisions, cast/reel state, catch rolls and
world simulation remain deterministic. AI is used in two places:

1. player-triggered NPC conversation through `/api/npc-talk`;
2. one short intent thought when a relevant NPC is actually near/on-screen.

Lazy thought rules:

- only rendered NPCs close to the local player are eligible;
- one generated thought is cached per NPC + in-game day + phase + intent;
- cached thoughts survive reloads in localStorage;
- thought requests are globally spaced by at least 1.2 seconds in one client;
- a thought request has **no provider retry**; failure falls back to the local
  deterministic thought for that session;
- the local cache is capped so old development sessions do not grow forever.

This changes the worst case from "23 NPCs call AI every phase" to "only NPCs
the player actually encounters call AI". With three encountered NPCs per phase,
a five-hour session is roughly 180 thought requests rather than 1,380, before
conversation traffic. Actual usage depends on exploration and reload patterns.

A normal successful conversation turn costs one provider request. Conversation
5xx/timeouts may retry once, so a failed turn can consume two attempts. Thought
requests deliberately do not retry.

## Failure behavior

Provider errors never make the game unplayable. Conversation requests retry
transient 5xx/timeout failures once and then fall back to the deterministic
local dialogue engine. Lazy thought requests fall back immediately without a
second Agnes call.

During the temporary repeat-NPC test mode, relationship persistence is paused so
repeated provider tests do not pollute NPC relationship data.

Do not commit API keys to this repository or expose them through client-side
Vite variables.
