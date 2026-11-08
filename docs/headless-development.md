# Headless foundation

The working headless slice is **CLI → JSON-RPC stdio → Rust core → embedded Turso**.
Rune is not installed or required. The React/Tauri app remains available as the
behavior reference; do not delete it during migration.

The source-linked acceptance map and approved scope live in
[Headless acceptance map](headless-acceptance-map.md). That map is the durable
checklist; this document records the current contract, evidence, and capability
ledger.

## Build and check

Run from the repository root with a current stable Rust toolchain (validated with
Rust 1.99.1). Native build tools are needed by Turso's dependencies. Turso's Rust
API is pinned to `0.8.0`; commit and use the workspace lockfile, which also pins
the engine dependencies.

```sh
cargo build --workspace --locked
cargo test --workspace --locked
cargo test --workspace --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo fmt --all -- --check
```

The default build has no Tauri, Rune, or `rusqlite` dependency. `--all-features`
enables the temporary `legacy-sqlite` adapter and its persistence regression
tests, plus SQLite ↔ Turso compatibility fixtures.

The existing desktop host is still a separate Cargo project:

```sh
cargo test --manifest-path ttrpg-gm-cm-app/src-tauri/Cargo.toml --locked
cd ttrpg-gm-cm-app
pnpm lint
pnpm test
pnpm build
```

## Try the CLI

Discover operations, query/mutation grouping, and generated input schemas:

```sh
cargo run -p campaign-cli -- describe
```

Run a sequence in one session. Choose a **new, unused** destination:

```sh
cargo run -p campaign-cli -- run <<'EOF'
{"method":"campaign.new","params":{"name":"Headless demo","expectedRevision":0}}
{"method":"location.create","params":{"name":"Greyhaven","expectedRevision":1}}
{"method":"npc.create","params":{"name":"Scout","expectedRevision":2}}
{"method":"campaign.save","params":{"path":"headless-demo.campaign","expectedRevision":3}}
{"method":"campaign.inspect"}
EOF
```

`run` launches a child host, assigns JSON-RPC request IDs, and prints one response
envelope per input line. It continues after application errors and exits with
status 1 if any operation failed. Invalid CLI input or host/I/O failure exits
with status 2. No interactive prompts or human-formatted output.

Reopen in a new process:

```sh
cargo run -p campaign-cli -- run <<'EOF'
{"method":"campaign.open","params":{"path":"headless-demo.campaign","expectedRevision":0}}
{"method":"location.list"}
{"method":"npc.list"}
EOF
```

Game sessions follow the same pattern: `session.create` makes a session with a
title/number/date and blank note documents or supplied initial notes/beats;
`session.get` returns the full record; `session.update` replaces the ordered
beats, prep/running notes, recap, and NPC/location/faction/thread/item links.
`session.list` returns all saved sessions.

Resolve a session's links with `session.references`; the response preserves
authored order and labels, resolves live names, and keeps missing targets as
`available: false` with `name: null`:

```json
{"method":"session.references","params":{"sessionId":"session-8"}}
{"revision":12,"sessionId":"session-8","references":[
  {"kind":"npc","targetId":"npc-1","label":"Witness","available":true,"name":"Niya Jade"},
  {"kind":"item","targetId":"item-1","label":"Clue","available":false,"name":null}
]}
```

Find sessions that reference an exact kind + stable ID (with the same
surrounding-whitespace normalization used on authoring) with
`session.backlinks`. Results are deduplicated per session and returned in
campaign session-list order; an unknown but valid target returns an empty list:

```json
{"method":"session.backlinks","params":{"kind":"npc","targetId":"npc-1"}}
{"revision":12,"kind":"npc","targetId":"npc-1","sessions":[
  {"id":"session-8","title":"The Low Tide","number":8,"date":"2026-11-14",
   "previous":false,"label":"Witness"}
]}
```

Kinds are `npc`, `location`, `faction`, `thread`, and `item`. Unsupported kinds
and empty target IDs return `validation`; an unknown session ID returns
`not_found`. Target IDs use the same surrounding-whitespace normalization as
session authoring; stored IDs and labels are never rewritten by a query. Both
queries read the current in-memory campaign, including unsaved edits and
undo/redo state, and do not change revision, dirty state, history, or saved
data. They are GM inspection endpoints, not player-safe projections. Current
names come from live records, so a rename changes lookup output without
rewriting session links.

For interactive agents/test harnesses, use `cargo run -p campaign-cli -- serve`
or the built `target/debug/campaign serve`. Keep stdin/stdout open and send
newline-delimited JSON-RPC 2.0:

```json
{"jsonrpc":"2.0","id":1,"method":"campaign.inspect","params":{}}
```

Use IDs and the revision returned by the preceding action; never assume a
revision from an example. Revisions increase across campaign switches, saves,
and successful mutations. No-op updates leave the revision and history unchanged.
Parameters are named objects; unknown fields are rejected. Discovery schemas are
generated from the decoding types.

## Implemented contract

All campaign-state mutations require `expectedRevision` and return the accepted
`revision`; `asset.import` is preparation-only and intentionally does not.
Success means **applied in memory**, except Save, which means the database
transaction committed. There is no autosave: EOF releases the package lock and
discards unsaved work. `campaign.inspect` returns complete GM data; it is not a
player-safe endpoint. `session.references` and `session.backlinks` are also GM
inspection queries, not player-safe projections.

| Methods | Behavior |
| --- | --- |
| `system.describe` | Protocol version, query/mutation lists, input-schema catalog, limitations |
| `campaign.new` | Validated unsaved campaign; refuses to discard dirty work without `discardChanges` |
| `campaign.open` | Loads and validates before replacing state/history; requires explicit dirty-work discard |
| `campaign.save` | First save requires a new `.campaign` path; subsequent saves use the open package; Save Copy is rejected |
| `campaign.inspect` | Revision, dirty flag, selected package path, complete GM campaign |
| `asset.import` | Content-hashes an already-encoded PNG/JPEG/WebP data URL into an open package; preparation only, no revision/history |
| `npc.list` / `npc.get` / `npc.create` / `npc.update` | Inspect and author the full saved NPC dossier: Plate notes, banner/portrait/token, player description, GM reference, statblock, relationships, location/faction links |
| `npc.undo` / `npc.redo` | Compatibility views over the campaign history; require the latest edit to target that NPC |
| `location.list` / `location.get` / `location.create` / `location.update` | Saved locations, hierarchy, dossier fields, images, association lists |
| `faction.list` / `faction.get` / `faction.create` / `faction.update` | Saved factions with images and private notes; NPC affiliations live on the NPC |
| `inventory.get` / `inventory.update` | Atomic party inventory replacement with validated gold and entries |
| `item.list` / `item.get` / `item.create` / `item.update` / `item.delete` | Item catalog, typed custom-field definitions, values, images, deletion |
| `thread.list` / `thread.get` / `thread.create` / `thread.update` | Saved story-thread dossiers, Plate notes, and people/location/faction links |
| `session.list` / `session.get` / `session.create` / `session.update` | Persistent game-session preparation and review: title, number, date, previous/upcoming grouping, prep/running notes, recap, ordered story beats, and NPC/location/faction/thread/item links |
| `session.references` / `session.backlinks` | GM-only reference lookup: resolve a session's authored links by kind + stable ID with live names and missing-target state, or list the sessions that reference an exact target pair in campaign order |
| `map.list` / `map.get` / `map.create` / `map.update` / `map.delete` | Saved map authoring data: kind, image, dimensions, location attachments, pins, party marker, optional calibration, grid, and snap preference; deletion clears incoming map shortcuts |
| `map.calibrate` / `map.configure` | Revision-checked GM authoring for two-point scale calibration, scale units, grid mode/visibility/size/offset/orientation, and snapping; changes are undoable and never move pins or the party marker |
| `map.snap` / `map.measure` | GM-only read-only geometry: preview nearest square/hex cell centre snapping, or measure a straight/waypoint path with explicit physical or cell policies |
| `history.status` / `history.undo` / `history.redo` | One chronological in-memory campaign-edit stream with labels |

Application failures use JSON-RPC code `-32000` with a stable `error.data.code`
(`validation`, `conflict`, `not_found`, `storage`, `unsaved_changes`,
`no_campaign`, `no_storage`) plus the action and, for revision conflicts, the
expected and actual revisions. Standard parse/request/method/parameter errors use
standard JSON-RPC codes. Notifications run without responses. Batch requests are
not supported. Input lines are limited to 16 MiB.

Responses may exceed 16 MiB because a campaign can aggregate many individually
bounded edits and images. `run` spools each response from its own child host to a
private temporary file, validates the JSON and request ID, then forwards the
original envelope unchanged. The file is automatically removed when closed.
This avoids a second full in-memory response in the CLI, but requires temporary
disk space proportional to the largest response. The host still builds full
campaign snapshots in memory; compact projections and separate asset retrieval
remain future optimizations. An I/O failure after dispatch does not mean the
operation was rolled back; do not blindly retry a mutation.

### Map calibration, grids, snapping, and measurement

All public map points are **normalized map positions**: `{x,y}` on `0..1` over
the image width and height, with the origin at the top-left. They use the same
convention as saved pins and party markers. A point converts to image pixels as
`(x * width, y * height)`; equal normalized x/y offsets are therefore not equal
image or physical distances on a non-square map. Grid `size` and `offset` values
are **image pixels**, not normalized coordinates or cell counts.

Calibrate from two distinct normalized points and a positive known distance:

```json
{"method":"map.calibrate","params":{
  "mapId":"map-1","pointA":{"x":0.1,"y":0.5},"pointB":{"x":0.2,"y":0.5},
  "knownDistance":10,"units":"feet","expectedRevision":3}}
```

Calibration divides the Euclidean image-pixel distance between the two points
by `knownDistance`. For a 1000×500 image this example is a 100-pixel horizontal
segment, so the accepted map record contains
`"calibration":{"units":"feet","pixelsPerUnit":10.0}`. `units` is `feet`,
`metres`, or `miles`; it is a physical unit, never a cell count. Changing units through `map.configure` requires an existing calibration
and converts `pixelsPerUnit` so the same physical scale remains; calibration
itself sets the units, and recalibrating is what changes the intended scale.

Configure the grid and snapping independently:

```json
{"method":"map.configure","params":{
  "mapId":"map-1",
  "grid":{"mode":"square","visible":true,"size":100.0,
          "offsetX":150.0,"offsetY":100.0,"orientation":"pointy"},
  "snap":true,"expectedRevision":4}}
```

`grid`, when supplied, is a complete replacement object: include `mode`,
`visible`, `size`, `offsetX`, `offsetY`, and `orientation`. `mode` is `none`,
`square`, or `hex`; `orientation` is `pointy` or `flat` for hex and is stored
even for other modes. `size` means square side length in image
pixels, or hex circumradius (centre-to-vertex). The offset is the image-space
centre of cell `(0,0)` for both square and hex axial coordinates. For square
grids, cell `(col,row)` has centre
`(offsetX + col*size, offsetY + row*size)` and spans half a cell around it. For
pointy-top hex axial `(q,r)`, the centre is
`(offsetX + sqrt(3)*size*(q + r/2), offsetY + 1.5*size*r)`; for flat-top it is
`(offsetX + 1.5*size*q, offsetY + sqrt(3)*size*(r + q/2))`. Query results return
grid identity plus `centerSpacing` so clients do not infer radius versus
diameter. `visible` affects overlay display only: hidden grids still snap and
measure. `mode:"none"` makes snapping and cell metrics inactive regardless of
the stored snap preference.

Preview a position without moving anything:

```json
{"method":"map.snap","params":{
  "mapId":"map-1","point":{"x":0.24,"y":0.21}}}
```

```json
{"revision":5,"mapId":"map-1",
 "requested":{"x":0.24,"y":0.21},"effective":{"x":0.25,"y":0.2},
 "requestedImage":{"x":240.0,"y":105.0},
 "effectiveImage":{"x":250.0,"y":100.0},
 "snapRequested":true,"snapped":true,"cell":{"col":1,"row":0},
 "grid":{"mode":"square","visible":true,"orientation":"pointy","size":100.0,
         "sizeUnit":"imagePixels","sizeMeaning":"squareSideLength",
         "offset":{"x":150.0,"y":100.0},"offsetUnit":"imagePixels",
         "offsetMeaning":"centerOfCellZeroZero",
         "centerSpacing":{"x":100.0,"y":100.0}}}
```

An optional `snap` boolean overrides the saved preference for one query. Square
snapping chooses the nearest centre; a point exactly on a shared cell edge goes
to the larger column or row (east/south). Hex snapping chooses the nearest centre
and resolves an exact tie by the smallest `q`, then the smallest `r`. Snapped
centres outside the image are rejected rather than clamped. `snap:false` (or no
grid) returns the requested point unchanged with `snapped:false` and
`cell:null`.

Measure a straight segment or ordered waypoint path:

```json
{"method":"map.measure","params":{
  "mapId":"map-1",
  "points":[{"x":0.1,"y":0.5},{"x":0.35,"y":0.5}],
  "metric":"straight","snap":false}}
```

```json
{"revision":5,"mapId":"map-1","metric":"straight","units":"feet",
 "snapRequested":false,"snapped":false,
 "calibration":{"units":"feet","pixelsPerUnit":10.0},
 "points":[{"x":0.1,"y":0.5},{"x":0.35,"y":0.5}],
 "segments":[{"from":{"x":0.1,"y":0.5},"to":{"x":0.35,"y":0.5},
   "imageDistance":250.0,"distance":25.0,"units":"feet",
   "fromCell":null,"toCell":null,
   "diagonalSteps":null,"nextDiagonalCost":null}],
 "imageTotal":250.0,"total":25.0}
```

The default metric is `straight`. Without calibration it returns
`"units":"imagePixels"` and image-space totals instead of inventing a physical
scale. Explicit cell metrics are:

- `square-equal-diagonals`: each square step, including a diagonal, costs 1
  (`max(|dcol|,|drow|)`).
- `square-alternating-diagonals`: diagonals alternate cost 1, 2, 1, 2…;
  orthogonals cost 1. The diagonal state carries across waypoint segments.
- `hex-steps`: axial hex distance
  `(|dq| + |dr| + |dq+dr|) / 2` per segment.

Cell metrics require a matching grid. With snapping enabled, endpoints are
snapped first. With snapping disabled, both endpoints must already be cell
centres (within `1e-6` image pixels); off-centre free-space endpoints are
rejected instead of being silently rounded. Per-segment `distance` and `total`
use the selected metric's units (`cells` for cell policies); `imageDistance` and
`imageTotal` remain image pixels. Repeated waypoints and zero-length segments are
valid and contribute zero. A path reports the sum of its segments, not endpoint
separation. Requests are limited to 256 ordered points.

All public geometry values retain full `f64` precision. The API does not round
before summing; display rounding is a client concern. Inputs must be finite and
within `0..1`; out-of-map requests and snapped centres outside the image are
structured `validation` errors. Missing maps return `not_found`, and no active
campaign returns `no_campaign`. Read-only `map.snap` and `map.measure` read the
current in-memory campaign, including unsaved edits and undo/redo state, and do
not change revision, dirty state, history, assets, database, or WAL. All map
geometry methods are GM inspection/authoring endpoints, not player-safe
projections.

Map settings are additive fields inside the existing `map_record` JSON, so the
database schema stays version 8 and no table migration is required. Maps saved
before this slice load with no calibration, grid mode `none`, grid visibility
off, snapping off, and unchanged pins/party positions. `map.update` preserves
calibration/grid/snap when an older update payload omits those fields; use
`map.calibrate` and `map.configure` for explicit configuration changes.

### History policy

There is one core-owned, chronological edit history per campaign session:

- bounded to 100 entries and 16 MiB of serialized changes; a single change larger
  than the byte budget is not retained for undo;
- updates store field diffs, so unchanged image payloads are not copied into
  every entry; creation/deletion store the record plus its list position;
- covers NPCs, locations, factions, inventory, items, item fields, story threads,
  game sessions, and maps;
- no-op and rejected actions add nothing; a new edit after undo discards the
  redo branch; undo/redo conflicts if a record changed outside its history;
- cleared on New/Open and **not persisted**. A fresh process starts with no
  history, while saved campaign data remains;
- separately named and labeled from local text typing, navigation, and
  presentation history (which the headless core does not model).

`npc.undo`/`npc.redo` operate on the same stream and reject when the latest
campaign edit belongs to another record. `history.undo`/`history.redo` walk the
whole stream.

### Storage and compatibility

- Campaign packages are folders containing `campaign.sqlite` and `assets/`.
  Turso may leave a `campaign.sqlite-wal` sidecar; keep the entire package
  together. Save Copy/backup is not implemented.
- The Turso adapter reads database versions 1–8 and writes version 8. Missing
  v2–v8 collections default to empty; older packages upgrade on Save. Unknown or
  future versions are rejected without replacing the active campaign. Map
  calibration/grid/snap preference are additive `map_record` JSON fields, so
  this slice adds no table migration; maps without them load as uncalibrated,
  gridless, and unsnapped with their pins and party marker unchanged.
- The shared schema, domain types, validation, asset transformation, and history
  are used by the headless host and the temporary desktop `rusqlite` adapter.
  `commands.rs` stays in the desktop host; `migrations.rs`/`repository.rs` are
  behind `legacy-sqlite`.
- Images enter through record data URLs or `asset.import` and become immutable,
  content-hashed files under `assets/`. Loading verifies hashes and rejects
  missing, corrupt, or outside-package references. Unreferenced assets may remain
  after a failed save or unused import; cleanup is future work.
- Asset imports and both save adapters share the asset-directory containment
  check. An `assets/` symlink pointing outside the package is rejected before
  creating image files, including temporary files.
- Both adapters honor the advisory `.campaign.lock`; a second writer is rejected.
  The lock is not protection from arbitrary SQL tools or older app builds.
- The core links no network client. Behavior tests use local stdio, temporary
  directories, and real Turso; they do not enable replication, cloud, or
  experimental multi-process features.

The core accepts deterministic clock and ID implementations for tests; the host
uses the system clock and UUIDs. A CLI process owns its own session and does not
attach to the desktop app.

## Capability ledger and next work

**Proven by public-contract journeys and focused tests:**

- campaign creation, validation, first save, save-in-place, reopen in a fresh
  process, dirty-switch protection, failed-open preservation, stale-revision
  rejection with expected/actual revisions, and busy-package rejection;
- a cross-record journey covering factions, a location hierarchy, NPCs with full
  presentation and links, party inventory, item fields/values, story threads,
  persistent game sessions with beats/notes/links, two maps with pins/party/links,
  map deletion/undo, hashed images, save, terminate, reopen, and a second
  save/reopen;
- campaign-wide history for creation, updates, item/inventory compound changes,
  session creation/update, map-deletion cascades, no-ops, rejection safety, redo
  truncation, bounded length, and non-persistence across restart;
- session reference resolution and computed backlinks across all five supported
  kinds, including duplicate display names, kind + ID isolation, live rename and
  undo/redo, missing targets, item deletion/undo, read-only state preservation,
  save/reopen, and active-campaign isolation;
- map two-point calibration with feet/metres/miles conversion, non-square image
  conversion, straight horizontal/vertical/diagonal/fractional/zero/waypoint
  measurement, None/Square/both Hex grids, deterministic snapping and tie cases,
  equal/alternating square-diagonal and hex-step metrics, visibility/snap
  independence, unchanged pins/party markers, read-only state/file preservation,
  undo/redo, save/reopen, and active-campaign isolation;
- v1–v8 database reads, v8 writes, v5/v6/v7 upgrades, a complex legacy package
  round trip through both adapters after moving the package, FK enforcement,
  transaction rollback, asset hashing/verification, and future-version rejection;
- JSON-RPC parse/request/method/parameter errors, notifications, CLI exit status,
  generated input schemas, and a real `run` workflow.

**Known limitations / deferred work:**

1. No player-safe projection or presentation playback. `campaign.inspect`,
   `map.snap`, and `map.measure` are GM-only; no endpoint in this contract may be
   described as player-safe.
2. Session visits, puzzles, bestiary, crafting, loot, and other brainstorm-only
   features are not implemented. Game-session records persist through the core
   and CLI; the desktop Sessions UI remains a separate frontend prototype and
   does not yet edit those saved records.
3. Rune, workspace/navigation actions, rich-editor replacement, and desktop
   cutover are future work. The core preserves existing workspace JSON but does
   not author it.
4. Save Copy, backup/restore, crash recovery, initial-save cleanup, and asset
   garbage collection are not implemented.
5. The core accepts already-encoded PNG/JPEG/WebP images through
   `asset.import` (or data URLs in record payloads); PNG/JPEG→WebP conversion,
   animation/pixel-limit decoding, EXIF orientation, and native pickers remain
   desktop/platform work.
6. Fog, tokens, initiative, attack templates, player-visible map state, map
   presentation, and session visits are not implemented. Map calibration, grid,
   snapping-preview, and measurement geometry are core/CLI-only and do not
   include renderer controls, token footprints, movement budgets, terrain cost,
   elevation, or pathfinding.
7. NPC/location/faction/story-thread deletion is not implemented. Item and map
   deletion are implemented and undoable.
8. Reference lookup is session-scoped: `session.backlinks` covers session-owned
   links only, not NPC/location/thread association lists or arbitrary rich-text
   mentions. There is no universal relationship graph, backlink index, or
   player-safe projection of these queries.
9. Output schemas, subscriptions/event streams, operation cancellation, and
   deduplication/operation IDs are not implemented.
10. Historical compatibility uses representative generated fixtures, not an
    exhaustive collection of every real campaign package.
11. Turso's backup/checkpoint semantics are not claimed to match SQLite's online
    backup API; keep the whole package and take independent backups.

For each next capability: write a public-contract journey, implement the smallest
vertical slice, test rejection without unintended state/history changes, verify
save/reopen in a fresh process, run regressions, and update this ledger and the
acceptance map. Do not bypass the core with raw database edits.
