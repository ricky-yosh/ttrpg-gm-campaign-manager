# Headless foundation

The first working slice is **CLI → JSON-RPC stdio → Rust core → embedded Turso**. Rune is not installed or required. The React/Tauri app remains available as the behavior reference; do not delete it during migration.

## Build and check

Run from the repository root with a current stable Rust toolchain (validated with Rust 1.99.1). Native build tools are needed by Turso's dependencies. Turso's Rust API is pinned to `0.8.0`; commit and use the workspace lockfile, which also pins the engine dependencies.

```sh
cargo build --workspace --locked
cargo test --workspace --locked
cargo test --workspace --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo fmt --all -- --check
```

The default build has no Tauri, Rune, or `rusqlite` dependency. `--all-features` enables the temporary `legacy-sqlite` adapter and its existing persistence regression tests, plus a SQLite → Turso → SQLite round-trip check.

The existing desktop host is still a separate Cargo project:

```sh
cargo test --manifest-path ttrpg-gm-cm-app/src-tauri/Cargo.toml --locked
cd ttrpg-gm-cm-app
pnpm lint
pnpm test
pnpm build
```

## Try the CLI

Discover operations and their generated input schemas:

```sh
cargo run -p campaign-cli -- describe
```

Run a sequence in one session. Choose a **new, unused** destination:

```sh
cargo run -p campaign-cli -- run <<'EOF'
{"method":"campaign.new","params":{"name":"Headless demo","expectedRevision":0}}
{"method":"npc.create","params":{"name":"Scout","expectedRevision":1}}
{"method":"campaign.save","params":{"path":"headless-demo.campaign","expectedRevision":2}}
{"method":"campaign.inspect"}
EOF
```

`run` launches a child host, assigns JSON-RPC request IDs, and prints one response envelope per input line. It continues after application errors and exits with status 1 if any operation failed. Invalid CLI input or host/I/O failure exits with status 2. No interactive prompts or human-formatted output.

Reopen in a new process:

```sh
cargo run -p campaign-cli -- run <<'EOF'
{"method":"campaign.open","params":{"path":"headless-demo.campaign","expectedRevision":0}}
{"method":"npc.list"}
EOF
```

For interactive agents/test harnesses, use `cargo run -p campaign-cli -- serve` or the built `target/debug/campaign serve`. Keep stdin/stdout open and send newline-delimited JSON-RPC 2.0:

```json
{"jsonrpc":"2.0","id":1,"method":"campaign.inspect","params":{}}
```

Use the returned NPC ID and revision for subsequent edits:

```json
{"jsonrpc":"2.0","id":2,"method":"npc.update","params":{"npcId":"<returned NPC ID>","name":"Ranger","expectedRevision":2}}
```

Never assume revision 2 outside the example: inspect the current session or use the preceding action's result. Revisions increase across campaign switches and saves. No-op NPC updates leave the revision and history unchanged. Parameters are named objects; unknown fields are rejected. Discovery schemas are generated from the decoding types.

## Implemented contract

| Methods | Behavior |
| --- | --- |
| `system.describe` | Protocol version, method/input-schema catalog, limitations |
| `campaign.inspect` | Revision, dirty flag, selected package path, complete GM campaign |
| `campaign.new` | Validated unsaved campaign; refuses to discard dirty work without `discardChanges` |
| `campaign.open` | Loads and validates before replacing state/history; requires explicit dirty-work discard |
| `campaign.save` | First save requires a new `.campaign` path; subsequent saves use the open package |
| `npc.list` / `npc.create` | Inspect/create NPCs with generated IDs and valid initial note documents |
| `npc.update` | Optional name/notes updates through existing validation and saved-edit history |
| `npc.undo` / `npc.redo` | Existing bounded per-NPC saved-edit history |

All mutations require `expectedRevision`. Stale requests fail instead of overwriting newer state. Application failures use JSON-RPC code `-32000` with a stable `error.data.code`, such as `validation`, `conflict`, `storage`, or `unsaved_changes`. Standard parse/request/method/parameter errors use standard JSON-RPC codes. Notifications run without responses. Batch requests are not supported. Input lines are limited to 16 MiB.

Success means **applied in memory**, except Save, which means the database transaction committed. There is no autosave: EOF releases the package lock and discards unsaved work. A Save response does not promise that all data is in the main database file rather than its WAL; keep the entire package together.

## Sources and migration boundary

- `crates/campaign-core` is the UI-independent library.
- `crates/campaign-cli` owns JSON-RPC framing, the host executable, and the process-driving CLI.
- To retain one source of truth with minimal legacy churn, the core currently loads the shared campaign module from `ttrpg-gm-cm-app/src-tauri/src/campaign/`. The location is transitional; those shared sources contain no Tauri imports. Its `commands.rs` is excluded from the core.
- `session.rs` owns the headless working campaign, revisions, dirty state, and application operations. `storage.rs` implements the Turso adapter.
- `schema.sql`, domain types, validation, asset transformation, and NPC history are shared. `repository.rs`/`migrations.rs` remain the legacy `rusqlite` adapter behind a feature.
- `legacy_campaign.rs` connects the existing Tauri commands to that shared library. The desktop still owns its old frontend state/save orchestration; it has not been migrated to the new session API.

Both persistence adapters honor `.campaign.lock`. A headless host holds it for its session; desktop reads/writes hold it for their operation. Locks are advisory, not protection from arbitrary SQL tools or older app builds. The desktop does not hold a lifetime session lock, so do not edit the same package in both clients. Use campaign copies for compatibility experiments.

First save never overwrites an existing directory. A failed initial save can leave an incomplete destination; the in-memory campaign remains available, and a new unused destination can be selected for retry. No automatic deletion or repair of that folder is attempted. Save Copy and full backup/recovery remain future work.

## Capability ledger and next work

**Proven:** process-driven NPC authoring/validation/undo/redo, image round trips, explicit save/reopen, revision conflicts, dirty-switch protection, failed-open preservation, busy-package rejection, transaction rollback/retry, FK enforcement, future-version rejection, corrupt/missing asset errors, JSON-RPC error/notification handling, and a basic legacy-engine compatibility round trip.

**Not yet implemented:**

1. CLI authoring for the other existing record types, relationships, and presentation fields.
2. Core-owned navigation, editor sessions, presentation state, and autosave.
3. Creation/deletion undo and durable history.
4. Dedicated image-import commands, Save Copy, backups, crash recovery, and initial-save cleanup.
5. Injected clocks/ID sources, network-denial test guard, output schemas, subscriptions, and operation cancellation.
6. Comprehensive existing-package compatibility across all historic schemas and complex records.
7. Rune, rich-editor/workspace replacement, and desktop cutover.

For each next capability: write a public-contract journey, implement the smallest vertical slice, test rejection without unintended state/history changes, verify save/reopen, run regressions, and update this ledger. Do not bypass the core with raw database edits.
