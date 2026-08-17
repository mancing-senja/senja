# Lazy AI thoughts

NPC thought bubbles are intentionally *lazy*. The simulation decides what an NPC is doing; Agnes only rewrites that intent into a natural first-person thought when the NPC is close enough to matter to the current player.

The renderer supplies the local player position and visible NPC metadata to `ai-thoughts.ts`. This means off-screen NPCs cannot spend AI requests. Results are cached by NPC/day/phase/intent and reused on later visits or reloads.

Fishing reactions such as a fresh catch stay deterministic and take priority over a cached intent thought, because they represent an immediate world event rather than a background plan.
