# NPC Activity — v3 to v5

Senja's NPC activity layer is split so the world can feel alive without making every autonomous action an AI request.

## v3A — autonomous fishing

Selected villagers can cast, wait, reel, and record a recent catch while their schedule says fishing makes sense. Their visible intent can be phrased by Agnes when the player is nearby, but the fishing simulation itself is deterministic game logic.

## v3B — farming

Wahyu can help with the central shared farm during his kebun schedule. He looks for the nearest crop that is already planted and still needs water, walks to the bed, faces it, performs the existing `tend` animation, and then submits the same `plot: water` operation used by players.

Ki Lengan has a separate private garden loop in Rimbun Cahaya. His tending is world activity only and never mutates player-owned plots.

Safety rules for shared crops:

- NPCs may water an already-planted crop.
- NPCs do not till player plots.
- NPCs do not spend player seeds or plant on the player's behalf.
- NPCs do not harvest player crops.
- NPCs do not sell player produce.
- Rain takes priority over manual NPC watering.
- Conversation and night schedules take priority over autonomous farm work.

Online plot mutation remains authoritative on the room server. The water operation is idempotent, so multiple clients observing the same farmer cannot apply watering twice.

## v4 — activity memory and gossip

Concrete autonomous actions can become first-hand `activity` memory. Fishing catches and sustained farming work are recorded only after the action actually appears in the world.

When two NPCs are physically near each other, one recent first-hand activity may become a `gossip` memory for the listener. Gossip is one-hop only: a received rumour is never used as the source of another rumour. Both activity and gossip have lower memory weights than promises, rare catches, and relationship events.

The activity/gossip system itself does not call Agnes. Those memories become language context only when a player-triggered conversation or the existing nearby-thought layer needs language.

## v5 — emergent behavior from memory

v5 closes the loop from memory back into action instead of using memory only as dialogue context.

Two first behaviors are intentionally small and deterministic:

- **Repeat success while fishing.** A notably good first-hand fishing memory from today or yesterday can extend one fisher's next session into one adjacent phase they normally skip. The effect expires quickly and rain still cancels fishing.
- **Social curiosity from gossip.** A listener may decide, based on personality plus a stable day/phase roll, to approach the original NPC named in a gossip memory. The detour only happens outdoors, within a plausible nearby radius, and never overrides conversation, farming, active fishing, or rain behavior. Once close, the listener pauses briefly and faces the source.

The social detour leaves a short factual emergent context for the next conversation, such as having just sought someone out to ask about a rumour. It is not automatically promoted to another persistent gossip source, which prevents recursive information cascades.

No frame-by-frame movement is delegated to Agnes. The model remains a language layer rather than an autonomous world controller.

## Thought crowd pacing

Nearby intent thoughts use one shared queue. Only one ordinary NPC inner-thought bubble is visible at a time, followed by a short quiet beat before the next villager. The client keeps at most one visible thought and one prepared thought, which avoids both visual noise and bursty Agnes usage in crowds.

Concrete reactions to something that just happened, such as an NPC landing a fish, are allowed to appear immediately.

## Manual verification

For v3B, plant a crop in the central shared farm, leave it unwatered, then watch Wahyu during a kebun schedule. He should walk to the nearest dry planted bed, perform the `tend` animation, and the shared plot should become watered without consuming seeds or harvesting the crop.

For v5 fishing memory, a qualifying large catch should allow the relevant fisher to continue into their configured bonus phase on the same or following game day. For social curiosity, let an activity owner and another NPC exchange gossip; an eligible listener may briefly follow or remain with the source instead of immediately resuming their authored route.
