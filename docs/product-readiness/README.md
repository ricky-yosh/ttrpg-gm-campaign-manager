# Product readiness: TTRPG GM campaign manager

Status: **documentation-only assessment**. This run inspected the documented
product, the React/Tauri desktop app, the headless Rust/Turso core and CLI, and
the tests. It did not implement or fix product behavior.

> **Implementation update after this assessment.** The recommended core/CLI
> session-persistence slice has since been implemented: database version 8 adds
> `session_record`, and `session.list`/`get`/`create`/`update` persist session
> details, ordered beats, prep/running notes, recap, and record references. The
> desktop Sessions UI remains memory-only and has not been migrated. The gap
> statements below describe the pre-implementation baseline; see
> [Sessions](../sessions.md#headless-persistence) for the current core/CLI
> contract.

## Inspection baseline

Git revision `f0c997b` (`Add headless campaign persistence workflows`). The
worktree was already dirty before this run: the CLI source/manifest/tests, the
shared campaign assets/repository/storage modules, `docs/headless-development.md`,
and `goal.md` were modified. Those changes were not edited, reverted, or cleaned
up here. All top-level documents in `docs/` were read, plus `AGENTS.md`, the
desktop frontend, shared campaign module, CLI, and tests. Toolchain: Rust
1.99.1, Node 26.12.1, pnpm 12.6.0; no CodeGraph index was present.

Verification actually run: `cargo test --workspace --locked` (21 core + 13 CLI
journeys + 3 CLI unit tests), `cargo test --workspace --all-features --locked`
(52 core + 13 + 3), desktop `cargo test --manifest-path ... --locked` (6 image
tests), `pnpm lint`, `pnpm test` (63), and `pnpm build` all pass. A real CLI
journey used a temporary package: create, author records, save, terminate,
reopen, inspect, and reject a stale write. `git diff --check` passed on the
inspected tracked changes; the three new reports were separately scanned for
trailing whitespace. Not verified: interactive desktop GUI, a real second-display
player window, multi-OS packaging, crash recovery, Rune, and network denial.
Test names alone were not treated as proof; the source paths and tests actually
run are cited in the [workflow inventory](workflow-inventory.md).

## What a GM can accomplish today

**Desktop.** A GM can create or open a portable `.campaign` package, author and
save NPC dossiers (Plate notes, portrait, banner, token, player description,
private GM reference, statblock, and NPC/location/faction links), locations with
a parent tree and associations, faction basics, an item catalog with typed
custom fields, party inventory, story threads, and maps with images, location
pins, a party marker, and map-to-map pin destinations. Workspace tabs, splits,
Back/Forward history, scroll state, and sidebar state restore with the campaign.
Images are converted to WebP by Rust and stored as content-hashed assets. The
desktop player window can show an allowlisted NPC card or party inventory, with
Play, Pause, Resume, and Stop.

**CLI/core.** Through JSON-RPC a GM or agent can create/open/save campaigns,
author the same persistent record types, import encoded PNG/JPEG/WebP assets,
and use a campaign-wide in-memory edit history. Storage is real embedded Turso
with revision checks, asset verification, v1–v7 reads, v7 writes, and structured
errors. The CLI runs independently of the desktop, has no autosave, and discards
unsaved work at EOF.

## The most consequential gaps

1. **Game sessions are a memory-only prototype.** Prep, story beats, running
   notes, quick captures, player summaries, and their links reset on reload or
   campaign replacement. Session tabs are stripped from saved workspace state.
   The CLI has no session actions and the schema has no session table, so the
   central prepare/run/review workflow cannot be completed.
2. **Player-safe presentation is narrow and lacks player knowledge.** Only an
   NPC card and inventory are projectable; factions, locations, items, threads,
   and maps are not. Any NPC can be presented regardless of whether the party
   knows them; `partyKnowledge` is only an authoring field and faction "known"
   state is prototype-only. `campaign.inspect` is explicitly GM-only.
3. **Relationships have competing representations and no lifecycle.** NPC links,
   location association lists, thread links, and the faction chart can describe
   the same relationship differently. There are no computed backlinks and no
   deletion/archive path for NPCs, locations, factions, or threads.
4. **Rich-note authoring is incomplete.** Plate JSON and existing image nodes
   round-trip, but the current editor has no image-insertion affordance and does
   not register the installed column plugin, despite documented inline-image and
   column requirements.
5. **The map is an authoring atlas, not a play surface.** Fog, tokens, grids,
   measurement, initiative, visits, and player-visible map state do not exist.
6. **Recovery and release operations are not production-grade.** Save As exists,
   but there is no verified Save Copy/backup, ZIP export, crash recovery, asset
   cleanup, or durable edit history. The documented backup is a manual folder
   copy.

## Recommended next bounded implementation goal

**Persist one complete game-session workflow: prep, story beats, running notes,
recap, and stable links to existing records.**

The current app is a strong collection of record editors, but the organizing
object is transient. A saved session record is the smallest slice that makes the
prepare/run/review outcome real. This is evidence-based, not assumed: the
alternative "canonical relationships + archive/backlinks" reduces contradictory
data but leaves the central session workflow unavailable, while a player-safe
projection is a running-safety prerequisite that still depends on the unresolved
knowledge model (D2) and does not make prep/review durable.

Bounded scope: session metadata, ordered beats, private prep/running notes, a
player summary, links to existing NPC/location/faction/story-thread records,
desktop draft/commit/cancel, CLI list/get/create/update with stale-revision
rejection, and a v8 storage migration preserving v1–v7 packages. Non-goals:
player playback/projections, Rune, visits, encounters, tokens/fog/initiative,
puzzles, bestiary, crafting, loot/media, and a full relationship-model rewrite.
If D3 cannot be settled in time, use one-way session-owned links first and defer
backlinks.

**D1** (session persistence) blocks the goal; **D3** (relationship ownership and
lifecycle) bounds it. **D2/D6** (player knowledge and presentation) do not block
saving and reviewing sessions but block running a player-facing one. **D4**
(backup/recovery) and **D5** (rich-note parity) must be stated as limitations
rather than claimed complete. The prior acceptance map's recommended next goal
("presentation/player-safety") is a previous scope, not an adopted decision.

## Decisions requiring review

- **D1** — Should a game session become a first-class saved campaign object?
- **D3** — Which record owns a relationship, and what happens on rename,
  archive, or delete?
- **D2** — What does "known to players" mean, and when does content become
  player-visible?
- **D4** — What backup/recovery guarantee is required before saved campaigns are
  relied on for session prep?
- **D5** — Must the first release meet the full rich-note requirement?
- **D6** — What is the first playable presentation scope, and must it survive
  Stop or restart?

All recommendations are marked **not approved** in [decisions.md](decisions.md).

## Reports

- [Workflow inventory](workflow-inventory.md) — preparing, running, and
  reviewing journeys, current desktop/CLI behavior, persistence, evidence,
  gaps, and candidate acceptance journeys.
- [Decisions](decisions.md) — unresolved product questions with options,
  recommendations, and impact.

**Stop here for human review.** This run does not authorize implementation.
