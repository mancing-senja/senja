# NPC Activity — v3

Senja's NPC activity layer is split so the world can feel alive without making every autonomous action an AI request.

## v3A — autonomous fishing

Selected villagers can cast, wait, reel, and record a recent catch while their schedule says fishing makes sense. Their visible intent can be phrased by Agnes when the player is nearby, but the fishing simulation itself is deterministic game logic.

## v3B — shared-farm help

Wahyu can help with the central shared farm during his kebun schedule. He looks for the nearest crop that is already planted and still needs water, walks to the bed, faces it, performs the existing `tend` animation, and then submits the same `plot: water` operation used by players.

Safety rules for shared crops:

- NPCs may water an already-planted crop.
- NPCs do not till player plots.
- NPCs do not spend player seeds or plant on the player's behalf.
- NPCs do not harvest player crops.
- NPCs do not sell player produce.
- Rain takes priority over manual NPC watering.
- Conversation and night schedules take priority over autonomous farm work.

Online plot mutation remains authoritative on the room server. The water operation is idempotent, so multiple clients observing the same farmer cannot apply watering twice.

## Thought crowd pacing

Nearby intent thoughts use one shared queue. Only one ordinary NPC inner-thought bubble is visible at a time, followed by a short quiet beat before the next villager. The client keeps at most one visible thought and one prepared thought, which avoids both visual noise and bursty Agnes usage in crowds.

Concrete reactions to something that just happened, such as an NPC landing a fish, are allowed to appear immediately.
