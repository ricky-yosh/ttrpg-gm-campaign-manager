# Headless campaign-authoring acceptance map and run plan

Status: **Approved; Phase B implemented and verified on 2026-11-07.** This
document is the durable acceptance map for the headless campaign-authoring run
described in [goal.md](../goal.md). The baseline evidence table below records the
pre-implementation state at commit `b187289`; the Phase B results section at the
end records the implemented capabilities and current checks.

Status labels used throughout:

- **Confirmed** — an explicit product decision or documented implemented
  behavior. It constrains the core contract unless superseded by the confirmed
  headless direction.
- **Proposed** — a design proposal, prototype, or recommendation that still
  needs approval.
- **Unresolved** — the documents explicitly leave the behavior open.
- **Superseded** — an earlier technology or architecture choice replaced by the
  confirmed headless direction. The *product behavior* may still be required.
- **Future** — explicitly deferred product work, not part of this run.

The confirmed direction in goal.md takes precedence over older React/Tauri
architecture proposals. Product requirements in the feature documents remain
sources for behavior; React state ownership, Zustand navigation, Tauri command
shape, and a React-based final shell are not constraints on the target core.

## Baseline evidence (before implementation)

| Check | Result |
| --- | --- |
| `cargo build --workspace --locked` | **Fails.** 19 errors: `campaign/mod.rs` includes Tauri-only `commands.rs` and `rusqlite`-only `migrations.rs` in the core; the item/thread model added in `b187289` was not propagated to `session.rs`/`storage.rs`; `CampaignItem`/`ItemFieldDefinition` lack `Clone`; `migrations.rs` has a duplicated `.map_err` syntax error. |
| `cargo test --manifest-path ttrpg-gm-cm-app/src-tauri/Cargo.toml --locked` | **Fails** for the same shared-core compile errors. |
| `pnpm test` (app) | **63 tests pass.** |
| `pnpm lint` (app) | **Passes** with no output. |
| Turso pin | `Cargo.lock` pins `turso 0.8.0`; the workspace lockfile is committed. |

Files inspected: `crates/campaign-core`, `crates/campaign-cli`,
`ttrpg-gm-cm-app/src-tauri/src/campaign/*`, `ttrpg-gm-cm-app/src/lib/*`,
`ttrpg-gm-cm-app/tests/*`, and every top-level document in `docs/`.

The broken baseline is itself a blocking finding: the capability ledger in
[headless-development.md](headless-development.md) describes a green slice that
the current tree no longer builds. Restoring a green, tested baseline is slice 0
of this plan, not a broad refactor.

## Authority and interpretation rules

1. **Confirmed direction** (goal.md): UI-independent Rust core; embedded Turso
   Database (Rust engine, not Turso Cloud/libSQL); JSON-RPC over stdio plus a
   machine-readable CLI; independent headless CLI sessions; preserve campaign
   data and format; keep the React/Tauri app as reference; build Rune later.
2. **Confirmed product requirements** come from the feature documents:
   NPC dossier + private/public separation, locations, factions, inventory,
   items, maps/atlas, story threads, rich note documents, hashed campaign
   assets, campaign-edit undo/redo, and player-safe projection as a principle.
3. **Current implementation is evidence, not specification.** Where the current
   code and documents disagree, the documents win unless the confirmed headless
   direction supersedes them.
4. **Prototype-only behaviors are not automatically saved contracts.**
   Session notes are explicitly memory-only. Faction organization charts,
   workspace state, and presentation Live/Next are current desktop behavior but
   their headless contracts are separate decisions.
5. **One core.** The CLI/JSON-RPC adapters must dispatch typed actions to the
   core session; they must not write SQLite or duplicate validation.

## Acceptance map

Each workflow lists: source, status, current evidence, missing work,
classification, and the public-contract journey that will prove it.

> **Phase A baseline.** The per-workflow "Current evidence" and "Missing work"
> entries below record the assessment made before implementation. The
> **Phase B results** and **Evidence log** at the end of this document are the
> authoritative record of what was delivered and verified.

### 1. Campaign lifecycle: new, open, inspect, save, switch

- **Sources:** [headless-core-plan](headless-core-plan.md) §Protocol and process
  model (100–125), §Migration strategy (127–151); [headless-development](headless-development.md)
  §Implemented contract (73–88), §Sources and migration boundary (90–101);
  [backend-architecture](backend-architecture.md) §Current persistence prototype
  (15–39); goal.md engineering rules.
- **Status:** Confirmed for create/open/inspect/save/dirty-switch safety.
  Save Copy, backup, crash recovery, and autosave are Proposed/Future.
- **Current evidence:** `crates/campaign-cli/tests/journeys.rs` covers new,
  save, reopen, dirty-switch rejection, failed-open preservation, busy package
  rejection, stale revisions, and CLI exit status. `storage.rs` unit tests cover
  rollback and version rejection. The workspace currently does not compile.
- **Missing:** green baseline; database versions 6–7; a public-contract failed
  save/reopen journey; explicit format/version preservation evidence; better
  error context (step, expected/actual revision).
- **Classification:** Headless behavior for this run.
- **Acceptance journey:** fresh process → `campaign.new` → author records →
  `campaign.save` → terminate → new process → `campaign.open` → inspect all
  records → save again without loss. Reject empty name, stale revision, dirty
  switch without `discardChanges`, failed open (preserves active campaign),
  future database version, and an initial save over an existing folder.

### 2. NPC authoring: identity, rich notes, dossier, presentation

- **Sources:** [npc-presentation-design](npc-presentation-design.md) §Current
  implementation (9–25), §NPC dossier content (27–44), banner/portrait (46–64),
  statblock (66–74), GM authoring (76–95); [data-model](data-model.md)
  §Visual notes (55–72), §Statblock field sets (74–95);
  [headless-development](headless-development.md) §Implemented contract (73–88).
- **Status:** Confirmed for one NPC record per character with Plate notes,
  private GM reference, separate player description, banner/portrait/token
  assets, ruleset-tagged statblock, and directional relationships. Live
  presentation of NPCs is Future for this run.
- **Current evidence:** Headless `npc.create/update/list/undo/redo` and per-NPC
  history journeys; shared structs/validation persist all presentation fields;
  desktop tests cover saved presentation and image round trips.
- **Missing:** headless input for presentation (banner, portrait, player
  description, GM reference, statblock, token, relationships, location and
  faction links); creation history; player-safe projection is intentionally not
  in this run.
- **Classification:** Headless behavior for this run (authoring only).
- **Acceptance journey:** create NPC with Plate note containing an unknown/custom
  node and an image; update name, notes, player description, portrait/banner,
  statblock field set/version/data, and relationships; reject empty name, invalid
  image type, self-link, duplicate link, and malformed note; no-op update leaves
  revision/history unchanged; save, reopen in a fresh process, verify every field
  and asset.

### 3. Locations: hierarchy, dossier, links

- **Sources:** [locations](locations.md) all; [maps-locations-design-brief](maps-locations-design-brief.md)
  §Relationship rule (53–59), §Location page proposal (61–99); [data-model](data-model.md)
  core objects (22–25).
- **Status:** Confirmed for saved location records with name, optional parent,
  type, tags, party knowledge, banner, scene image, public description,
  structured GM reference, private notes, NPC/faction association fields, and
  map attachments/placements. Location deletion and player presentation are
  Future.
- **Current evidence:** Shared validation rejects duplicate IDs/names, invalid
  party knowledge, cycles, missing parents, and duplicate NPC links; repository
  tests cover hierarchy, images, links, map attachments, moved packages, and v1
  upgrade. Headless exposes none of it.
- **Missing:** headless list/get/create/update, hierarchy input, image handling,
  NPC location links through NPC presentation, map attachment preservation.
- **Classification:** Headless behavior for this run.
- **Acceptance journey:** create region → city child → tavern grandchild; list
  with parents; reject a cycle, missing parent, invalid party knowledge, and
  duplicate link; attach an existing map and place a pin; save, reopen, verify
  hierarchy/images/links and unchanged records.

### 4. Factions: saved records and NPC affiliations

- **Sources:** [factions](factions.md) all; [npc-presentation-design](npc-presentation-design.md)
  §NPC relationships (19–25); [data-model](data-model.md) (23).
- **Status:** Confirmed for name, image, description, private GM notes, and
  directional NPC→faction links with optional labels. Organization charts,
  hierarchy editing, deletion, and player presentation are Proposed/Future.
- **Current evidence:** Shared validation and repository tests cover faction
  record validation, NPC links, images, duplicate links, and v2 upgrade. Headless
  exposes none of it.
- **Missing:** headless CRUD and NPC faction-link input.
- **Classification:** Headless behavior for this run.
- **Acceptance journey:** create faction; link two NPCs with different labels;
  reject duplicate target and empty name; save/reopen and verify links resolve
  by ID and labels survive; deleting/replacing an NPC link is not attempted
  because deletion is not a confirmed NPC operation.

### 5. Party inventory

- **Sources:** [inventory](inventory.md) all; [data-model](data-model.md) (29–30).
- **Status:** Confirmed for one saved party inventory with nonnegative whole gold
  and entries (name, kind item/material, positive whole quantity, optional public
  note). Character inventories, transfers, item links, and player presentation
  are Future for this run.
- **Current evidence:** Shared validation and repository tests cover valid
  round-trip, invalid gold/quantity/name/kind, duplicate IDs, v3 upgrade, and
  invalid-save preservation. Desktop tests cover the player-safe inventory
  snapshot. Headless exposes none of it.
- **Missing:** headless get/update with atomic validation.
- **Classification:** Headless behavior for this run.
- **Acceptance journey:** set gold and entries; reject negative/fractional gold,
  zero/negative quantity, empty name, invalid kind, duplicate IDs; verify
  rejection changes nothing; no-op update adds no history; save/reopen.

### 6. Item catalog and custom fields

- **Sources:** [items](items.md) all; [data-model](data-model.md) (28–29);
  goal.md default scope (inventory, notes/assets).
- **Status:** Confirmed saved catalog in SQLite v7, including field definitions
  and typed values; no built-in rarity/tier; definitions are separate from item
  values; only adding definitions is confirmed, while editing/deleting
  definitions, templates, imports, and player presentation are Future.
- **Current evidence:** Desktop tests cover name-only creation, atomic saves,
  sorting/formatting, duplicate definitions, and draft isolation; repository
  tests cover v7 table, assets, invalid values, duplicate IDs, v6 upgrade, and
  invalid-save preservation. The shared core no longer compiles; the Turso
  adapter cannot read v7.
- **Missing:** Turso v7 load/save; headless list/get/create/update/delete with
  the same value/field validation; item creation/deletion history.
- **Classification:** Headless behavior for this run. Included because it is an
  existing saved record type and required for v6–v7 compatibility.
- **Acceptance journey:** create name-only item; add a text/number/checkbox/choice
  field definition and values; reject duplicate field IDs, duplicate choice
  labels, unknown field references, and wrong value types; reject duplicate item
  IDs; delete item with history; save/reopen; existing definitions and unrelated
  items survive.

### 7. Story threads

- **Sources:** [story-threads](story-threads.md) all; [data-model](data-model.md)
  (31); [sessions](sessions.md) (9, 19–21).
- **Status:** Confirmed saved dossiers with title, status, player reminder,
  origin/source label, two Plate note documents, and people/location/faction
  links. Deletion UI, backlinks, persistent thread-to-session links, and player
  presentation are Future. Session content is explicitly memory-only.
- **Current evidence:** Desktop tests cover draft isolation, validation, no-op
  saves, navigation, and missing targets; repository tests cover v6 table,
  assets, invalid statuses/documents/duplicate links, v5 upgrade, and
  invalid-save preservation. Turso cannot read v6.
- **Missing:** Turso v6 load/save; headless list/get/create/update; history for
  creation/updates.
- **Classification:** Headless behavior for this run. Included for existing
  saved-record compatibility; not an expansion into sessions.
- **Acceptance journey:** create idea/active thread; update all fields and links;
  reject empty title, invalid status, duplicate target, empty note document;
  verify missing targets are retained; save/reopen; thread images round-trip.

### 8. Maps: saved authoring data

- **Sources:** [maps](maps.md) §Implemented atlas (7–19), §Objects (29–38),
  §GM workflow (40–48), §Data and commands (76–84);
  [maps-locations-design-brief](maps-locations-design-brief.md); [data-model](data-model.md)
  (25–27, 38–39).
- **Status:** Confirmed saved map records with name, kind, image, dimensions,
  location attachments, pins (position, location, label, destination map), and
  optional party marker. Fog, tokens, initiative, visits, measurement, player
  visibility, and map presentation are Future. Map deletion is confirmed in the
  desktop; deletion clears incoming shortcuts but keeps locations.
- **Current evidence:** Desktop tests cover multiple placements, deletion
  clearing destination links, camera math, and map history; repository tests
  cover v5 table, assets, pin/link/position validation, moved packages, and v4
  upgrade. Turso loads maps but exposes no authoring.
- **Missing:** headless list/get/create/update/delete; pin/party operations;
  asset-backed map image; cross-record validation; deletion history.
- **Classification:** Headless behavior for this run (authoring data only, not
  playback).
- **Acceptance journey:** create map with image asset and location attachment;
  add pin to an existing location; move party marker; link a pin to another map;
  reject out-of-range coordinates, missing location, missing destination map,
  duplicate map IDs, zero dimensions; delete a map and verify incoming links are
  cleared while locations remain; save/reopen.

### 9. Supported relationships

- **Sources:** [npc-presentation-design](npc-presentation-design.md) (19–25);
  [locations](locations.md) (11, 15); [factions](factions.md) (17–21);
  [story-threads](story-threads.md) (13–15); [data-model](data-model.md) (35);
  [backend-architecture](backend-architecture.md) §Command model (139–142).
- **Status:** Confirmed for NPC→NPC relationships, NPC→location and
  NPC→faction links (one target per kind, optional label, missing targets
  retained), location hierarchy, map attachments/pins, and thread→record links.
  Generic `LinkRecords`/`UnlinkRecords`, archive-on-delete, and backlinks are
  Proposed/Future.
- **Current evidence:** Shared validation rejects empty/self/duplicate NPC
  relationship targets and duplicate links; missing targets are allowed. The
  desktop displays unavailable targets. Location/faction/thread link fields are
  part of the saved records.
- **Ambiguity:** NPC links, location `associatedNpcs`/`associatedFactions`, and
  the session-only faction organization chart can describe the same
  relationship from different sides. Recommendation: make the NPC-side link
  lists the canonical authored relationships for NPCs, keep location/thread
  link fields as thread/location-owned data, and do not expose the session-only
  faction chart as saved state. Preserve all existing fields on round-trip.
- **Missing:** headless input/validation for the canonical links.
- **Classification:** Headless behavior for this run, limited to the canonical
  link lists above.
- **Acceptance journey:** create NPCs A/B/C and a location/faction; link A→B with
  a label, A→location, A→faction, and a thread→A; reject A→A, duplicate targets,
  empty IDs; leave one missing target and verify it survives save/reopen;
  rename B and verify the link still resolves by ID.

### 10. Notes and assets

- **Sources:** [data-model](data-model.md) §Visual notes (55–72);
  [image-import](image-import.md) §Import flow (5–16), §Behavior (31–42),
  §Undo/redo (44–54); [backend-architecture](backend-architecture.md)
  §Campaign folder and image storage (153–166); [npc-presentation-design](npc-presentation-design.md)
  (46–64).
- **Status:** Confirmed for versioned Plate JSON, inline images with captions and
  columns, unknown-node preservation, immutable content-hashed assets in
  `assets/`, 10 MiB limit, format detection by bytes, and asset-reference
  consistency. WebP conversion and native file pickers are desktop/platform
  behavior; Turso backup/cleanup are Future.
- **Current evidence:** `transform_images` hashes data URLs, verifies existing
  assets, rejects external URLs/hash mismatches/missing files, and is applied to
  the whole campaign on Turso save/load. Repository tests cover note images,
  NPC banner/portrait/token, location/faction/map images, moved packages,
  missing/corrupt assets, and failed saves.
- **Missing:** Turso tests for item/thread images and all record types together;
  an explicit headless asset-import convenience; corrupt/missing asset errors
  through the public contract.
- **Classification:** Headless behavior for this run. Dedicated image conversion
  (PNG/JPEG→WebP, EXIF orientation) remains deferred platform work.
- **Acceptance journey:** import a small image via a record payload (and, if
  approved, `asset.import`); save; verify exactly one hashed asset; reopen in a
  fresh process with the package moved; corrupt or remove the asset and verify a
  structured storage error without changing the in-memory campaign; reject
  `data:`-free external URLs and >10 MiB payloads.

### 11. Campaign-edit history (undo/redo)

- **Sources:** [backend-architecture](backend-architecture.md) §Undo and redo
  (182–200), §Decisions to settle (195–200); [headless-core-plan](headless-core-plan.md)
  question 2 (173–175); [headless-development](headless-development.md)(86, 131);
  goal.md history rules.
- **Status:** Undo/redo is Confirmed as a product requirement. The current
  per-NPC, 100-entry, in-memory history is documented implemented behavior.
  Campaign-wide history and restart durability are Unresolved; the plan
  recommendation is below.
- **Current evidence:** `history.rs` implements field-diff entries, labels,
  cursor/redo truncation, external-change conflicts, no-op suppression, and
  clear-on-open; headless tests cover NPC edit/undo/redo and no-history after
  reopen. Creation/deletion and other record types are not undoable.
- **Recommendation (needs approval):** one core-owned, in-memory, bounded (100)
  labeled edit history per campaign session. Entries cover whole-record
  before/after snapshots for create/delete and field changes for updates, across
  NPCs, locations, factions, inventory, items, threads, and maps. Undo/redo is
  chronological across records; `npc.undo`/`npc.redo` remain compatibility
  endpoints backed by the same stream and reject when the latest entry is not
  that NPC. History clears on new/open and does **not** survive process restart.
  No-op/rejected actions add nothing. Local note typing, navigation, and
  presentation history are separate/not modeled in this run.
- **Classification:** Headless behavior for this run, subject to the policy
  decision below.
- **Acceptance journey:** create two record types; update one; undo in reverse
  order; redo; create then undo (record gone) then redo (record restored);
  delete an item/map then undo; no-op update adds no entry/revision; stale
  revision and invalid input add no entry; new edit after undo drops redo; new
  process starts with no history; save/reopen leaves the data (not history)
  intact.

### 12. Sessions and session notes

- **Sources:** [sessions](sessions.md) all; [story-threads](story-threads.md)
  (19–21); [data-model](data-model.md) (16–18).
- **Status:** Proposed/prototype only. `sessions.md` explicitly says session
  notes and tabs are memory-only, reset on reload, and include no backend
  changes. Session persistence is Unresolved/Future.
- **Current evidence:** Frontend-only Zustand tests (`session-notes`,
  `session-workspace`) pass; no Rust session type or table exists.
- **Missing:** persistence format, story beats, visits, presentation of session
  summaries, and backend actions — all Future.
- **Classification:** Out of scope for this run. The core must not accidentally
  persist or discard session prototype state, and the campaign format must not
  change for sessions.
- **Acceptance journey:** none this run. Documented as an explicit non-goal.

### 13. Player-safe presentation

- **Sources:** [player-presentation](player-presentation.md) all;
  [npc-presentation-design](npc-presentation-design.md) §Presenter and player
  window (97–105); [headless-core-plan](headless-core-plan.md) (125);
  [backend-architecture](backend-architecture.md) §Player-facing state (168–180);
  goal.md player-safety rules.
- **Status:** Confirmed as a safety principle: GM inspection and player-safe
  projections are different contracts; ordinary authoring must not publish;
  private fields must be excluded from player payloads, not hidden visually.
  Presentation playback, Live/Next/Pause, overlays, and Windows are Future for
  this run.
- **Current evidence:** Desktop `buildPlayerContent` emits an allowlisted NPC
  payload (name, player description, portrait) and a public inventory snapshot;
  tests cover frozen-while-paused behavior. Headless `campaign.inspect` is
  explicitly GM-only and must not be called player-safe.
- **Missing:** no headless player projection exists. This run must not add a
  half-contract or claim player safety.
- **Classification:** Core requirements identified only. **No player playback or
  player endpoint is included this run.** Document `campaign.inspect` as GM-only,
  and make authoring updates committed-only (never implicitly publish).
- **Acceptance journey:** none this run. A future journey must assert private
  notes, GM reference, statblocks, hidden links, and workspace state are absent
  from the player payload.

### 14. Workspace, navigation, and frontend/platform behavior

- **Sources:** [ui-ux](ui-ux.md) (5–38, 96–123); [backend-architecture](backend-architecture.md)
  §Workspace navigation (121–129); [headless-core-plan](headless-core-plan.md)
  (66–74); goal.md.
- **Status:** Dockview/Zustand navigation is the current desktop implementation
  (Proposed for the final Rune shell). Workspace restoration is Confirmed
  product behavior. Core-owned navigation/editor sessions are Proposed/Future.
- **Current evidence:** Desktop tests cover navigation history, panel
  restoration, session-tab pruning, and scroll/tab state; the shared `Campaign`
  schema persists `workspace`, `section`, and `sidebar` JSON. Turso loads/saves
  workspace state.
- **Missing:** headless navigation actions and editor sessions (deferred);
  Rune/tabs/splits (Future).
- **Classification:** Deferred frontend/platform work. The only requirement for
  this run is **lossless preservation** of existing `workspace`, `section`, and
  `sidebar` data through headless open/save, including unknown Dockview panels
  and navigation destinations.
- **Acceptance journey:** open a legacy package with workspace tabs/splits,
  navigation history, sidebar width/state, scroll positions, and an obsolete
  panel; save without authoring those fields; reopen and verify byte-equivalent
  JSON for unrelated workspace data (modulo `updatedAt`), while records changed
  by the test remain changed.

### 15. Compatibility, determinism, and operational safety

- **Sources:** [headless-core-plan](headless-core-plan.md) §Turso storage gate
  (84–98), §Validation (153–169); [headless-development](headless-development.md)
  (90–114); goal.md data/testing rules.
- **Status:** Confirmed requirements: pinned Turso, real storage, v1–v7
  compatibility, deterministic clocks/IDs, no blind retries, no unexpected
  network, failed operations leave state/history/persistence unchanged.
- **Current evidence:** Turso 0.8.0 pinned; package lock; rollback/FK/version
  tests; legacy SQLite↔Turso round trip for v5-era records; desktop regression
  suite. Not yet covered: v6/v7 through Turso, injected clock/ID, public-contract
  failed-save, comprehensive complex-record fixtures, and network denial.
- **Missing:** the work listed in the slices below.
- **Classification:** Headless behavior for this run.
- **Acceptance journey:** for each supported historical version, open a copy,
  verify representative complex records, save, reopen, and re-open with the
  legacy adapter; reject future versions and unsupported formats without
  modifying them. Use temporary directories only.

## Contradictions, gaps, and consequential ambiguities

1. **Docs claim a green headless slice; the tree does not build.** Resolution:
   slice 0 restores the baseline before adding capabilities. Do not rewrite the
   architecture as part of that fix.
2. **Turso supports only database versions 1–5, while the documented current
   format is v7.** This would make current campaigns unopenable by the headless
   host and risks dropping threads/items on save. Resolution: make the shared
   schema authoritative at v7, load/save `story_thread` and `item_catalog`, and
   test every version 1–7.
3. **`session.rs`/`storage.rs` omit `threads`, `items`, and `item_fields`,** so
   even a v5 open/save would silently drop the new collections. Resolution:
   treat preservation as mandatory; add round-trip tests that fail if any
   collection disappears.
4. **`commands.rs` and `migrations.rs` are compiled into the core.** Resolution:
   keep Tauri commands in the desktop adapter and `rusqlite` behind the
   `legacy-sqlite` feature; the core must build with no Tauri/rusqlite.
5. **Two relationship representations.** NPC links, location association lists,
   faction membership prototypes, and thread links can overlap. Resolution
   recommended above: NPC-side links are canonical for NPC relationships;
   location/thread-owned lists remain their record's data; do not persist the
   session-only faction chart. No silent synchronization between copies.
6. **History scope.** Per-NPC history is implemented; campaign-wide history is
   proposed. The plan recommends a single campaign-wide in-memory stream with
   NPC compatibility endpoints. This changes the desktop only when history
   contains multiple record types (which the desktop does not yet create).
7. **Items and story threads are not named in goal.md's default scope**, but
   they are current saved record types and v6/v7 compatibility is required.
   Resolution: include them for preservation and minimal CRUD, not as a broad
   feature expansion.
8. **`schemaVersion` (campaign JSON) stays 1 while database `user_version` is
   7.** This is existing behavior; do not conflate the two. Future campaign JSON
   changes require an explicit schema-version decision.
9. **Save Copy is explicitly unimplemented**, and the desktop docs require
   backup/Save Copy as a product need. Resolution: keep it out of this run and
   document that backups are still "copy the whole package after Save"; do not
   claim backup support.
10. **Asset import is desktop-only today**, while headless authoring needs
    assets. Resolution: accept base64 data URLs in record payloads and hash them
    on save exactly as the desktop does; optionally add `asset.import` for open
    packages. Do not claim WebP conversion in the core.
11. **Sessions are memory-only** and are not part of this run. Do not add a
    partial session table or persist transient frontend state.
12. **Player safety has no headless implementation.** Do not expose
    `campaign.inspect` as a player contract or add a "player" endpoint that leaks
    GM fields. Presentation playback remains deferred.
13. **Deletion is only confirmed for items and maps.** Do not invent deletion
    for NPCs, locations, factions, or threads; history covers the confirmed
    deletions and creation of included records.
14. **Workspace state is desktop-specific** but must survive headless round
    trips. Preserve it opaquely; do not normalize Dockview data in the core
    beyond existing legacy destination migration.

## Approved run scope

### In scope

A bounded campaign-authoring vertical slice through the public CLI/JSON-RPC
contract, on real Turso storage:

- campaign lifecycle: new, inspect, save, open, dirty-switch protection;
- asset ingestion through record payloads (and an `asset.import` convenience if
  approved);
- NPC authoring including the full saved dossier/presentation payload;
- locations with hierarchy and map attachments;
- factions with NPC affiliations;
- party inventory;
- item catalog with custom field definitions;
- story-thread dossiers and their record links;
- saved map authoring data: metadata, location attachments, pins, party marker,
  and deletion;
- a single core-owned edit-history stream with undo/redo for the included
  authoring actions;
- lossless preservation of workspace/navigation JSON, existing rich-note
  documents, assets, and all unrelated record fields;
- schema-version compatibility for v1–v7 packages;
- documentation of implemented behavior, evidence, limitations, and deferred
  work.

### Explicitly out of scope

Rune; replacing Plate/Dockview; deleting or migrating the React/Tauri app;
desktop attachment or remote control; network listeners; Turso Cloud,
replication, multiplayer; sessions/session notes; presentation playback,
Live/Next/Pause/player windows; player-safe projections; fog, tokens,
initiative, measurement, map presentation; bestiary, puzzles, crafting, loot,
video; WebP conversion/EXIF work in the core; Save Copy/backup/restore/crash
recovery; autosave; NPC/location/faction/thread deletion; statblock field-set
conversion or custom fields; generic plugin architecture; irreversible
operations on original campaigns; pushing/merging/publishing.

## Vertical slices and acceptance criteria

Each slice ends with: a public-contract journey, rejection/persistence coverage,
focused regression checks, and an acceptance-map/ledger evidence update.

### Slice 0 — Green baseline and v7 Turso compatibility (blocking)

Deliverable: the workspace builds without Tauri/rusqlite in the default core;
the core/store reflect the documented v7 format.

- Remove the unconditional `commands` module from the shared campaign module;
  keep `migrations`/`repository` behind `legacy-sqlite`; keep `commands.rs` in
  the desktop adapter.
- Fix the duplicated `migrations.rs` statement; make `schema.sql` authoritative
  for v7 (`story_thread`, `item_catalog`, `PRAGMA user_version = 7`).
- Add `Clone` to item types.
- Extend Turso `Storage::open/load/save` to versions 1–7, `threads`, `items`,
  and `item_fields`; keep whole-campaign asset transformation.
- Tests: default core builds; all-features builds; v1–v7 open; v7 save;
  legacy-SQLite→Turso→legacy round trip with threads/items/assets; unknown
  versions rejected; rollback/FK/lock tests still pass; desktop tests compile.

**Exit evidence:** `cargo build --workspace --locked` and
`cargo test --workspace --locked` pass; `--all-features` passes.

### Slice 1 — Session dependencies and campaign lifecycle hardening

Deliverable: deterministic campaign lifecycle with structured errors.

- Inject clock and ID source into `Session` (system implementations for the
  host, deterministic test implementations); keep the RPC surface free of
  injection controls.
- Standardize mutation errors to include the action, expected/actual revision,
  and structured `code`, without secrets.
- Validate `campaign.new` name; failed new/open preserves the active campaign,
  revision, history, and dirty state; failed save preserves in-memory state and
  the previous package.
- Public journeys: empty name, stale revision, dirty switch, failed open, failed
  initial save, busy package, unsupported version, and successful fresh-process
  reopen.
- Document that Save means transaction committed; all other success means
  applied in memory. No autosave; EOF discards unsaved work.

**Exit evidence:** lifecycle journeys pass through the real host; a failed
operation leaves `campaign.inspect` byte-identical to the prior state.

### Slice 2 — Core edit history

Deliverable: one bounded, labeled, in-memory history used by every included
mutation.

- Implement the approved history policy (recommended: chronological
  campaign-wide stream, 100-entry and 16 MiB serialized-change budget, field
  diffs for updates, record snapshots for create/delete, whole-scope snapshots
  for inventory).
- No-op actions do not bump revision or add entries; rejected actions change
  nothing; new edit after undo truncates redo; history clears on new/open and is
  not persisted.
- Expose `history.status`, `history.undo`, `history.redo`; keep
  `npc.undo`/`npc.redo` backed by the same stream.
- Tests: cross-record undo/redo order, creation/deletion undo/redo, no-op,
  stale conflict, external-change conflict, redo truncation, restart clears
  history, save/reopen retains data but not history.

**Exit evidence:** a public journey undoes and redoes a compound cross-record
sequence with labels and verifies state/revisions; a new process has no history.

### Slice 3 — NPC presentation authoring

Deliverable: full saved NPC dossier editing.

- Extend `npc.update` with optional `presentation` (banner, portrait, player
  description, GM reference, statblock field set/version/token/data,
  relationships/locations/factions) while preserving the existing
  name/notes conveniences.
- Validate trimmed names, note blocks, image kinds, statblock field set,
  self/duplicate relationship targets, and duplicate location/faction links.
- No-op update leaves revision/history unchanged; rejection preserves state and
  history; save/reopen and fresh-process verification.
- Tests: rich note with image/caption/column/unknown node; all presentation
  fields; missing relationship targets retained; all rejection paths.

**Exit evidence:** an NPC authored entirely through JSON-RPC reopens with every
field and asset intact, including private/public separation.

### Slice 4 — Locations

- `location.list`, `location.create`, `location.update` (no delete).
- Full dossier payload, optional parent, type/tags/party knowledge, banner/scene
  image, GM reference, private notes, association lists preserved.
- Reject duplicate IDs/names, missing parent, cycles, invalid party knowledge,
  invalid image kinds; enforce the same rules as the desktop.
- Map attachments/pins are validated against existing locations.
- Tests: hierarchy, search/list ordering, images, NPC links, save/reopen, v1–v2
  upgrades through Turso.

### Slice 5 — Factions

- `faction.list`, `faction.create`, `faction.update` (no delete).
- Name/image/description/GM notes and NPC→faction links through NPC update.
- Reject duplicate IDs, empty names, invalid images, duplicate links, and
  self/empty targets.
- Tests: validation, links resolving by ID after rename, save/reopen, v2–v3
  upgrades.

### Slice 6 — Party inventory

- `inventory.get`, `inventory.update` as one atomic replacement.
- Reject negative/fractional/unsafe gold, duplicate entry IDs, empty names,
  invalid kinds, and zero/negative/fractional/unsafe quantities.
- No-op update adds no history/revision; rejected update changes nothing;
  save/reopen; v3–v4 upgrade.

### Slice 7 — Item catalog and custom fields

- `item.list`, `item.create`, `item.update`, `item.delete`.
- Creation is name-only; update carries the item and any newly added field
  definitions (existing definitions cannot be edited/deleted in this run, per
  the product docs).
- Reject duplicate item/field/option IDs, empty labels, unsupported field kinds,
  duplicate choice labels, unknown field references, and mismatched value types.
- Deletion is undoable and leaves inventory/field definitions intact.
- Tests: all four field kinds, empty vs zero/false values, sorting/format
  primitives (focused unit tests), save/reopen, v6–v7 upgrade, image round trip.

### Slice 8 — Story threads

- `thread.list`, `thread.create`, `thread.update` (no delete).
- Full dossier plus people/location/faction links; missing targets retained.
- Reject empty title, invalid status, empty note documents, duplicate targets,
  invalid link IDs; preserve unknown Plate nodes and images.
- Tests: draft/commit semantics are adapter concerns, but core save is atomic;
  save/reopen, v5–v6 upgrade, image round trip.

### Slice 9 — Maps

- `map.list`, `map.create`, `map.update`, `map.delete`.
- Full record: name, kind, image, width/height, location attachments, pins
  (position/location/label/destination map), optional party marker.
- Validate unique map/pin IDs, supported kinds, dimensions, 0–1 finite
  coordinates, existing location/destination references, and no self-destination.
- Deletion clears incoming `destinationMapId` links and keeps locations;
  deletion is undoable.
- Tokens, fog, camera, visits, and presentation remain future.
- Tests: multi-map placements, link clearing, invalid coordinates/links, save/
  reopen, v4–v5 upgrade, image round trip.

### Slice 10 — Cross-record journey, compatibility, and handoff

- One end-to-end public journey: new campaign → faction → locations →
  NPCs with links/presentation/assets → inventory → items → thread → map with
  pins → save → terminate → fresh process reopen → verify every field, asset,
  revision, and dirty state → save again → reopen.
- Rejection journey through the CLI: stale writes, invalid hierarchy, duplicate
  links, invalid inventory/items/maps, unsupported version, corrupt asset.
- Compatibility fixture suite for v1–v7 with representative complex records and
  workspace JSON; verify unrelated fields survive.
- Update [headless-development.md](headless-development.md) contract/ledger and
  this map with exact evidence and limitations.
- Run all required checks and the actual CLI workflow.

## Turso compatibility checks (gate before claiming persistence)

1. Open packages written by the legacy adapter at versions 1 through 7; save via
   Turso; reopen via both adapters; compare all fields.
2. Save v7 data with threads/items/fields/workspace/navigation and every image
   type; terminate; copy the package to a new path; reopen in a fresh process.
3. Verify FK enforcement (orphan NPC rejected), NOT NULL/PK constraints, and
   that a late transaction failure rolls back all rows.
4. Verify unknown/future `user_version` and unsupported formats are rejected
   without writing and without replacing the active campaign.
5. Verify `.campaign.lock` prevents a second writer while a host is alive.
6. Verify assets are content-hashed, immutable, verified on load, and never
   pointed at a file outside the package; missing/corrupt assets produce
   structured storage errors.
7. Inspect journal/sidecar behavior after save; do not claim SQLite online
   backup compatibility. Document that a safe backup means copying the whole
   closed package (and that Save Copy is not implemented).
8. Keep tests on temporary directories/copies only.

## Highest-risk assumptions and dependencies

- **Slice 0 is a hard dependency.** No capability work is meaningful until the
  core builds and v7 packages round-trip.
- **History refactor.** A single stream must not break the desktop's per-NPC
  behavior or duplicate rules. The bounded-memory budget matters because records
  can contain images. If the refactor becomes disproportionate, fall back to the
  current per-record history and narrow the acceptance claim (requires approval).
- **NPC presentation payload size/shape.** Plate documents and statblocks are
  arbitrary JSON; validation must preserve unknown nodes and future fields
  without accepting malformed images.
- **Relationship canonicalization.** Editing one side must not silently create
  contradictory lists. The recommended contract edits NPC-side links only and
  preserves location/thread-owned fields.
- **Turso behavior differences.** The adapter already demonstrates transactions,
  FKs, and locking, but v6/v7 and asset-heavy round trips are unproven. Any
  semantic gap is a stop-and-ask item if it changes durability.
- **Error/context expansion.** Adding structured revision details may change
  existing error assertions; update them deliberately rather than weakening
  them.

## Decisions (approved 2026-11-07)

The recommendations below were approved as written: single campaign-wide
in-memory history; items and story threads included; map authoring data included;
`asset.import` included; NPC-side canonical relationships; item/map deletion
only; no player projection in this run.

1. **History policy (recommended):** one chronological campaign-wide in-memory
   stream per session, 100 entries / 16 MiB, creation+deletion+updates, no
   restart persistence, NPC endpoints retained as compatibility views. Alternative:
   keep per-record histories (matches current desktop exactly, but weaker
   "campaign-edit history").
2. **Include items and story threads** in this run (recommended) because they are
   existing saved v6/v7 record types; otherwise limit them to lossless
   compatibility and test-only coverage.
3. **Include map CRUD/pins/party/attachments** (recommended) while excluding
   tokens/fog/initiative/presentation.
4. **Add `asset.import`** for open packages (recommended) in addition to data-URL
   ingestion through record payloads. No WebP conversion in the core.
5. **Relationship canonicalization (recommended):** NPC-side links are the
   authored contract; location/thread association lists are preserved, not
   synchronized; faction chart stays frontend-only.
6. **Deletion (recommended):** only item and map deletion, matching documented
   desktop behavior. Each is undoable.
7. **No headless player projection this run (recommended):** keep
   `campaign.inspect` explicitly GM-only; defer any player-safe contract to the
   presentation goal.

## Clear finish line

The run is complete when:

- Slices 0–10 are done or explicitly re-scoped with approval.
- Every in-scope capability is discoverable through `system.describe` and every
  campaign-state mutation requires `expectedRevision` (preparation-only
  `asset.import` is the documented exception).
- Each capability has public-contract success, rejection, and (where persisted)
  fresh-process save/reopen evidence.
- A representative cross-record journey from campaign creation through
  save/terminate/reopen passes, including images and relationships.
- Existing notes, assets, relationships, workspace JSON, and unrelated fields
  survive round trips; v1–v7 representative fixtures have compatibility coverage.
- History behavior matches the approved policy, including no-op/rejection
  guarantees and restart behavior.
- All required checks pass; the desktop's relevant checks remain passing.
- Documentation accurately distinguishes implemented capabilities, known
  limitations, and deferred work; no capability is marked complete only because
  code exists or a unit test passes.
- The actual CLI workflow is exercised, not just the test harness.

## Verification commands for the run

From the repository root:

```sh
cargo build --workspace --locked
cargo test --workspace --locked
cargo test --workspace --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo fmt --all -- --check
cargo test --manifest-path ttrpg-gm-cm-app/src-tauri/Cargo.toml --locked
```

From `ttrpg-gm-cm-app`:

```sh
pnpm lint
pnpm test
pnpm build
```

Plus a scripted real CLI journey against a temporary campaign, and a fresh
process reopen of that same package.

## Evidence log (Phase B)

| Slice | Public journey | Command/test evidence | Known limitations |
| --- | --- | --- | --- |
| 0 | Baseline build and v7 round trip | `cargo build --workspace --locked`; `cargo test -p campaign-core storage::tests --all-features`; `storage::compatibility_fixture` | v6/v7 tables, Turso↔rusqlite v7 fixture, move/reopen |
| 1 | Campaign lifecycle/failure paths | `crates/campaign-cli/tests/journeys.rs`: `failed_switch_and_busy_packages...`, `rejected_actions...`; `session::tests` | failed initial-save folder remains; no Save Copy |
| 2 | History undo/redo | `campaign_history_covers_creation...`, `item_fields_and_inventory_history...`, `full_cross_record...`; `history::tests`, `history::label_tests` | in-memory only; restart clears |
| 3 | NPC presentation | `full_cross_record...`; `author_validate_undo...`; `history::label_tests` | no player-safe projection |
| 4 | Locations | `full_cross_record...`; `rejected_actions...`; `location_dossier...` | no deletion; associations preserved |
| 5 | Factions | `full_cross_record...`; `factions_images_links...` | no hierarchy/chart persistence |
| 6 | Inventory | `full_cross_record...`; `item_fields_and_inventory_history...`; `inventory_round_trip...` | name-based, no item links |
| 7 | Items | `full_cross_record...`; `item_fields_and_inventory_history...` | definitions can be added, not edited/deleted |
| 8 | Story threads | `full_cross_record...`; `threads_notes_assets...` | no deletion/backlinks |
| 9 | Maps | `full_cross_record...`; `saved_maps...`; `maps_validate...` | no fog/tokens/initiative/presentation |
| 10 | Cross-record + compatibility | `full_cross_record_authoring_journey_reopens_in_fresh_process`; `asset_import...`; `storage::compatibility_fixture` | representative fixtures, not exhaustive |

## Phase B results

**Approved scope:** the recommended plan was approved on 2026-11-07, including
items/threads authoring, map authoring data, the single campaign-wide in-memory
history stream, and `asset.import`. Player playback, sessions, Rune, and backup
remain excluded.

### Implemented

- Repaired the shared-core gating so the default workspace builds without Tauri
  or `rusqlite`; fixed the item/thread schema gap and the duplicate migration
  statement.
- Turso reads database versions 1–7 and writes v7, including `story_thread`,
  `item_catalog`, items, item fields, threads, inventory, maps, NPC presentation,
  workspace state, and content-hashed assets.
- Added typed JSON-RPC actions for campaign lifecycle, asset import, full NPC
  dossiers, locations, factions, inventory, items and custom fields, story
  threads, maps, and campaign-wide history.
- Added one campaign-wide, bounded, labeled, in-memory edit history with
  create/update/delete support, compound map-deletion changes, no-op/rejection
  safety, redo truncation, and restart non-persistence.
- Added injected clock/ID test dependencies and structured error details
  (`action`, `expectedRevision`, `actualRevision`).
- Added state validation for image URLs, note images, location association
  uniqueness, and unknown workspace fields (rejected rather than silently
  dropped).

### Evidence

- `cargo test --workspace --locked`: pass, 21 campaign-core unit tests + 11 CLI
  journey tests (plus empty doc/binary test suites).
- `cargo test --workspace --all-features --locked`: pass, 52 campaign-core tests
  (including legacy/all-feature compatibility) + 11 CLI journey tests.
- Public journeys cover: full cross-record authoring and two fresh-process
  reopens; rejected/stale/invalid actions preserving state and history; dirty
  switch; future-version rejection; failed save; item/inventory history;
  creation/update/deletion undo/redo; no-ops; asset import; corrupt/missing asset
  failures preserving the active campaign; and history non-persistence.
- Storage compatibility covers Turso v1–v7 reads and upgrades (including v1
  defaults and v2–v4 collections), a complex v7 fixture round-tripped
  legacy→Turso→legacy after moving the package, FK enforcement, rollback,
  locking, and asset verification.
- See [Headless development](headless-development.md) for the current contract
  and the full list of checks and limitations.

### Remaining limitations

- No player-safe projection or presentation playback.
- No sessions, Rune, workspace actions, Save Copy/backup, crash recovery,
  fog/tokens/initiative, or deletion for NPCs/locations/factions/threads.
- History is in-memory only and is cleared on New/Open. The desktop NPC undo
  menu still keys status per NPC; the shared stream is chronological, so the
  desktop UI needs migration to the shared status before cross-NPC undo is fully
  seamless.
- The core accepts already-encoded PNG/JPEG/WebP images; WebP/EXIF conversion
  and animation/pixel-limit decoding remain desktop/platform work.
- Historical compatibility uses representative fixtures, not every real package.
- Turso backup/checkpoint behavior is not claimed to match SQLite's online
  backup API; keep the complete package together.

### Reproduce the current state

```sh
cargo build --workspace --locked
cargo test --workspace --locked
cargo test --workspace --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo fmt --all -- --check
cargo test --manifest-path ttrpg-gm-cm-app/src-tauri/Cargo.toml --locked
cd ttrpg-gm-cm-app
pnpm lint
pnpm test
pnpm build
```

Plus a real CLI journey (see [Headless development](headless-development.md) §Try
the CLI), saving to a temporary package and reopening it in a fresh process.

### Recommended next bounded goal

Move presentation/player-safety onto the same core: define typed player-safe
projections and a separate player contract, with tests proving private NPC,
location, faction, item, thread, and workspace data never enters the payload.
Do not build Rune or session persistence as part of that goal.

## Post-run implementation note

After this acceptance run, game-session preparation and review were added to the
shared core and CLI: database version 8 adds `session_record`, and
`session.list`/`get`/`create`/`update` persist session details, ordered beats,
prep/running notes, recap, and NPC/location/faction/thread/item references. See
[Sessions](sessions.md#headless-persistence) and the current
[Headless development](headless-development.md) contract. The desktop Sessions
UI remains the separate memory-only frontend prototype; this note does not
retroactively change the approved scope or evidence of the original run.
