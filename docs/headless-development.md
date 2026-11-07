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
player-safe endpoint.

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
| `map.list` / `map.get` / `map.create` / `map.update` / `map.delete` | Saved map authoring data: kind, image, dimensions, location attachments, pins, party marker; deletion clears incoming map shortcuts |
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

### History policy

There is one core-owned, chronological edit history per campaign session:

- bounded to 100 entries and 16 MiB of serialized changes; a single change larger
  than the byte budget is not retained for undo;
- updates store field diffs, so unchanged image payloads are not copied into
  every entry; creation/deletion store the record plus its list position;
- covers NPCs, locations, factions, inventory, items, item fields, story threads,
  and maps;
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
- The Turso adapter reads database versions 1–7 and writes version 7. Missing
  v2–v7 collections default to empty; older packages upgrade on Save. Unknown or
  future versions are rejected without replacing the active campaign.
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
  two maps with pins/party/links, map deletion/undo, hashed images, save,
  terminate, reopen, and a second save/reopen;
- campaign-wide history for creation, updates, item/inventory compound changes,
  map-deletion cascades, no-ops, rejection safety, redo truncation, bounded
  length, and non-persistence across restart;
- v1–v7 database reads, v7 writes, v5/v6 upgrades, a complex legacy v7 package
  round trip through both adapters after moving the package, FK enforcement,
  transaction rollback, asset hashing/verification, and future-version rejection;
- JSON-RPC parse/request/method/parameter errors, notifications, CLI exit status,
  generated input schemas, and a real `run` workflow.

**Known limitations / deferred work:**

1. No player-safe projection or presentation playback. `campaign.inspect` is
   GM-only; no endpoint in this contract may be described as player-safe.
2. Sessions, session notes/beats/visits, puzzles, bestiary, crafting, loot, and
   other brainstorm-only features are not implemented.
3. Rune, workspace/navigation actions, rich-editor replacement, and desktop
   cutover are future work. The core preserves existing workspace JSON but does
   not author it.
4. Save Copy, backup/restore, crash recovery, initial-save cleanup, and asset
   garbage collection are not implemented.
5. The core accepts already-encoded PNG/JPEG/WebP images through
   `asset.import` (or data URLs in record payloads); PNG/JPEG→WebP conversion,
   animation/pixel-limit decoding, EXIF orientation, and native pickers remain
   desktop/platform work.
6. Fog, tokens, initiative, measurement, map presentation, and session visits
   are not implemented.
7. NPC/location/faction/story-thread deletion is not implemented. Item and map
   deletion are implemented and undoable.
8. Output schemas, subscriptions/event streams, operation cancellation, and
   deduplication/operation IDs are not implemented.
9. Historical compatibility uses representative generated fixtures, not an
   exhaustive collection of every real campaign package.
10. Turso's backup/checkpoint semantics are not claimed to match SQLite's online
    backup API; keep the whole package and take independent backups.

For each next capability: write a public-contract journey, implement the smallest
vertical slice, test rejection without unintended state/history changes, verify
save/reopen in a fresh process, run regressions, and update this ledger and the
acceptance map. Do not bypass the core with raw database edits.
