# NPC Visible Activity Pass

This note records the activity-first NPC pass merged in PR #62.

The goal is simple: an NPC feature only counts if a player can actually observe it in the world. The activity layer therefore runs after schedule/farming decisions and before gossip observation so visible work is what becomes memory/context.

Current visible rules:
- Wahyu owns two community farm beds and may till, plant, water, and harvest those beds using NPC stock; he never consumes player seeds or harvests player-owned crops.
- Autonomous fishing sessions are finite: a fisher catches only 1–2 fish per phase, then packs up and moves into a rest/work state until a later eligible phase.
- Worker NPCs hold concrete work blocks for roughly 10–30 seconds instead of continuously pacing their route.
- Lazy Agnes thoughts receive the concrete visible activity for that frame rather than only the broad schedule goal.

Production verification checklist:
1. Visit an initially empty community farm and observe Wahyu create/maintain crops without player input.
2. Observe Mbah Tarno through 1–2 catches and confirm that he stops fishing afterward.
3. Observe non-fishing workers and confirm they spend meaningful time working/guarding/tending rather than pacing continuously.
