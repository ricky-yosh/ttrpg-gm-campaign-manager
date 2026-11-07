# Workflow inventory

This inventory is organized around **preparing**, **running**, and **reviewing**
a game session. Shared campaign/reference capabilities are described once in the
supporting section; the stage sections link to them instead of repeating every
detail.

## How to read this inventory

**Terminology.** A **game session** is the GM's prepared or played session
(“Session 8 — The Low Tide”). A **host/application session** is a running CLI or
core process and its in-memory campaign state. The Rust `Session` type and the
CLI's `serve` process are host sessions; they do not provide game-session
support. See [`session.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/session.rs)
lines 320–405 and [headless-development](../headless-development.md) lines
180–182.

**Requirement status** (what the product intends):

- **Confirmed** — an explicit product decision or documented implemented
  behavior.
- **Proposed** — a design proposal, brainstorm, or recommendation that still
  needs approval.
- **Prototype** — behavior documented as a frontend prototype or explicitly
  memory-only.
- **Deferred** — explicitly future work.
- **Unresolved** — the documents leave the behavior open.
- **Historical** — superseded design context.

**Implementation status** (what the current tree does):

- **Working/persistent** — implemented and saved in the campaign package.
- **Working/transient** — implemented but memory-only or prototype-limited.
- **Partial** — some paths work, but a documented part is missing.
- **Missing** — no applicable implementation path was found.
- **Unverified** — source suggests behavior, but no test or manual check proves
  it.

## Coverage index

| Area | Stage | Requirement | Desktop | CLI/core | Detail |
| --- | --- | --- | --- | --- | --- |
| Campaign new/open/save/switch | Prepare/review | Confirmed | Working/persistent | Working/persistent | §1.1 |
| Save As, backup, recovery | Prepare/review | Confirmed need; implementation unresolved | Partial | Partial (no Save Copy) | §1.1, §3.3, D4 |
| Game sessions, beats, prep, recap | Prepare/run/review | Prototype; persistence unresolved | Working/transient | Missing | §1.2, §2.3, §3.1, D1 |
| NPC dossier and notes | Prepare/run | Confirmed | Working/persistent | Working/persistent | §4.1 |
| Locations and hierarchy | Prepare/run | Confirmed | Working/persistent | Working/persistent | §4.2 |
| Factions and NPC affiliations | Prepare/run | Confirmed for saved basics; prototype for dossier | Working/persistent + transient prototype | Working/persistent basics | §4.3 |
| Items, custom fields, inventory | Prepare/run | Confirmed | Working/persistent | Working/persistent | §4.4 |
| Story threads | Prepare/run | Confirmed | Working/persistent | Working/persistent | §4.5 |
| Maps, pins, attachments | Prepare/run | Confirmed authoring; runtime deferred | Working/persistent | Working/persistent | §4.6 |
| Rich notes, images, assets | Prepare/run | Confirmed; editor parity incomplete | Partial | Storage/validation persistent | §4.7, D5 |
| Relationships/backlinks/lifecycle | Prepare/run/review | Confirmed/partly proposed | Partial | Partial | §4.8, D3 |
| Search and workspace navigation | Prepare/run/review | Confirmed core; full-text proposed | Partial (metadata search) | Missing | §4.9 |
| Undo/redo and edit history | Prepare/run/review | Confirmed; durability unresolved | Partial (NPC/map, memory) | Working/transient | §3.2, §4.9 |
| Player presentation | Run | Confirmed safety principle; detailed playback proposed | Partial (NPC/inventory only) | Missing | §2.1, §2.4, D2, D6 |
| Maps/exploration/encounters at play | Run | Deferred | Missing | Missing | §2.2 |
| Visits and session links | Run/review | Proposed/deferred | Missing | Missing | §2.3 |
| Puzzles | Any | Brainstorm/prototype | Sample only | Missing | §5 |
| Bestiary | Any | Proposed | Missing | Missing | §5 |
| Crafting, loot, media/video/songs | Any | Brainstorm/proposed | Missing | Missing | §5 |
| Rune frontend | Any | Deferred | Not applicable | Missing | §5 |
| Backup/export/portability | Review | Confirmed need | Partial | Partial | §3.3, D4 |
| Release/licensing metadata | Supporting | Unresolved | Inconsistent | Inconsistent | §6 |

## 1. Preparing a session

### 1.1 Campaign lifecycle: new, open, save, switch, portability, recovery

**GM outcome / example.** Create “The Lanterns of Greyhaven,” author NPCs and
locations, save the package, close the app, reopen it from disk, and continue
preparing. Switch to a second campaign without losing the first, and cancel a
failed open without replacing the active campaign.

**Requirements and status.** The confirmed direction is a portable campaign
package, explicit save semantics, and preservation of existing data
([backend-architecture](../backend-architecture.md) lines 17–21, 39; [headless
development](../headless-development.md) lines 90–98 and 155–175; [headless core
plan](../headless-core-plan.md) lines 100–108). Desktop autosave, first-save
choices, close/switch prompts, and workspace restoration are documented current
behavior. A verified Save Copy and crash recovery are explicitly missing
(backend-architecture lines 39 and 164; §D4). This workflow is **Confirmed**;
the backup part is **Unresolved**.

**Desktop behavior.** `campaign-data.ts` owns new/open/save and the save queue
(lines 645–770); `App.tsx` autosaves 750 ms after a change while a path exists
(lines 27–37), intercepts window close (lines 96–110), and presents the
Save/Don't save/Cancel choice (lines 255–274). `leaveCampaign` pauses autosave
for the whole transition, waits for queued saves, and preserves the active
campaign when the choice or native dialog is canceled (lines 728–770). Workspace
state is captured into the campaign and hydrated on open
([`workspaces.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/workspaces.tsx)
lines 225–250; [`session-store.ts`](../../ttrpg-gm-cm-app/src/stores/session-store.ts)
lines 260–292). Save As exists in the desktop menu and command palette
([`native-menu.ts`](../../ttrpg-gm-cm-app/src/lib/native-menu.ts) line 28;
[`campaign-data.ts`](../../ttrpg-gm-cm-app/src/lib/campaign-data.ts) lines
713–718); its queue and cancel/failure behavior are tested, but the test uses
mocked IPC rather than a real package/asset copy
([`campaign-store.test.mjs`](../../ttrpg-gm-cm-app/tests/campaign-store.test.mjs)
lines 136–180).

**CLI/core behavior.** `campaign.new`, `campaign.open`, and `campaign.save` use
the same core session and Turso storage. Save is explicit; EOF discards unsaved
work; a first save requires a new package path; later saves address the open
package and reject a different path as an unimplemented Save Copy
([`session.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/session.rs) lines
635–663). Revisions guard writes; failed opens are validated before replacing
the working campaign (lines 587–633). The CLI `run` command drives a child host
and exits 1 on an operation error, 2 on CLI/I/O failure
([`crates/campaign-cli/src/main.rs`](../../crates/campaign-cli/src/main.rs)
lines 52–84 and 86–180).

**What persists.** The package folder contains `campaign.sqlite`, `assets/`, a
`.campaign.lock`, and sometimes a `campaign.sqlite-wal` sidecar (observed in the
real CLI run). Saved records, images, workspace tabs/splits, navigation history,
sidebar state, and section are persistent. Games session data is **not** (see
§1.2). Unsaved desktop changes autosave after a save path exists; unsaved CLI
changes do not autosave and are lost at EOF. Failed opens preserve the active
campaign and history.

**Relationships and lifecycle.** Opening a campaign restores record tabs and
Back/Forward destinations; removed records are skipped or displayed as
unavailable. A campaign replacement clears NPC edit history and resets transient
session/draft state. The package format is database version 7 with v1–v7 reads
and v7 writes on both storage adapters; unknown future versions are rejected
without replacing the active campaign.

**Evidence.** Source inspection above; `cargo test --workspace --locked` and
`--all-features`; desktop `campaign-store` tests; real CLI journey with
temporary package (create, save, terminate, reopen, stale-write rejection). The
desktop GUI itself was not manually exercised.

**Gaps, contradictions, and questions.** No verified Save Copy/backup or crash
recovery; Save As is not the same as the documented verified copy; there is no
CLI `campaign.close`; the CLI intentionally has no autosave; `.campaign.lock`
and WAL sidecars make “copy the database” unsafe. The current acceptance map
describes a previous baseline/scope and links to `goal.md` (line 4), whose
contents are now this readiness goal, so it is not a current product
specification. See D4.

**Candidate public-contract acceptance journey (PROPOSED — not a current
command):** J1. Use current new/open/save plus a future verified Save Copy; save
a v7 package with records and images, close, copy the whole package, reopen both
copies in fresh processes, and assert every record/asset/workspace field. A
separate J2 asserts v1–v7 compatibility through both adapters and failed-open
preservation.

### 1.2 Game sessions: prep, story beats, running notes, and recaps

**GM outcome / example.** Prepare Session 8 with a title, date, “Where we left
off,” private prep notes, three ordered beats, links to Niya Jade, the
Dockworkers’ Guild, and the Eastern Seawall. Run the session, append quick
captures to “What happened,” write a player summary, then reopen the session next
week and review it before preparing Session 9.

**Requirements and status.** The product's core experience explicitly includes
creating and editing private plans, recording what happened, browsing previous
sessions, and presenting a session summary
([brainstorm-doc](../brainstorm-doc.md) lines 14–16; [data-model](../data-model.md)
lines 15–18). The current [sessions document](../sessions.md) lines 5–13 calls
the implementation a **frontend prototype**: content stays in memory, resets on
reload or campaign replacement, and no backend changes are included. Session
persistence is therefore **Prototype/Unresolved**, not a confirmed implemented
contract. Story-thread links to sessions are also deferred until sessions
persist ([story-threads](../story-threads.md) lines 19–23).

**Desktop behavior.** `SessionsPanel` provides a directory and an editor for
title, number, date, Upcoming/Previous grouping, “Where we left off,” prep notes,
ordered story beats with Planned/Happened/Skipped status, “What happened,” a
separate Summary for Players, quick capture, and related-record links
([`sessions-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/sessions-panel.tsx)
lines 22–176). Story beats currently have title, notes, status, and order; they
do **not** support the documented links to records, map pins, or media cues
([data-model](../data-model.md) lines 16–18), and the player summary has no
presentation path. The store holds sessions, drafts, captures, and sample reference
options in memory ([`session-notes-store.ts`](../../ttrpg-gm-cm-app/src/stores/session-notes-store.ts)
lines 27–75). Sample sessions exist only for the demo campaign; new campaigns
start empty. Quick capture commits to the in-memory session and mirrors into an
open draft; Cancel of an edit draft does not erase a capture. Tests cover capture
behavior, campaign reset, and sample isolation
([`session-notes.test.mjs`](../../ttrpg-gm-cm-app/tests/session-notes.test.mjs)
lines 5–43).

**CLI/core behavior.** There is no session domain type, no session table, and no
`session.*` action in the CLI. `system.describe` lists no session actions, and
`campaign.inspect` has no session field; the discovery limitations say sessions
are not implemented ([`session.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/session.rs)
lines 338–405 and 405–418; [`schema.sql`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/schema.sql)).
The Rust `Session` named in the code is the host process, not a game session.

**What persists.** Nothing in session content. Drafts survive tab closure while
the app remains open; they reset on campaign replacement or app reload
([`session-lifecycle.ts`](../../ttrpg-gm-cm-app/src/lib/session-lifecycle.ts)
lines 9–16). Session panels are deliberately removed from saved workspace JSON
and replaced by a sidebar-section destination
([`session-workspace.ts`](../../ttrpg-gm-cm-app/src/lib/session-workspace.ts)
lines 7–8; [`workspaces.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/workspaces.tsx)
lines 225–250). Opening a saved campaign cannot restore session tabs because the
session records do not exist.

**Relationships and lifecycle.** Related records support NPC, location, faction,
story thread, and puzzle links; real record links open saved records, and puzzle
links are sample-only in the demo campaign
([`sessions-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/sessions-panel.tsx)
lines 19, 47–93). Session links are not saved and disappear with the session.
Missing record targets are shown as “Unavailable” but there is no session link
lifecycle. No session deletion, visits, encounter links, or backlinks exist.

**Gaps, contradictions, and questions.** This is the central product gap: the
stated user outcome is session preparation/review, but sessions are memory-only
and absent from both storage adapters. The term “session” is also overloaded
between host process and game session. The UI has a transcript/recap-shaped
prototype but no durable recap, no player summary presentation, no review
history, and no session-to-session chronology. See D1 and D3.

**Candidate public-contract acceptance journey (PROPOSED — no current session
command):** J3. Start a host, create NPC/location/thread records, create a
session with beats and links, set its date/group, save, terminate, reopen in a
fresh process, assert all session fields and links, edit a beat/recap, save
again, and verify a second campaign does not see the session. J4 covers the
prepare-beside-record navigation.

### 1.3 Preparing from campaign reference material

**GM outcome / example.** Open an NPC beside a map, compare a location with its
parent region, and keep those tabs in a saved split layout while preparing.
Reach a linked faction or thread from the current record.

**Requirements and status.** Dockable workspaces, tab restoration, Back/Forward
navigation, and linked-record navigation are confirmed product behavior
([ui-ux](../ui-ux.md) lines 5–38, 96–123; [backend-architecture](../backend-architecture.md)
lines 121–129). Search is proposed as a command palette; full-text search is not
confirmed in the current implementation. This workflow is **Confirmed** for
workspace/navigation and **Partial** for search.

**Desktop behavior.** Workspaces are nested Dockview panes; opening the same
record focuses its existing tab; layouts, active tabs, scroll positions, and
navigation destinations are saved with the campaign
([`workspaces.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/workspaces.tsx)
lines 306–435 and 536–651). The command palette searches actions and record
names/metadata for NPCs, locations, maps, items, threads, and factions
([`command-palette.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/command-palette.tsx)
lines 48–246). It does not search session text because sessions are transient,
and it does not search note bodies or render a backlink graph.

**CLI/core behavior.** The headless contract has `campaign.inspect`, record
list/get actions, and no workspace/navigation/search actions. It preserves
workspace JSON opaquely on open/save but cannot author tabs or navigate a view
([headless-development](../headless-development.md) lines 184–233, limitation
3).

**What persists.** Record tabs, split panes, pane sizes, scroll positions, and
navigation history persist. A session tab does not; session-only prototype
tabs are stripped before save. A draft typed in a record editor survives
navigation to another tab while the campaign remains open, but not an app reload
or campaign replacement.

**Relationships and lifecycle.** Linked-record cards open saved records by ID;
missing targets display as unavailable and can be removed in edit mode. No
automatic backlinks are computed, so preparing from “what links here?” is not
possible. The same relationship can appear on both an NPC and a location through
independent lists; see §4.8 and D3.

**Gaps and candidate journey.** No full-text search, no session context in the
workspace, no backlinks, no “Open in Presenter” from ordinary GM navigation,
and no durable draft recovery. **J4 (PROPOSED):** prepare with a saved split
layout, open NPC and location records, rename one target, verify links resolve
by ID, and verify missing targets remain visible; then reopen the campaign and
confirm layout/scroll/navigation.

## 2. Running a session

### 2.1 Player presentation, public/private content, and player knowledge

**GM outcome / example.** Show the party an NPC portrait and player description,
or the party inventory, on a projector/second screen while keeping GM notes,
statblocks, hidden links, and private session prep off the player display. Pause
before switching views and resume without leaking private material.

**Requirements and status.** The safety principle is **Confirmed**: GM inspection
and player-safe projection are different contracts; private fields must be
excluded from payloads, not merely hidden
([player-presentation](../player-presentation.md) lines 90–94; [npc-presentation
design](../npc-presentation-design.md) lines 44 and 99–105). The full
presentation system (Live/Next, Pause, overlays, maps, factions, locations,
items, threads, player knowledge, checkpoint recovery) is a **Proposed** design,
not approved scope. The current implementation covers NPC and inventory content
only.

**Desktop behavior.** The top bar opens a Tauri webview window labeled `player`
([`presentation-window.ts`](../../ttrpg-gm-cm-app/src/lib/presentation-window.ts)
lines 9–46); the player window renders event content and handles close
confirmation ([`player-presentation-window.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/player-presentation-window.tsx)
lines 11–107). `buildPlayerContent` is an allowlist: NPC name, player
description, portrait URL; inventory gold and entries with id/name/kind/quantity/
note only ([`presentation-content.ts`](../../ttrpg-gm-cm-app/src/lib/presentation-content.ts)
lines 10–18). The Presenter sidebar exposes Map, Inventory, and NPCs; the map
panel is an empty “not connected yet” state
([`app-sidebar.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/app-sidebar.tsx)
lines 104–168; [`presenter-view.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/presenter-view.tsx)
lines 53–60). There is one GM window plus one optional player window; there are
no independent GM windows or monitor-targeting controls. Live updates publish
the allowlisted content; Pause holds the last published content; Stop clears it
([`App.tsx`](../../ttrpg-gm-cm-app/src/App.tsx) lines 111–154).

**CLI/core behavior.** No player projection exists. `campaign.inspect` returns
complete GM data and discovery explicitly says it is not player-safe
([headless-development](../headless-development.md) lines 99–106; session
discovery limitations lines 405–418). There is no headless presentation state,
window, or knowledge query.

**What persists.** Presentation timestamps/paused state are in the Zustand
session store and reset on campaign hydration
([`session-store.ts`](../../ttrpg-gm-cm-app/src/stores/session-store.ts)
lines 183–198, 260–292). No presentation checkpoint, open Presenter tabs, scroll
positions, or player-safe frame is saved. The player window is a runtime
window; closing it stops output. Player knowledge is not persisted as a live
projection source.

**Relationships and lifecycle.** Presenting an NPC does not change any record.
The player payload contains no GM reference, statblock, Plate notes, banner,
token, faction/location links, or workspace state. However, any NPC in the
campaign can be selected in Presenter; there is no persistent “known to
players” gate. Locations' `partyKnowledge` is an authoring field with no player
projection; factions' `known` state is prototype-only. See D2.

**Evidence.** Source inspection; inventory unit test asserts public fields only
and frozen Pause content
([`inventory.test.mjs`](../../ttrpg-gm-cm-app/tests/inventory.test.mjs) lines
27–41). There is no equivalent test for the NPC payload, no GUI/manual
second-display verification, and no test for player knowledge.

**Gaps.** No map, location, faction, item, thread, or session presentation; no
NPC presence overlay or speaker state; no player directory; no Next staging UI
or discard-staged action; no checkpoint/restart recovery; no player knowledge;
no headless player endpoint. See D2 and D6.

**Candidate public-contract acceptance journey (PROPOSED):** J5 asserts that an
NPC projection never contains private notes, GM reference, statblock, banner,
token, hidden links, workspace, or other records; J6 asserts explicit reveal,
persistent known state, unknown records absent, and paused content unchanged.
J9 covers presentation Live/Next/Stop/restart.

### 2.2 Maps, exploration, encounters, and the table surface

**GM outcome / example.** During play, show a saved city map on the player
display, reveal a discovered pin, move the party marker, open a linked interior
map, and (for a dungeon) reveal fog and move tokens. Track initiative if the
encounter system is in scope.

**Requirements and status.** Saved maps, pins, party marker, linked maps, and
location attachments are **Confirmed and implemented as authoring data**
([maps](../maps.md) lines 7–19). Fog, tokens, grids, measurement, initiative,
player-visible map state, and encounter tracking are explicitly future
(maps lines 60–72, 96–102; [data-model](../data-model.md) lines 25–27). The
current map is an atlas/reference authoring surface, not an exploration or battle
runner.

**Desktop behavior.** The Konva map panel renders an image, pans/zooms, selects
and moves pins, places a party marker, supports Add pin / Edit pin / Remove pin,
and opens linked locations/maps ([`map-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/map-panel.tsx)
lines 24–259). Map metadata/delete is in `MapEditor`
([`map-editor.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/map-editor.tsx)
lines 35–87). Map gestures use a per-map frontend history
([`map-history.ts`](../../ttrpg-gm-cm-app/src/lib/map-history.ts) lines 6–35).
Map saves validate image type, dimensions, attachments, pins, destinations, and
coordinates ([`map-commands.ts`](../../ttrpg-gm-cm-app/src/lib/map-commands.ts)
lines 4–26). A pin currently attaches only to a location; the documented generic
pin links to an NPC, enemy, or item are not implemented. There are no token,
fog, grid, measurement, initiative, visit, or player-visibility controls in the
map panel.

**CLI/core behavior.** `map.list/get/create/update/delete` persist the same
authoring data. The shared validation rejects invalid coordinates/links and map
deletion clears incoming destination links while preserving locations
([`session.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/session.rs) lines
1102–1218; [`validation.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/validation.rs)
lines 172–219). No runtime gameplay actions exist.

**What persists.** Map metadata, image, dimensions, location attachments, pins,
party marker, destination-map links, and the map record survive save/reopen.
Fog/token/initiative/visit/camera presentation state does not exist. Map camera
and inspector state are saved in workspace panel parameters
([`map-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/map-panel.tsx)
lines 36–80), but the player projection has no map view.

**Relationships and lifecycle.** Pins require an existing location; pin removal
does not delete the location; map deletion clears incoming shortcuts and keeps
locations (desktop and CLI tests). A map can be attached to multiple places and
a place can appear on multiple maps. No player-visible pin or fog lifecycle.

**Gaps and candidate journey.** No map presentation, fog, tokens, grid,
measurement, initiative, encounters, visits, or player-safe map projection. The
“Maps” Presenter tab currently opens a placeholder. **J7 (PROPOSED, future):**
author a multi-level map, attach locations, place pins/party, save, reopen,
verify link clearing on deletion, then (in a future runtime) reveal player-safe
pins/fog and move tokens while Pause freezes Live.

### 2.3 Running notes, quick capture, visits, and recaps during play

**GM outcome / example.** During play, append “The party bribed the night clerk”
to What happened without editing the prepared plan, mark the Eastern Seawall as
visited, and later review which session visited which location.

**Requirements and status.** Quick capture and separate prep/running notes are
documented in the sessions prototype (§1.2). Visit tracking and session links
are **Proposed/Future** in [maps](../maps.md) lines 50–58 and [data-model](../data-model.md)
lines 16–18; sessions themselves do not persist. There is no confirmed
implementation of visits or a running-session entity.

**Desktop behavior.** Quick capture appends to the in-memory session's
“What happened” document and mirrors into an open draft
([`sessions-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/sessions-panel.tsx)
lines 117–159; store lines 61–69). It does not write a campaign package. There
is no “Mark visited,” session-linked pin, encounter, or location visit action.
Location `partyKnowledge` can be edited manually on the location dossier
([`location-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/location-panel.tsx)
lines 144–157), but it is not tied to a session or a pin.

**CLI/core behavior.** None. There is no session or visit action. The CLI can
edit location party knowledge through `location.update`, which is authoring
data, not a recorded visit.

**What persists.** Nothing from the running session; quick captures vanish on
reload/campaign switch. Location party knowledge persists because it is a saved
location field. No session-to-location visit history exists.

**Relationships and lifecycle.** Session links to records are transient. Map
pins link to locations but do not record visits. Missing records are displayed as
unavailable in session links. No backlinks.

**Gaps and candidate journey.** No session persistence, visit records, encounter
records, or session review. **J8 (PROPOSED):** create a session, record visits
from a map pin, append running notes, save/reopen, and assert the session shows
ordered visits and notes while the location shows its session history; no
current command exists.

### 2.4 Presentation controls, Pause/Live, and in-play undo

**GM outcome / example.** Keep a map or NPC on screen while the GM looks up a
private note; pause output, prepare the next public view, then resume; undo a
misplaced pin without undoing a note edit.

**Requirements and status.** Live/Next/Pause, explicit publication, and
separation from campaign-edit history are **Proposed** in
[player-presentation](../player-presentation.md) lines 21–56 and
[backend-architecture](../backend-architecture.md) lines 168–180. Undo/redo is a
confirmed product requirement (backend-architecture lines 182–200); durability
is unresolved.

**Desktop behavior.** The top bar implements Play/Stop, Pause/Resume, elapsed
time, and a Presenter/GM toggle
([`topbar.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/topbar.tsx) lines
166–223; [`App.tsx`](../../ttrpg-gm-cm-app/src/App.tsx) lines 111–154). Pause
freezes the last published content; Stop closes the player window and resets
the timer. There is no visible Next state label, no “View Live/Next” toggle, no
“Discard staged changes,” no “Open in Presenter” action, and no checkpoint
restore. Map gestures have their own per-map in-memory history; NPC edits have
in-memory saved-edit history; other record edits have no desktop undo
([`history-dispatcher.ts`](../../ttrpg-gm-cm-app/src/lib/history-dispatcher.ts);
[`campaign-data.ts`](../../ttrpg-gm-cm-app/src/lib/campaign-data.ts) lines
557–607; [`map-history.ts`](../../ttrpg-gm-cm-app/src/lib/map-history.ts)).
The CLI has campaign-wide history for included records and no presentation.

**What persists.** Presentation state and timer are transient; campaign edits
autosave when a path exists. In-memory undo history clears on campaign
replacement/open and does not survive restart. A stopped presentation cannot be
restored.

**Relationships and lifecycle.** Pausing does not change records; selecting a
different Presenter view while paused stages the next selection only in React
state, and Resume publishes it. There is no durable “last public view” or
per-tab scroll state for Presenter.

**Gaps and candidate journey.** No checkpoint, Next UI, or durable presentation;
no headless playback. **J9 (PROPOSED):** pause, stage a different NPC/Inventory,
close/reopen the player window and app, assert held frame/timer/tab state; then
resume and assert only the staged public payload appears. No current command
exists.

## 3. Reviewing a session

### 3.1 Recaps, story history, and “what happened”

**GM outcome / example.** After play, review the session's prep versus what
happened, read the player-facing summary, and browse previous sessions before
preparing the next one.

**Requirements and status.** Browsing previous sessions and recording what
happened are in the product's core experience
([brainstorm-doc](../brainstorm-doc.md) lines 14–16; [sessions](../sessions.md)
lines 5–13). The sessions implementation is a prototype and is not saved. The
story-thread document explicitly defers persistent session-to-thread links until
sessions persist ([story-threads](../story-threads.md) lines 19–23).

**Desktop behavior.** The session page offers read/edit modes, saved-in-memory
drafts, What happened, Summary for Players, and previous/upcoming groups
([`sessions-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/sessions-panel.tsx)
lines 113–176). There is no durable recap, no comparison of prep vs happened, no
session timeline, no export, and no way to present a player summary. Closing or
switching campaigns discards it.

**CLI/core behavior.** Missing entirely (no session type/table/action). The CLI
can inspect campaign records but not a game session.

**What persists.** None of the session content. The campaign workspace may
preserve a section-level navigation destination for Sessions, but not the
session or its text ([`session-workspace.ts`](../../ttrpg-gm-cm-app/src/lib/session-workspace.ts)
lines 7–8).

**Relationships and lifecycle.** Session-to-record links vanish with the session;
record-to-session backlinks do not exist. The UI's “Summary for Players” is a
private in-memory field, not a published projection.

**Gaps and candidate journey.** No reviewable session history or recap. **J3**
is the same proposed persistence journey; add a review assertion that after
reopen the GM sees the saved recap, beats, and links, and that a second campaign
cannot see them.

### 3.2 Edit history, undo/redo, and audit

**GM outcome / example.** Undo a mistaken NPC rename or map pin move; review a
labeled history of recent edits; understand which edits are safe to reverse
after reopening the campaign.

**Requirements and status.** Undo/redo is **Confirmed** (backend-architecture
lines 182–200). The documents leave durability, granularity, and the relationship
to local text typing open (lines 195–200). The previous headless acceptance map
approved one campaign-wide in-memory stream for included records (acceptance map
lines 305–335, 713–739), but that scope was a previous run, not approval of
every future feature.

**Desktop behavior.** The desktop has saved-edit history for NPC updates, with
labels and field diffs, and a separate per-map history for map gestures; both are
in memory and clear on campaign open/replacement. The dispatcher prefers a
focused Plate editor, then a text input, then the active NPC saved-edit history
([`history-dispatcher.ts`](../../ttrpg-gm-cm-app/src/lib/history-dispatcher.ts);
[`npc-history-context.ts`](../../ttrpg-gm-cm-app/src/components/campaign/npc-history-context.ts);
[`map-history.ts`](../../ttrpg-gm-cm-app/src/lib/map-history.ts)). Items,
locations, factions, threads, inventory, and sessions have no shared desktop
undo; their drafts have Cancel, and maps have their own history. The desktop UI
still keys NPC status per NPC even though the backend history is one stream
([backend-architecture](../backend-architecture.md) line 31). No history is
persisted.

**CLI/core behavior.** One campaign-wide in-memory stream, bounded to 100
entries/16 MiB, covers NPCs, locations, factions, inventory, item fields, items,
threads, and maps; creation/deletion and compounds are undoable, no-ops and
rejections add nothing, redo truncates, and history does not survive restart
([headless-development](../headless-development.md) lines 134–153;
[`history.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/history.rs);
[`session.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/session.rs) lines
1220–1250). Tests cover cross-record order, creation/deletion, compound
map-deletion changes, no-ops, conflicts, redo truncation, and restart
non-persistence (`history::tests`, `history::label_tests`, CLI journeys).

**What persists.** Campaign records persist; history does not. A redo branch is
lost on restart. Local text-editor undo is separate and also not durable.

**Relationships and lifecycle.** Undo can restore a record but cannot undo
external effects (players saw an image, a file was exported). Deleting a map
clears incoming links as one compound entry; other record deletions are absent.
No audit log exists for review or recovery.

**Gaps and candidate journey.** Desktop/CLI mismatch, no durable history, no
cross-record desktop status, no audit. **J10 (PROPOSED):** run a cross-record
desktop sequence, undo/redo, save/reopen, and verify data persists while history
does not; decide separately whether durable audit is required. No new command is
strictly required for the in-memory check, but the desktop parity does not exist.

### 3.3 Backup, export, and portability

**GM outcome / example.** After a session, create a trustworthy snapshot before
next week's prep; move a campaign to another computer; recover from a failed
save or crash.

**Requirements and status.** Portable package saves and backups are **Confirmed**
([brainstorm-doc](../brainstorm-doc.md) lines 47–48; [backend-architecture](../backend-architecture.md)
lines 39 and 153–166; [development](../development.md) lines 65–69). The
documented backup requires the database plus every referenced asset; the app
does not yet create ZIP files, prune unused images, provide Save Copy, recover
unsaved drafts after a crash, or persist campaign-wide undo
(backend-architecture line 39; development line 69; headless-development
lines 155–175).

**Desktop behavior.** Save writes the current package; Save As creates a second
package and switches the active path. The desktop tests mock Save As and verify
queue/cancel/failure behavior, not a real on-disk asset copy
([`campaign-store.test.mjs`](../../ttrpg-gm-cm-app/tests/campaign-store.test.mjs)
lines 136–180). The documented backup procedure remains “wait for Saved, then
ZIP/copy the whole `.campaign` folder” ([development](../development.md) line
69). There is no backup verification, ZIP export, asset-pruning, or crash
journal.

**CLI/core behavior.** Save writes v7, reads v1–v7, verifies assets, and keeps
the package lock. Changing the path of an open campaign is rejected as an
unimplemented Save Copy ([`session.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/session.rs)
lines 635–663). The manual run produced `campaign.sqlite`,
`campaign.sqlite-wal`, `assets/`, and `.campaign.lock`, so copying only
`campaign.sqlite` is not a complete or safe backup.

**What persists/portability.** The whole folder is portable if copied together;
absolute sources are not referenced, images are content-hashed and relative.
Missing/corrupt assets are rejected on load; failed saves preserve the previous
package. The package format is versioned and unknown versions are rejected.

**Gaps and candidate journey.** No verified Save Copy/backup, no crash recovery,
no asset cleanup, no ZIP export, and no evidence that Save As produces a
reopenable package with all assets. **J11 (PROPOSED):** save a campaign with
multiple images, Save As a second package, close, copy/move both packages,
reopen both in fresh processes, verify every hash and record, then corrupt one
asset and assert a structured failure that preserves the active campaign. A
future Save Copy command is required for the “verified” claim; manual folder
copy is the current fallback.

## 4. Supporting campaign/reference capabilities

### 4.1 NPCs and private/public dossiers

**Requirements and status.** NPC authoring is **Confirmed** for identity, Plate
notes, private GM reference, separate player description, banner/portrait/token,
ruleset-tagged statblock, and directional relationships
([npc-presentation-design](../npc-presentation-design.md) lines 9–25, 27–44,
46–74, 87–95). Player playback is proposed/future.

**Desktop behavior.** NPC cards open in read mode; Edit stages name, notes, and
presentation; Save changes calls Rust `update_npc`, Cancel restores the prior
values, and errors remain in the draft
([`character-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/character-panel.tsx)
lines 24–146, 230–299). The editor includes banner/portrait/token uploads, GM
reference fields, a D&D 5.5e statblock, player description, and NPC/location/
faction link cards. Images use the Rust WebP importer. `buildPlayerContent` only
emits name, player description, and portrait; private fields are not in the
player payload.

**CLI/core behavior.** `npc.list/get/create/update` plus `npc.undo/redo` and the
full shared history; `npc.update` accepts optional presentation and preserves
name/notes conveniences. Validation rejects empty names, empty note documents,
invalid image kinds/URLs, self/duplicate relationship targets, duplicate
location/faction targets, and invalid statblock field-set IDs/versions
([`validation.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/validation.rs)
lines 264–315). Missing targets are retained. `npc.create` creates a blank
Plate paragraph and default presentation.

**Persistence and evidence.** Saved in `npc`, `npc_notes`, `npc_presentation`,
and campaign settings; v1–v7 compatibility tests and a full CLI cross-record
journey cover presentation, assets, links, notes with an unknown node, and
reopen ([`crates/campaign-cli/tests/journeys.rs`](../../crates/campaign-cli/tests/journeys.rs)
lines 410–814; storage tests). The desktop has image round-trip tests; the
frontend has no NPC player-payload test.

**Gaps.** No NPC deletion or archive; no backlinks; no player knowledge; one
portrait serves both GM and player (no separate “safe portrait”); **note image
insertion and columns are not available in the current editor** even though
existing image nodes render; statblock field-set changes/conversion are future;
the GM reference and statblock are saved but not projected.

**Candidate journey (PROPOSED):** J12 covers rich-note round-trip and editor
affordances; J13 covers incoming links, rename, archive/delete, and unavailable
targets; J5 covers NPC payload privacy.

### 4.2 Locations and hierarchy

**Requirements and status.** Locations are **Confirmed** for name, optional
parent, type, tags, party knowledge, banner, player-facing scene image, public
description, structured GM reference, private notes, NPC/faction association
lists, and map attachments/placements; deletion and player presentation are
future ([locations](../locations.md) lines 3–15, 27–31; [data-model](../data-model.md)
lines 22–25).

**Desktop behavior.** The directory shows a geographic tree and search with
parent paths. The dossier supports view/edit modes, parent changes with cycle
rejection, staged child creation, images, GM reference, party knowledge, map
attachments/placements, and association lists
([`location-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/location-panel.tsx)
lines 42–210; [`location-data.ts`](../../ttrpg-gm-cm-app/src/lib/location-data.ts)
lines 25–68). Map links distinguish “Maps of this place” from “Appears on”
placements ([`location-maps.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/location-maps.tsx)
lines 11–41).

**CLI/core behavior.** `location.list/get/create/update` (no delete) with
hierarchy, dossier fields, images, party knowledge, and association lists.
Validation rejects duplicate IDs/names, missing parents, cycles, invalid party
knowledge, invalid images, and duplicate association target IDs; missing targets
are allowed (validation lines 126–171; session lines 800–858).

**Persistence and evidence.** `location` table in v2+, candidate fields in JSON;
v1 upgrade tests, image/links/maps and moved-package tests, CLI history and
cross-record journeys. No location deletion.

**Gaps.** No deletion/archive; no player view; `partyKnowledge` is not used by a
player projection; association lists duplicate NPC-side links and can diverge;
no backlinks; map placements are not visits. See D2/D3.

**Candidate journey (PROPOSED):** create region → city → tavern, reparent,
reject a cycle/missing parent/duplicate association, attach maps/pins, save and
reopen, then assert backlinks from NPCs/factions and a player view filtering
unknown places. J13/J5.

### 4.3 Factions and NPC affiliations

**Requirements and status.** Saved faction records (name, image, description,
private GM notes) and directional NPC→faction links are **Confirmed**
([factions](../factions.md) lines 15–21). The faction dossier's banner/type/
headquarters/parent/tags/members/roles/allies/rivals/organization chart and
“known to players” visibility are a **Frontend design prototype** and
explicitly memory-only (lines 5–11, 31). Player presentation is future.

**Desktop behavior.** Faction records save name/image/description/GM notes;
the dossier adds a rich prototype UI and a public preview dialog, but the extra
fields and chart reset on reload/campaign switch
([`faction-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/faction-panel.tsx)
lines 22–223; [`faction-prototype-store.ts`](../../ttrpg-gm-cm-app/src/stores/faction-prototype-store.ts)
lines 5–16; [`faction-prototype.ts`](../../ttrpg-gm-cm-app/src/lib/faction-prototype.ts)
lines 14–35). NPC faction links edit in the NPC draft; the faction Members list
seeds from them but prototype edits do not update the NPC links
([factions](../factions.md) lines 19–21).

**CLI/core behavior.** `faction.list/get/create/update` (no delete) for the saved
fields; NPC faction links travel through `npc.update`. No chart, visibility,
membership, or hierarchy state is persisted.

**Persistence and evidence.** `faction` table v3+, NPC link lists in NPC
presentation; v2 upgrade, images, duplicate links, moved packages, and CLI
cross-record journeys. Prototype tests cover cycle rejection, child reconnection,
public hidden-node filtering, and seeding from NPC links
([`faction-prototype.test.mjs`](../../ttrpg-gm-cm-app/tests/faction-prototype.test.mjs)
lines 7–44).

**Gaps.** No faction hierarchy/delete; prototype dossier not saved; no
backlinks; “known” is not a persistent player-knowledge model; no faction player
view; duplicate relationship representations. See D2/D3.

**Candidate journey (PROPOSED):** J13 for link ownership/rename/missing targets
and archive; J5 for player-safe faction projection and unknown visibility.

### 4.4 Items and party inventory

**Requirements and status.** Item catalog and typed custom fields are
**Confirmed** with text/number/checkbox/choice values, stable IDs, separate field
definitions, deletion, and no built-in rarity/tier; inventory is **Confirmed**
for whole gold and item/material entries ([items](../items.md) lines 9–23;
[inventory](../inventory.md) lines 5–9). Character inventories, transfers, item
links, and player item presentation are future.

**Desktop behavior.** The item catalog supports search, sorting, column
selection, saved tab parameters, name-only creation, image/description/GM notes,
custom fields, and delete with confirmation
([`items-catalog.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/items-catalog.tsx);
[`item-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/item-panel.tsx)
lines 34–86). Item drafts survive tab closure while the campaign remains open;
Cancel discards. Inventory has edit/save/cancel, gold, item/material entries,
positive quantities, public notes, and a player-safe read view
([`inventory-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/inventory-panel.tsx)
lines 29–68; [`inventory-view.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/inventory-view.tsx)).
All inventory fields are player-facing by design.

**CLI/core behavior.** `item.list/get/create/update/delete`,
`inventory.get/update`; item update can add field definitions, not edit/delete
existing ones. Validation rejects duplicate item/field/option IDs, empty names/
labels, unknown kinds, duplicate choice labels, unknown field references, wrong
value types, invalid inventory quantities/kinds/gold, and duplicate inventory
IDs (validation lines 104–125; items module; session lines 918–1035). Item/map
deletion is undoable; inventory has no item link.

**Persistence and evidence.** `item_catalog` and `party_inventory` in v7/v4+;
v6/v7 and v3/v4 upgrade tests; asset/image tests; item/inventory history CLI
journey; frontend item/inventory tests.

**Gaps.** No item-to-inventory links, awards, transfers, character inventories,
item templates, field-definition editing/deletion, player item view, or
crafting rule. See D5 for note/editor parity.

**Candidate journey (PROPOSED):** J14 for full-text/structured search across
items and inventory; J5 for player item projection; current CRUD is already
covered by existing CLI/desktop tests.

### 4.5 Story threads

**Requirements and status.** Story threads are **Confirmed** saved dossiers with
title, status, player reminder, written origin/source label, two Plate note
documents, and people/location/faction links; deletion, backlinks, persistent
session links, and player presentation are future
([story-threads](../story-threads.md) lines 3–24).

**Desktop behavior.** Directory/search, status groups with Resolved collapsed,
read/edit mode, shared drafts, title validation, all fields and record links,
and navigation to targets ([`story-threads-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/story-threads-panel.tsx)
lines 37–192). Drafts survive tab closure; Save commits; Cancel restores.

**CLI/core behavior.** `thread.list/get/create/update` (no delete); full dossier
and links; missing targets retained; validation rejects empty title, invalid
status, empty note document, invalid nodes, and duplicate link targets
(validation lines 220–247; session lines 1036–1101).

**Persistence and evidence.** `story_thread` v6+; images, unknown nodes, moved
packages, and CLI cross-record journeys; frontend draft/validation/history tests.

**Gaps.** No thread deletion/archive, backlinks, persistent session origin or
story-beat links, or player presentation. Session links vanish with the session.
See D1/D3.

**Candidate journey (PROPOSED):** J13 for backlinks/rename/archive; J3 for
persistent thread→session links once sessions exist.

### 4.6 Maps (authoring record)

**Requirements and status.** Saved map records are **Confirmed** for name, kind,
image, dimensions, location attachments, pins (position/location/label/
destination map), and optional party marker; deletion clears incoming shortcuts
and keeps locations. Tokens, fog, camera presentation, visits, and player
visibility are future ([maps](../maps.md) lines 7–19, 60–72; data-model lines
25–27).

**Desktop behavior.** The map panel/editor and directory implement image import,
metadata, attachments, pin add/edit/remove, party marker, pan/zoom/fit, linked
map destinations, location preview, and delete with confirmation
([`map-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/map-panel.tsx)
lines 24–259; [`map-editor.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/map-editor.tsx)
lines 35–87; [`maps-directory.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/maps-directory.tsx)).
Map gestures save immediately and have a per-map 50-entry in-memory undo history
([`map-history.ts`](../../ttrpg-gm-cm-app/src/lib/map-history.ts)).

**CLI/core behavior.** `map.list/get/create/update/delete`; validation for map/
pin IDs, kinds, image type, dimensions, location existence, unique attachments,
0–1 finite coordinates, destination existence, and no self-destination
(validation lines 172–219; session lines 1102–1218). Delete cascades incoming
`destinationMapId` links as one undo entry.

**Persistence and evidence.** `map_record` v5+; image/assets, moved package,
pins/placements, deletion link clearing, history, and v4 upgrade tests; CLI map
journeys. No map runtime.

**Gaps.** No tokens/fog/grid/measure/initiative/visits/player map, no session
links, no map deletion of locations (correct), no player-visible pin state. See
§2.2, D6.

**Candidate journey (PROPOSED):** J7; current authoring is covered by existing
desktop/CLI tests.

### 4.7 Rich notes, images, assets, and record references

**Requirements and status.** Plate is the selected editor; the data model
requires visual editing, inline images with captions, side-by-side columns,
versioned document JSON, unknown-node preservation, stable asset references, and
separate private/public content ([data-model](../data-model.md) lines 55–72;
[image-import](../image-import.md) lines 3–54). The desktop image importer is
**Confirmed/implemented** for PNG/JPEG/still WebP with 10 MiB, 40 MP, 16,383 px
limits, EXIF orientation, animation rejection, and quality 82
([`images.rs`](../../ttrpg-gm-cm-app/src-tauri/src/images.rs) lines 10–104).

**Desktop behavior.** The shared notes editor registers basic blocks, marks,
lists, image rendering, captions, resize handles, and a formatting toolbar
([`npc-notes-editor.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/npc-notes-editor.tsx)
lines 130–146, 307–312, 375–390). It does **not** register the installed
`@platejs/layout` column plugin, and it configures `ImagePlugin` with
`disableEmbedInsert: true` and `disableUploadInsert: true` (lines 139–140), so
there is no visible image-insertion affordance. Existing image nodes can be
rendered, captioned, and resized; unknown nodes are preserved in stored JSON but
the editor does not provide a UI for them. No record mention/link node is
registered. This conflicts with [development](../development.md) line 69 (“Insert
an image with the note toolbar”) and with the data-model requirement.

**Storage/assets.** The shared campaign `assets/` pipeline hashes data URLs,
verifies existing assets on load, rejects external/missing/corrupt/hash-mismatch
references, supports all record image fields (NPC banner/portrait/token, location
scene/banner, faction, map, item, thread notes), and has a symlink containment
check. Images are converted at import on the desktop; the headless core accepts
already-encoded PNG/JPEG/WebP data URLs and does not convert WebP. Unreferenced
assets may remain; cleanup/backup is missing.

**Persistence/evidence.** Tests cover note images/captions, NPC presentation,
location/faction/map/item/thread images, moved packages, missing/corrupt assets,
failed saves, and the WebP converter. There is no test for column authoring or
image insertion, because the editor has no such controls. See D5.

**Candidate journey (PROPOSED):** J12. Create a note with an image, caption,
column layout, and unknown node; save/reopen; assert all nodes and assets survive
and the editor can edit the same document. This is an editor test, not a current
CLI command (the CLI can already round-trip arbitrary note JSON).

### 4.8 Relationships, links, backlinks, and lifecycle

**Requirements and status.** NPC→NPC, NPC→location, NPC→faction, location/thread
association links, location hierarchy, map attachments/pins, and thread→record
links are **Confirmed** for the scoped record model; generic record links,
archive-on-delete, and backlinks are **Proposed/Future**
([headless-acceptance-map](../headless-acceptance-map.md) lines 248–275;
[data-model](../data-model.md) line 35; [backend-architecture](../backend-architecture.md)
lines 139–142).

**Desktop behavior.** NPC relationship card rejects self and duplicate targets,
stores target ID plus optional label, resolves names from current records, and
shows “Unavailable NPC/location/faction” with navigation disabled
([`npc-record-links.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/npc-record-links.tsx)
lines 39–128). Location association lists use the same component and are
editable independently (location-panel lines 181–185). Threads have three link
groups with the same pattern. Faction prototype nodes/alliances are a separate
in-memory representation (faction-panel lines 169–181). There are no backlinks
and no stale-link cleanup/archive UI; item/map deletion is the only deletion
path. Map destination links are cleared when a map is deleted.

**CLI/core behavior.** NPC/thread/location link lists are saved in record JSON;
validation enforces nonempty/unique IDs for each list and NPC self/duplicates
(validation lines 142–151, 231–238, 264–289). Missing target IDs are allowed and
preserved. No generic link command/table, no backlink query, no archive. Map
deletion is a compound history entry.

**Persistence and evidence.** Record JSON round-trips through both adapters;
CLI cross-record journey links NPCs/locations/factions/threads and verifies
reopen; frontend tests cover invalid relationships and missing targets in
threads/maps. No test exercises rename-plus-link resolution end to end; the code
resolves by ID at render time, which is source-inspected but not test-verified.
No test exercises the two-sided location/NPC duplicate behavior.

**Gaps and candidate journey.** Duplicate representations, no computed
backlinks, no archive/delete, and session links are transient. **J13
(PROPOSED):** create A/B/C plus a location/faction/thread; link A→B with a label,
A→location, A→faction, thread→A; reject self/duplicate/empty; leave one missing
target; save/reopen; rename B and verify links resolve; add an incoming-link
view; archive/delete a target and verify explicit unavailable behavior. No current
backlink/archive command exists.

### 4.9 Search, workspace, navigation, drafts, and undo

**Requirements and status.** Dockable workspaces, restoration, Back/Forward, a
command palette, and draft/commit separation are **Confirmed** for current
desktop behavior ([ui-ux](../ui-ux.md) lines 5–38, 96–123). Full-text search,
cross-record backlinks, and durable drafts/history are proposed or unresolved.
The current command palette is a first interactive pass, not a full search
service.

**Desktop behavior.** Workspace tabs/splits/scroll/navigation/sidebar state save
with the campaign and restore on open (`workspaces.tsx` lines 225–250 and
437–482; `session-store.ts` lines 260–292). Navigation is bounded to 100 entries,
skips deleted records, and does not add entries for scrolling/typing
(`session-store.ts` lines 107–140, 240–256; tests in
[`session-navigation.test.mjs`](../../ttrpg-gm-cm-app/tests/session-navigation.test.mjs)).
Search covers actions and record names/metadata, not note bodies or session text
(`command-palette.tsx` lines 48–246). Drafts: NPC/location/item/thread/faction
have explicit edit/cancel; item/thread drafts survive tab close; map edits apply
immediately; sessions are memory-only. Undo: NPC saved edits and map gestures
only, in memory; no shared desktop stream. Tests cover workspace restoration,
navigation deletion/invalid destinations, draft isolation, item/thread saves,
and map undo.

**CLI/core behavior.** No workspace or navigation actions. Record authoring
actions plus history; workspace JSON is preserved opaquely, not authored.
`system.describe` enumerates 39 methods and explicitly lists no frontend
workspace actions ([`session.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/session.rs)
lines 338–405; observed CLI `describe`).

**Gaps.** No full-text search, backlinks, global session search, durable
drafts/undo, or desktop shared-history UI. The command palette's “Search campaign”
label overstates note/session search. The documented named-layout switcher
(`Save as new`, `Manage layouts`, `Revert to saved`) and the recently-closed-tab
list / `Cmd+Shift+T` behavior ([ui-ux](../ui-ux.md) lines 13, 21–24) are not
implemented; the current workspace tabs and automatic layout capture are the
working subset. **J14 (PROPOSED):** search a note body, session recap, item
description, and thread origin; assert matching results and navigation without
changing drafts. **J10** covers history. Current workspace restoration is already
covered by tests.

### 4.10 Headless core, CLI, and desktop parity

**Requirements and status.** The confirmed direction is a UI-independent Rust
core, embedded Turso, JSON-RPC, and a machine-readable CLI that runs independently
of the desktop ([headless-core-plan](../headless-core-plan.md) lines 76–82,
100–125; [headless-development](../headless-development.md) lines 1–10). The
current headless foundation is implemented for campaign authoring; the full
product workflow is not.

**Current contract.** The CLI exposes 39 methods: `system.describe`,
`campaign.inspect/new/open/save`, `asset.import`, NPC list/get/create/update/
undo/redo, location list/get/create/update, faction list/get/create/update,
inventory get/update, item list/get/create/update/delete, thread list/get/
create/update, map list/get/create/update/delete, and history status/undo/redo
([`session.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/session.rs) lines
338–405). All campaign-state mutations require `expectedRevision` except
preparation-only `asset.import`; successful mutations return the accepted
revision and dirty state. Errors are structured (`validation`, `conflict`,
`not_found`, `storage`, `unsaved_changes`, `no_campaign`, `no_storage`) with
action and expected/actual revisions. The CLI does not attach to a desktop
session, has no autosave, and discards unsaved work at EOF. `campaign.inspect`
is GM-only.

**Storage/compatibility.** Turso is pinned to 0.8.0; the adapter reads database
versions 1–7, writes v7, verifies assets, rejects future versions, enforces FKs,
rolls back failed writes, and honors `.campaign.lock`. Tests cover Turso v1–v7
reads and upgrades, a complex v7 fixture round-tripped legacy→Turso→legacy,
moved packages, rollback/FK/locking, and corrupt/missing assets. The desktop uses the temporary
`rusqlite` adapter over shared types; the default core has no Tauri/rusqlite/Rune
dependency. The current worktree adds large-response spooling and asset symlink
containment; those are existing uncommitted changes, not part of this report.

**Parity/gaps.** The CLI can author records but cannot create a game session,
present to players, search notes, navigate workspace, edit presentation
checkpoints, or perform a Save Copy. The desktop can do some of those but not
through the core contract. The headless history is campaign-wide and shared;
the desktop UI still only exposes NPC/map history. CLI and desktop validate at
different granularities: desktop record editors often update the frontend and
validate only at whole-campaign save, while CLI actions validate before commit.
This is acceptable for the current prototype but is not full parity.

**Candidate journey (PROPOSED):** J1/J2/J3/J5/J11 cover lifecycle, compatibility,
sessions, player-safe projection, and backup. Current headless authoring is
covered by the existing CLI journeys and the real temp-package run.

## 5. Future, proposed, and prototype-only areas

These are recorded so they are not lost and not mistaken for requirements.

| Area | Status | Current evidence |
| --- | --- | --- |
| Puzzles | Brainstorm; sample-only UI | `sample-section-page.tsx` and sample session references show three illustrative puzzles; no saved puzzle type, CLI action, or table in `schema.sql` ([`sample-section-page.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/sample-section-page.tsx) lines 25–53; [`sample-sessions.ts`](../../ttrpg-gm-cm-app/src/lib/sample-sessions.ts) lines 6–8) |
| Bestiary | Proposed in data model; no implementation | No bestiary type, import flow, source/version tracking, or UI; only [data-model](../data-model.md) lines 20–22, 45–53 |
| Encounters/initiative | Proposed/future | No encounter/token/initiative types or tables; maps docs lines 60–72 and data-model lines 20–27 |
| Fog, tokens, grids, measurement | Deferred | Map panel only renders image/pins/party; no code path for these controls (map-panel lines 24–259) |
| Session visits and session-to-place links | Deferred | [maps](../maps.md) lines 50–58 and [story-threads](../story-threads.md) lines 19–23; no persisted session |
| Crafting | Brainstorm | No code; [brainstorm-doc](../brainstorm-doc.md) lines 33–42 and backend-architecture module table lines 49–68 |
| Loot/chest video | Brainstorm | No code; backend-architecture lines 61–72 |
| Songs/media cues | Brainstorm/proposed | No code; [brainstorm-doc](../brainstorm-doc.md) line 16; backend-architecture media row |
| MCP/AI access | Proposed | No MCP server or endpoint; CLI exists. [brainstorm-doc](../brainstorm-doc.md) line 47; [backend-architecture](../backend-architecture.md) line 47 |
| Player companion/interactive player app | Future/proposed | [player-presentation](../player-presentation.md) lines 104–111; not implemented |
| Rune frontend | Deferred | [headless-core-plan](../headless-core-plan.md) lines 127–151; no Rune code |
| Turso Cloud/replication/network/multiplayer | Explicitly out of scope | headless-core-plan lines 84–98; no network client in core |
| Desktop attachment/remote control | Explicitly out of scope | headless-core-plan lines 100–108; CLI runs independently |
| Full backup/Save Copy/recovery | Missing, documented need | backend-architecture lines 39, 164; §3.3, D4 |
| Full-text search | Proposed; current palette searches metadata | command-palette lines 48–246 |
| Custom statblock fields/other rulesets | Future | data-model lines 74–101; only D&D 5.5e in current editor |

## 6. Cross-cutting contradictions, defects, and documentation drift

These are observations for review. They are not implementation instructions.

1. **Sessions are documented as a prototype but the product outcome is
   session-centric.** [sessions](../sessions.md) line 13 says content resets on
   reload; [brainstorm-doc](../brainstorm-doc.md) lines 14–16 and
   [data-model](../data-model.md) lines 15–18 describe persistent session prep/
   review. This is the main contradiction behind D1.
2. **Player knowledge is described as persistent, but no persistent model or
   projection exists.** [data-model](../data-model.md) line 43 and
   [player-presentation](../player-presentation.md) lines 71 and 92 describe
   persistent knowledge and safe payloads; the implementation has only a
   location authoring enum and a memory-only faction flag. D2.
3. **Relationship ownership is contradictory.** The prior acceptance map
   recommends NPC-side canonical links and preservation of location/thread
   lists ([headless-acceptance-map](../headless-acceptance-map.md) lines
   248–275), but the desktop edits location association lists independently
   (location-panel lines 181–185) and the faction chart is a third in-memory
   representation. D3.
4. **Rich-note instructions do not match the editor.** [development](../development.md)
   line 69 says “Insert an image with the note toolbar”; `npc-notes-editor.tsx`
   lines 139–140 disable image insertion, and no column plugin is registered.
   D5.
5. **Backup wording conflicts with the app.** [backend-architecture](../backend-architecture.md)
   line 39 says Save Copy is not provided; the desktop exposes “Save As…” and
   the palette describes “Save a copy to another location.” The CLI rejects a
   path change as Save Copy. The behavior may be acceptable, but the guarantee
   is undocumented and the desktop test is mocked. D4.
6. **Presenter checkpoint design is not implemented.** [player-presentation](../player-presentation.md)
   line 25 requires a saved checkpoint; `session-store.ts` lines 183–198 and
   260–292 keep only transient timestamps and reset them. D6.
7. **The headless docs have stale test counts.** [headless acceptance
   map](../headless-acceptance-map.md) lines 832–835 say 21 core + 11 CLI
   journeys; the current run has 21 core + 13 journeys + 3 CLI unit tests
   (all-features: 52 core + 13 + 3). This does not invalidate the tests, but the
   evidence ledger is stale.
8. **The previous acceptance map cites a replaced goal.** [headless
   acceptance map](../headless-acceptance-map.md) line 4 describes the
   campaign-authoring run in `goal.md`; the current `goal.md` is this readiness
   assessment. Treat that document as historical scope, not current authority.
9. **Documentation describes a “working headless slice” while the desktop and
   headless contracts diverge.** The desktop has five domain commands
   (`open_campaign`, `save_campaign`, `update_npc`, `undo_npc`, `redo_npc`), while
   the CLI has 39 methods and much richer validation/undo. This is expected
   during migration but means “implemented” must name the adapter.
10. **Release metadata is inconsistent.** The repository `LICENSE` is Apache-2.0
    and the data model says the project uses Apache-2.0
    ([data-model](../data-model.md) line 68), but the workspace Cargo manifest
    declares `license = "MIT"` (`Cargo.toml` line 8), inherited by the new
    `campaign-core`/`campaign-cli` crates. This needs a release/legal decision
    before distribution; it is not a runtime defect.
11. **Desktop notes/link drafts and headless persistence use different
    validation timing.** Desktop record editors commonly mutate the frontend
    campaign and rely on whole-campaign save validation; the CLI validates each
    action before applying. A failed desktop save can therefore surface a
    validation error later than the editor action. This is a reliability/
    UX gap, not proof that data is lost (failed saves are tested to preserve the
    previous package).

## 7. Candidate public-contract acceptance journeys (PROPOSED — none are current commands unless marked)

These are proposed tests for missing behavior, not an implementation approval.
Existing behavior that is already covered is referenced separately.

| ID | Stage | Proposed journey (clearly not an existing command unless stated) |
| --- | --- | --- |
| J1 | Prepare/review | **Current commands for the existing part:** create a campaign, author records/assets, save, terminate, reopen a fresh process, and assert all fields. **Proposed addition:** Save Copy to a second package, verify database/assets/hashes, reopen both. |
| J2 | Prepare/review | **Current commands:** open representative v1–v7 packages, save via both adapters, reopen; reject a future version without replacing the active campaign. Existing tests cover much of this; the proposed addition is a desktop/manual package check with workspace data. |
| J3 | Prepare/run/review | **No current session command.** Create a session, beats, links, prep/running notes, and player summary; save, terminate, reopen, edit, save again, and assert a second campaign cannot see it. |
| J4 | Prepare | **Current record commands plus proposed session link:** open an NPC and a location beside each other in a saved split, navigate links, rename a target, reopen, and assert layout/scroll/navigation and link resolution. |
| J5 | Run | **No current player projection.** Build an NPC/location/faction/item/thread/session projection with private notes, GM reference, statblock, hidden links, workspace, and unknown records; assert the payload contains only allowed fields and never those values. |
| J6 | Run | **No current player knowledge command.** Reveal an NPC/faction/location, assert it is known and projectable; keep another unknown; present the unknown one temporarily; assert permanent knowledge did not change. |
| J7 | Run (future) | **No current runtime command.** Author maps/pins, then reveal a player-safe map/pin/fog state, move a token/party marker, pause, and assert Live stays frozen. This is a future map-runtime goal, not the recommended session goal. |
| J8 | Run/review (future) | **No current visit command.** Record a visit from a map pin/session, append running notes, save/reopen, and assert ordered visits on the location and session. |
| J9 | Run | **No current presentation checkpoint command.** Pause/stage, close/reopen the player window and app, assert held frame/timer/tab state, resume, and discard stages. |
| J10 | Review | **Current headless history commands** for cross-record undo/redo/no-op/rejection/restart; **proposed desktop parity** and a decision on durable audit. |
| J11 | Review | **No current Save Copy command.** Save a package with multiple assets, Save As/copy it, move both, reopen, corrupt one asset, assert structured failure preserves the active campaign. |
| J12 | Prepare | **No current editor affordance.** Create a Plate note with image/caption/column/unknown node, save/reopen, assert all content survives and can be edited; current CLI JSON round-trip is not sufficient UI proof. |
| J13 | Prepare/review | **Current record commands for outgoing links; no backlink/archive command.** Link records, rename, leave a missing target, save/reopen, assert name resolution and unavailable state; add incoming-link display and archive/delete behavior. |
| J14 | Prepare/review | **No current full-text search command.** Search note bodies, item descriptions, thread origins, and session recaps; assert result ranking/navigation and that drafts are unchanged. |

## 8. Verification log and limitations

**Actually run** (from the repository root unless noted):

```text
cargo test --workspace --locked
  -> 21 core tests pass, 13 CLI journeys pass, 3 CLI unit tests pass
cargo test --workspace --all-features --locked
  -> 52 core tests pass, 13 CLI journeys pass, 3 CLI unit tests pass
cargo test --manifest-path ttrpg-gm-cm-app/src-tauri/Cargo.toml --locked
  -> 6 desktop image tests pass
cd ttrpg-gm-cm-app && pnpm lint
  -> pass
cd ttrpg-gm-cm-app && pnpm test
  -> 63 tests pass
cd ttrpg-gm-cm-app && pnpm build
  -> pass; only bundle-size/module-directive warnings
git diff --check
  -> pass on the inspected tracked changes
```

`git diff --check` does not inspect the three new untracked report files; a
separate trailing-whitespace scan of `docs/product-readiness/*.md` also passed.

**Real CLI journey.** A temporary package was created through `cargo run -p
campaign-cli -- run`: `campaign.new`, location/faction/NPC/item/thread/
inventory/map creation, `campaign.save`, inspect, then a second process
`campaign.open` + record list + `history.status`. Both processes exited 0. The
package contained `.campaign.lock`, `campaign.sqlite`,
`campaign.sqlite-wal`, and one content-hashed PNG; reopening found the records
and `canUndo: false`. A third run with `expectedRevision: 0` after opening at
revision 1 exited 1 with a structured `conflict` carrying expected/actual
revisions. This proves the public authoring/persistence path, not the missing
game-session or presentation workflows.

**Source inspection vs test evidence.** Desktop GUI behavior, the player window,
presentation layout, and session UX were inspected in source, not manually
exercised. The NPC player payload has no dedicated test; the inventory payload
does. The note editor's missing image insertion/columns was confirmed by source
configuration, not by a UI automation test (none exists). Save As was tested
only with mocked IPC, not a real package. The CLI methods and storage claims
have public-contract tests.

**Not run / not verified.** Interactive Tauri GUI, real second-display player
window, Tauri desktop packaging/build, multi-OS packaging, code
signing/notarization, crash recovery, network denial, Rune, desktop attachment,
and performance on representative large maps. `cargo clippy` and `cargo fmt
--check` were not run because this was a documentation-only assessment and no
code was changed; the cited tests, lint, and frontend build checks passed. No
original user campaigns were opened or modified; all storage checks used
temporary packages or generated data.

**Worktree note.** This report run added only the three files under
`docs/product-readiness/`. The pre-existing modified files listed in the README
were left untouched.
