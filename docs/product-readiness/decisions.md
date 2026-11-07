# Product decisions

This file contains only unresolved product questions with meaningful
consequences. Technical choices such as Rust type layout, JSON-RPC naming, or
crate boundaries are deliberately excluded. Every recommendation below is
**not approved**; the report records a recommendation for human review, not a
new requirement.

> **Implementation update after this assessment.** The core/CLI part of D1 has
> been implemented: game sessions persist through schema version 8 and the
> `session.list`/`get`/`create`/`update` actions. The desktop Sessions UI remains
> memory-only. D1 still requires a product decision for the desktop authoring,
> lifecycle, and presentation surfaces.

Priority order:

1. **D1** and **D3** block the recommended next bounded goal.
2. **D2** and **D6** block claiming a player-facing session workflow.
3. **D4** and **D5** bound release safety and authoring fidelity; they do not
   block a text-first saved-session slice.

## D1 — Should a game session become a first-class saved campaign object?

**Question:** Should the game sessions a GM prepares and plays be saved campaign
records with their own lifecycle, or remain an in-memory scratchpad?

**Requirement and contradiction.** The product's stated outcome is preparing,
running, and reviewing TTRPG sessions ([brainstorm-doc](../brainstorm-doc.md)
lines 7–16; [data-model](../data-model.md) lines 15–18). The current
[sessions document](../sessions.md) lines 5–13 explicitly describes a frontend
prototype whose content stays in memory and resets on reload or campaign
replacement. There is no session table in
[`schema.sql`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/schema.sql) and no
session action in the CLI discovery list
([`session.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/session.rs)
lines 338–405). This is a product contradiction, not merely a missing screen:
the working product's organizing object is intentionally transient.

**GM example.** A GM prepares “The Low Tide” with three story beats, links the
Dockworkers’ Guild, Niya Jade, and the Eastern Seawall, runs the session, and
writes what happened. If the app reloads or the GM opens another campaign before
the next game, all of that work disappears. The app can remember the opened NPC
tabs but not the session that made them relevant.

**Plausible options.**

- **A. First-class saved session records (recommended, not approved).** Add a
  session record, ordered beats, private prep/running notes, a player summary,
  and stable links. Sessions participate in save/reopen, revisions, and a
  defined deletion/archive policy. A desktop migration would add a database
  version; the headless adapter would expose list/get/create/update actions.
- **B. Save only the post-game recap.** Keep prep as a scratchpad, then persist a
  recap record. This is smaller, but the GM still cannot prepare a session ahead
  of time or recover an unfinished plan.
- **C. Keep sessions memory-only and frame them as a temporary scratchpad.** This
  preserves current behavior but contradicts the stated user outcome and makes
  “review previous sessions” impossible without external notes.
- **D. Persist a generic note page rather than a structured session.** This
  avoids a new domain object but loses ordered beats, session grouping, and
  link semantics; it also makes later review and player summaries harder.

**Recommendation (not approved).** Option A, with a deliberately narrow first
slice: session metadata, ordered beats, prep/running notes, player summary, and
links to existing records. Do not add visits, encounters, or player playback in
that slice. Define draft/commit behavior before implementation; desktop and CLI
must share validation and save semantics.

**Impact.** D1 blocks the recommended next goal. Record authoring, search,
workspace behavior, and the existing item/map deletion paths can proceed
independently. Session links should use the relationship decision in D3; if D3
is unresolved, implement session links as a one-way session-owned list with
unavailable-target display, not as synchronized reciprocal records.

## D2 — What does “known to players” mean, and when does content become player-visible?

**Question:** Which records or fields are player-safe, how does the party become
aware of them, and is that awareness persistent?

**Requirement and contradiction.** [Data-model](../data-model.md) line 43 says
player knowledge is persistent and separate from live presentation state;
[player-presentation](../player-presentation.md) line 71 distinguishes
“known to the party” from “on screen now” and line 92 requires private fields to
be excluded from the payload, not hidden visually. The implementation has only
partial signals: locations have saved `partyKnowledge`
([`location-data.ts`](../../ttrpg-gm-cm-app/src/lib/location-data.ts) lines
9–23), factions have a memory-only `known` flag in the prototype
([`faction-prototype.ts`](../../ttrpg-gm-cm-app/src/lib/faction-prototype.ts)
lines 14–35), and NPCs/items/threads have no persistent known/revealed state at
all. The player projection selects any NPC from the campaign
([`presentation-content.ts`](../../ttrpg-gm-cm-app/src/lib/presentation-content.ts)
lines 10–18).

**GM example.** The party has met Niya Jade but has not learned that the quiet
dock clerk is the villain. The GM opens the villain's NPC card in Presenter to
check a private detail. A player-facing system must not add the villain to a
Characters directory, reveal their portrait, or publish their player
description merely because the GM selected them. A location the party has heard
about is different from a location they have visited, which is different from a
secret location currently shown on a map.

**Plausible options.**

- **A. Per-record persistent knowledge state plus a separate on-screen state
  (recommended, not approved).** Each record is Unknown, Known, or Revealed with
  an explicit, undoable reveal action. Presenting a record may show it on screen
  without automatically making it permanently known. Public fields are still a
  separate authoring decision.
- **B. Automatic reveal on presentation.** Presenting an NPC or location adds it
  to the player directory. This is simpler but leaks identities the moment a GM
  previews or accidentally presents something; it also conflates temporary
  visibility with permanent knowledge.
- **C. Session-visit-driven knowledge.** Knowledge is derived from recorded
  visits/reveals; no independent per-record state. This fits exploration, but
  cannot express “the party heard about this faction” or “they know the name but
  not the portrait.”
- **D. No persistent knowledge model.** Treat every presentation as ephemeral and
  never build a player directory. This is honest for the current prototype, but
  it rules out the Characters/Factions/Locations views described in
  [player-presentation](../player-presentation.md) and makes the player window a
  slide viewer rather than a reference surface.

**Recommendation (not approved).** Option A. Store explicit knowledge state
separately from public/private field authoring and from the live screen. Start
with NPCs, factions, and locations; add items/threads only when they are part of
the player-facing contract. Require tests that assert private fields and
unknown records are absent from the player payload.

**Impact.** D2 blocks a player-facing session workflow and any claim that the
current player window is “player-safe” for more than its allowlisted NPC and
inventory payloads. It does not block saving and reviewing sessions, and it does
not block authoring private/public fields. D6 depends on D2 for any expanded
presentation scope.

## D3 — Which record owns a relationship, and what happens on rename, archive, or delete?

**Question:** When two records are connected, where is that connection authored,
how are backlinks shown, and what happens when one side is renamed, archived, or
deleted?

**Requirement and contradiction.** The previous acceptance map's approved policy
says NPC-side links are the canonical authored relationships, while location/thread
association lists are preserved and not synchronized
([headless-acceptance-map](../headless-acceptance-map.md) lines 248–275 and
438–442). The desktop still edits NPC links and location association lists
independently ([`npc-record-links.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/npc-record-links.tsx)
lines 39–128; [`location-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/location-panel.tsx)
lines 181–185), and the faction prototype maintains a third organization-chart
representation in memory
([`faction-prototype.ts`](../../ttrpg-gm-cm-app/src/lib/faction-prototype.ts)
lines 3–35; [`faction-panel.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/faction-panel.tsx)
lines 169–181). Missing targets are retained and shown as unavailable, which is
good for note preservation but leaves no cleanup lifecycle. There are no
computed backlinks on NPC/location/faction pages.

**GM example.** The GM links Niya Jade to the Dockworkers’ Guild on Niya's page,
then adds Niya to the guild's Members list in the faction prototype. Renaming the
guild should update both views. Deleting the guild should not silently erase
Niya's link; it should either keep an unavailable reference or archive the guild
with an explicit explanation. Today the two lists can disagree, and no
NPC/location/faction/thread deletion path exists.

**Plausible options.**

- **A. One canonical typed link model with computed backlinks (recommended, not
  approved).** A relationship edge has a source, target, type, and optional
  label. One side authorizes it; the other displays a read-only backlink.
  Archive preserves the target and marks it unavailable; hard delete only for
  item/map where current behavior is confirmed. Migration preserves existing
  fields without silently synchronizing them.
- **B. Synchronized reciprocal lists.** Editing either side updates both saved
  lists. This gives quick display but creates conflict, double-write, and undo
  complexity, especially when the same relationship is represented in a
  prototype chart.
- **C. Keep record-owned lists and deduplicate only in the UI.** This is closest
  to today and allows incremental work, but the underlying data can remain
  contradictory and backlinks are expensive to compute reliably.
- **D. Hard delete records and drop inbound links.** This is simple but violates
  the current preservation behavior and loses campaign context in old notes and
  sessions.

**Recommendation (not approved).** Option A for the link model, with a separate
answer for lifecycle: archive NPCs/locations/factions/threads; keep item/map
hard deletion as today; preserve missing targets as unavailable until the GM
explicitly re-links or removes them. Do not persist the faction organization
chart until its relationship model is reconciled with saved records. If a full
typed-link migration is too large for the session slice, implement
session-owned one-way links first and explicitly defer backlinks.

**Impact.** D3 blocks reliable backlinks, deletion/cleanup, and a complete
session-link experience. It does not block saving session text or using the
current outgoing link UI. It is the main prerequisite if the next goal includes
“connect the session to people, places, factions, and threads without duplicate
copies.”

## D4 — What backup and recovery guarantee is required before saved campaigns are relied on?

**Question:** Is a verified Save Copy/whole-package backup required for the next
release, or is the current “Save As + copy the folder yourself” behavior an
acceptable documented limitation?

**Requirement and contradiction.** [Backend architecture](../backend-architecture.md)
lines 39 and 164 require a consistent backup and describe a Save Copy that
captures the database and every referenced asset; line 39 says the app does not
provide Save Copy, ZIP export, pruning, or crash recovery. The desktop exposes
“Save As…” ([`native-menu.ts`](../../ttrpg-gm-cm-app/src/lib/native-menu.ts)
line 28; [`campaign-data.ts`](../../ttrpg-gm-cm-app/src/lib/campaign-data.ts)
lines 713–718), and the CLI deliberately rejects changing the path of an open
campaign ([`session.rs`](../../ttrpg-gm-cm-app/src-tauri/src/campaign/session.rs)
lines 635–663). The CLI can leave a `.campaign.sqlite-wal` sidecar, and a safe
copy must keep the package together ([headless-development](../headless-development.md)
lines 155–175).

**GM example.** After a session, the GM wants a snapshot before experimenting
with next week's prep. “Save As” can create a second package, but the UI calls it
save-as rather than a verified copy, and there is no check that the database and
every referenced asset can be reopened. If the app crashes after an unsaved
change, no recovery journal exists.

**Plausible options.**

- **A. Implement and verify a Save Copy/backup operation (recommended, not
  approved).** Copy the database at a consistent point and every referenced
  asset, verify hashes, and prove the copy opens. Keep the manual whole-folder
  copy documented as the fallback. Do not claim crash recovery.
- **B. Treat Save As plus the documented folder copy as sufficient for v1.**
  Smaller and honest if the UI and docs say exactly what is guaranteed; it does
  not satisfy the current backend-architecture wording about a verified backup.
- **C. Add autosave plus a recovery journal.** This addresses crash loss but is a
  larger storage and lifecycle change; it also creates new draft/persistence
  semantics for every record type.

**Recommendation (not approved).** Option A before calling saved campaigns
production-ready; if the next goal is strictly session authoring, document
Option B as the temporary limitation and keep the verified Save Copy as a
separate bounded follow-up. The CLI should continue to reject implicit Save Copy
until that operation exists.

**Impact.** D4 does not block implementing a session record, but it blocks a
truthful “safe to rely on for prep” claim and any release notes that imply
automatic recovery. It can proceed independently of D1/D2/D3.

## D5 — Must the first release meet the full rich-note requirement?

**Question:** Are inline image insertion and side-by-side columns required in the
next authoring release, or is the current text-first Plate editor sufficient
while the stored document format remains compatible?

**Requirement and contradiction.** The data model requires visual editing,
inline images with captions, and side-by-side text columns
([data-model](../data-model.md) lines 57–59). The current editor registers basic
blocks, marks, lists, images, and captions
([`npc-notes-editor.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/npc-notes-editor.tsx)
lines 130–146), renders existing images with captions and resize handles
(lines 21–127), but explicitly disables media insertion
(lines 139–140) and does not register the installed `@platejs/layout` column
plugin. [Development](../development.md) line 69 tells the GM to “Insert an image
with the note toolbar,” while [image-import](../image-import.md) line 16 says
GM notes do not offer image uploads. These statements cannot all be current.

**GM example.** A GM wants a session beat note with a map fragment on the left
and read-aloud text in a narrow right column. Today the stored JSON can round-trip
such a document if it exists, but the editor gives no way to create the image
node or a column layout.

**Plausible options.**

- **A. Implement image insertion and the column layout before claiming rich-note
  parity (recommended, not approved).** Add explicit affordances, tests for
  captions/unknown nodes, and a migration/read path for existing documents.
- **B. Narrow the release claim to text-first notes plus dedicated image fields.**
  Keep Plate JSON compatible, defer columns and inline images to the Rune/editor
  slice, and remove the contradictory instructions. This is the smallest honest
  path for session persistence.
- **C. Keep the current editor and document the gap.** This preserves current
  behavior but leaves a confirmed product requirement unmet and makes Rune
  parity harder to evaluate.

**Recommendation (not approved).** Option B for the immediate session slice:
save text-first Plate content and dedicated images without claiming full note
parity. Resolve A before a Rune cutover or a release that advertises visual
session prep. This keeps the session goal bounded while making the limitation
explicit.

**Impact.** D5 does not block a minimal saved-session slice. It blocks a claim of
authoring parity, and it matters for the Rune feasibility gate in
[headless-core-plan](../headless-core-plan.md) lines 144–151. It can proceed
independently of D1/D2/D3/D4.

## D6 — What is the first playable presentation scope, and must it survive Stop or restart?

**Question:** Is the first player-facing release limited to the current
NPC/inventory projection, and must Live/Next/Pause state, tabs, and accumulated
time survive Stop or an app restart?

**Requirement and contradiction.** [Player-presentation](../player-presentation.md)
lines 21–33 require a full presentation checkpoint saved after every change,
durable through Stop and restart; lines 49–56 require Live/Next staging; line
71 separates knowledge from on-screen state; lines 92–94 require an explicit
player-safe Live state. The implementation publishes only NPC/inventory content
([`presentation-content.ts`](../../ttrpg-gm-cm-app/src/lib/presentation-content.ts)
lines 10–18), keeps presentation timestamps in memory
([`session-store.ts`](../../ttrpg-gm-cm-app/src/stores/session-store.ts)
lines 183–198), resets them during session hydration (lines 260–292), and shows
a map placeholder in Presenter
([`presenter-view.tsx`](../../ttrpg-gm-cm-app/src/components/campaign/presenter-view.tsx)
lines 53–60). There is no saved presentation checkpoint in the campaign schema.

**GM example.** The GM pauses on a map, stages the next NPC card, closes the
player window, and reopens the campaign after a break. The product design says
the saved checkpoint should restore the held frame and timer; the current app
resets the timer and starts from an empty Presenter state.

**Plausible options.**

- **A. Limit the first release to NPC/inventory with explicit prototype status
  (recommended for near term, not approved).** Keep the current allowlist, make
  the limitations visible, and do not claim Live/Next durability. Add the other
  views and a checkpoint only after D2 is settled.
- **B. Implement the full presentation checkpoint and all documented views.**
  This is the complete product direction but is a large multi-window,
  persistence, and player-safe projection project; it should not be bundled into
  session persistence.
- **C. Remove presentation from the release scope until the player-safety and
  knowledge model is approved.** This is the most conservative option and avoids
  a half-contract; it also gives up the current useful NPC/inventory preview.

**Recommendation (not approved).** Option A until D2 is resolved; then implement
the checkpoint and additional views as a separate presentation goal. Do not
describe the current player window as a complete player-safe presentation
system.

**Impact.** D6 blocks any statement that running a full player-facing session is
ready. It does not block saved session prep, recaps, or desktop/CLI record
authoring. It is independent of D1 but depends on D2 for expanded content.

## Decisions not reopened here

- Item and map deletion are the only confirmed deletion operations; NPCs,
  locations, factions, and story threads have no deletion path. This is recorded
  as a lifecycle gap under D3 rather than a new question.
- `campaign.inspect` is GM-only. No headless player endpoint exists, and this
  report does not treat one as approved.
- Sessions in the CLI are **host/application sessions** (a process and its
  in-memory campaign state), not **game sessions**. The distinction is used
  throughout the inventory; the existence of `Session` in the Rust core does not
  provide game-session support.
- Rune, Turso Cloud/replication, network listeners, and desktop attachment are
  future scope and not proposed for the next goal.
- Puzzles, bestiary, crafting, loot/unboxing, media cues, fog/tokens,
  initiative, measurement, and session visits remain brainstorm or explicitly
  deferred features. They are not silently promoted to requirements by this
  report.
