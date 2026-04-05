# DnD System TODOs

## Dax Campaign - Character Detail
Flesh out full D&D-style character sheets for Dax, Chen, and Dr. Yuen. Currently only basic stats (abilities, HP, credits, a few skills). Need:
- Proficiency bonus displayed in UI
- Full skill list with calculated modifiers (ability mod + proficiency where applicable)
- Saving throw proficiencies
- Detailed equipment with properties (not just names)
- Character traits/flaws/bonds/ideals
- Any expertise vs. proficiency distinctions clarified
- Consistent modifier math between campaign-state.json and dm-prompt.md

## Plot Seeding System
Design a mechanism for the DM to have pre-determined plot anchors that resist player contradiction while still allowing narrative freedom.

**The problem:** Currently the DM is fully generative with plot direction. If the player never provides a solid answer to a mystery (e.g., "who's the leaker?"), the DM will either leave it dangling forever or invent something on the fly with no foreshadowing. Worse, if the player says something narratively nonsensical ("Chen was the traitor all along"), the DM will just accept it because it has no concept of what's been pre-established as "true."

**Possible approaches:**
- **Plot anchors as world facts**: Store "secret" world facts tagged with a `plot_seed` type that the DM receives but never reveals directly. E.g., `[PLOT_SEED] The information leak on Titan Station originates from Jonathan Park's compromised comms relay — he's not a traitor, but his outdated encryption was cracked by Weyland months ago.` The DM would weave clues toward this but never state it outright.
- **Contradiction guardrails**: If a player proposes something that conflicts with a plot seed, the DM should push back narratively rather than accepting it. "Chen as the traitor" should get a response like "That doesn't quite add up — Chen was with you every step of the way on the Wanderer..."
- **Flexible vs. locked seeds**: Some seeds could be "soft" (DM can adapt if the player's direction is better) vs. "hard" (canonical, must be true regardless).
- **Player-invisible prompt injection**: Plot seeds go into the system prompt but are explicitly marked as "DO NOT reveal directly — weave clues organically."

**Key design tension:** Player agency vs. narrative coherence. The player should feel like they're discovering the truth, not being railroaded, but the truth should actually exist before they discover it.
