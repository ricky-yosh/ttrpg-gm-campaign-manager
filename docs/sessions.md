# Sessions

## Frontend prototype

Open **Sessions** in the Campaign sidebar, then **All sessions** to browse or create a session. The sample campaign includes four filled-out examples: exploration prep, freeform social prep, a detailed recap, and a short recap; other campaigns start empty. Search by title or session number. Sessions are grouped as Upcoming or Previous; change the group in Edit.

Each session opens in a workspace tab. Use **Edit / Save changes / Cancel** for its title, number, optional date, Where we left off, Prep notes, What happened, and separate Summary for Players. Optional story beats have rich-text notes, a Planned / Happened / Skipped status, and Move up / Move down controls.

Related records group NPCs, locations, factions, story threads, and puzzles. NPC/location/faction/thread links open existing campaign records; puzzles have labeled sample options only in the demo campaign. Other campaigns show puzzles as unavailable until their implementation exists. Links describe relevance and do not record visits, encounters, or player knowledge.

**Quick capture** appends a private note to What happened from read mode. Edit drafts and unsubmitted captures remain available while navigating to other records. Cancel discards the edit draft; navigation does not save it.

This desktop prototype's session content stays in memory and resets on reload or campaign replacement. Save changes and Save note update this memory only; campaign saves do not include these transient session notes or session tabs. Other record tabs retain their saved layouts. No player-window presentation, visit tracking, or Connected sessions cards on other pages are included in this frontend prototype. The shared core/CLI now has a separate persistent session contract; see [Headless persistence](#headless-persistence).

## Headless persistence

The shared Rust core and CLI now persist game sessions separately from the
frontend prototype. A saved session contains its stable ID, title, number, date,
previous/upcoming grouping, the same four Plate note documents used by the
prototype (Where we left off, prep notes, what happened, and Summary for
Players), ordered story beats with Planned/Happened/Skipped status, and
references to saved NPC, location, faction, story-thread, and item records.
Missing targets remain stored and display as unavailable, matching the existing
record-link behavior. Session note images use the campaign asset pipeline.

The JSON-RPC actions are `session.list`, `session.get`, `session.references`,
`session.backlinks`, `session.create`, and `session.update`; mutations require
`expectedRevision`, and creation/update enter the shared edit history. Creation
and update both trim surrounding whitespace from the session title/date, beat
titles, and reference target IDs/labels before validation. Rich-note content is
left unchanged. Sending an accepted session back unchanged is a no-op and does
not advance revision or history. SQLite version 8 adds `session_record`. Versions
1–7 open with no sessions and upgrade on Save. The desktop Sessions UI remains a
memory-only prototype and has not yet been migrated to read or write these saved
records; the CLI/core contract is the persistent path in this slice. Player
presentation, visits, session-to-map-pin links, per-beat links, and rich-text
mentions remain future work.

### Resolve a session's references

`session.references` returns the session's authored links in their stored order.
Each descriptor is lightweight and identifies the target by kind plus stable ID;
it does not copy the target dossier.

```json
{"method":"session.references","params":{"sessionId":"session-8"}}
```

```json
{
  "revision": 12,
  "sessionId": "session-8",
  "references": [
    {"kind":"npc","targetId":"npc-1","label":"Witness","available":true,"name":"Niya Jade"},
    {"kind":"location","targetId":"location-1","label":"Last seen","available":true,"name":"Eastern Seawall"},
    {"kind":"item","targetId":"item-1","label":"Clue","available":false,"name":null}
  ]
}
```

`name` is the current live display name: the record name for NPCs, locations,
factions, and items, or the title for story threads. Missing targets stay in the
response with `available: false` and `name: null`; the authored `label` and
target ID are preserved. A nonexistent session returns the structured
`not_found` error. Use `npc.get`, `location.get`, `faction.get`, `thread.get`, or
`item.get` for the full dossier.

### Find connected sessions

`session.backlinks` returns every game session whose stored links reference the
exact `kind` + `targetId` pair, after the same surrounding-whitespace
normalization used when sessions are authored. It computes from session-owned
links; no reciprocal IDs are written to target records.

```json
{"method":"session.backlinks","params":{"kind":"npc","targetId":"npc-1"}}
```

```json
{
  "revision": 12,
  "kind": "npc",
  "targetId": "npc-1",
  "sessions": [
    {"id":"session-8","title":"The Low Tide","number":8,"date":"2026-11-14",
     "previous":false,"label":"Witness"},
    {"id":"session-3","title":"A Quiet Bargain","number":3,"date":"",
     "previous":true,"label":"Ally"}
  ]
}
```

Each matching session appears once, in campaign session-list order, with the
authored link label for that target. A valid pair with no references returns an
empty list. Lookup is allowed when the target record no longer exists, so
references survive item deletion; resolution then reports `available: false`.
Unsupported kinds and empty target IDs return `validation`. The kind must be
`npc`, `location`, `faction`, `thread`, or `item`.

Both queries are **GM inspection endpoints**, not player-safe projections. They
read the current in-memory campaign, including accepted unsaved edits and
undo/redo results, and never change data, revision, dirty state, history, or
saved files. Current names are resolved from live records, so renaming a target
changes lookup output without rewriting session links or labels. Stored IDs,
labels, order, and campaign documents are never rewritten by a query. They query
only the active campaign and return `no_campaign` when none is open.

## UI conventions

Session pages use the project's shadcn Card, Field, Button, NativeSelect, Empty, Badge, and Collapsible components. Named Tailwind container queries adapt spacing and columns to the workspace pane, with semantic theme colors. Sample prose and placeholder references live in `sample-sessions.ts`; real record names and links resolve from the current campaign. Shared drafts synchronize between workspace copies without resetting the editor on local typing.
