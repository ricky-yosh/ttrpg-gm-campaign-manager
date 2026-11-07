# Goal: Build the headless campaign-authoring foundation

Build the headless campaign-authoring application for this repository:

CLI → JSON-RPC over stdio → Rust core → embedded Turso Database

The initial foundation already exists. Your job is to understand the documented product, establish an agreed scope, then extend and harden that foundation through complete, tested user workflows.

Do not treat “finish the migration” or “improve the architecture” as the goal. Work toward explicit acceptance criteria.

## Confirmed direction

- Use a UI-independent Rust core.
- Use embedded Turso Database, the Rust SQLite-compatible engine—not Turso Cloud or the older libSQL project.
- Expose application behavior through JSON-RPC and a machine-readable CLI.
- CLI sessions are independently headless. They do not need to attach to or control the running desktop app.
- Build and verify core behavior before implementing Rune.
- Rune will eventually be a lightweight client of the core.
- The eventual Rune replacement must preserve rich-note editing and dockable workspace capabilities.
- Keep the existing React/Tauri app during migration as a behavior reference and source of reusable code/tests.
- Preserve campaign data. Do not perform lossy document conversion or silently change the campaign format.

## Phase A: Understand the product and propose the scope

Do not begin broad implementation before completing this phase.

### Read the project documentation

1. Read AGENTS.md and all applicable nested instructions.
2. Discover and read all top-level documents in docs/.
3. Pay particular attention to:
   - docs/brainstorm-doc.md
   - docs/headless-core-plan.md
   - docs/headless-development.md
   - docs/backend-architecture.md
   - docs/data-model.md
   - The feature documents for NPCs, locations, factions, inventory, maps, image import, and player presentation.
4. Inspect the current headless implementation, relevant desktop behavior, and existing tests.

Read the documentation as a body of product requirements, not merely as background for extending the current prototype.

Distinguish:
- Confirmed requirements and decisions.
- Proposed behavior and unresolved questions.
- Descriptions of the current implementation.
- Superseded technology choices.
- Explicitly future features.

The confirmed direction above takes precedence over older React/Tauri-specific architectural proposals. Do not interpret every brainstorm idea as approved implementation scope.

### Produce a source-linked acceptance map

For each relevant workflow, record:
- Source document and section.
- Intended user outcome and required behavior.
- Requirement status: confirmed, proposed, unresolved, or superseded.
- Current implementation and test evidence.
- Missing work.
- Classification:
  - Headless behavior for this run.
  - Frontend/platform work deferred to a later run.
  - Future or unresolved work.
- Proposed public-contract acceptance journey.

Do not use the current implementation as the sole specification. It may be incomplete or differ from the documented intent.

Surface contradictions and consequential ambiguities. Recommend a resolution, but do not silently invent product behavior.

### Propose the implementation plan

Recommend a bounded campaign-authoring scope, ordered into complete vertical slices.

Identify:
- Acceptance criteria.
- Dependencies and highest-risk assumptions.
- Turso compatibility checks.
- Explicit non-goals.
- Decisions that need the user's input.
- A clear finish line.

The default scope is campaign lifecycle, NPCs, locations, factions, inventory, map authoring data, supported relationships, notes/assets, and campaign-edit history, where supported by confirmed requirements.

Presentation playback, complete workspace/navigation state, Rune rendering, and new brainstorm-only features are not automatically included. Identify core requirements they impose without expanding this run into building the entire product.

Present the acceptance map and proposed plan, then stop for approval. Do not interpret this prompt as approval of your eventual detailed scope.

## Phase B: Execute the approved plan

After the user approves the scope and plan, proceed autonomously on routine implementation details.

### Execution loop

Repeat until the approved acceptance checklist is complete or a genuine blocker requires a decision:

1. Select the smallest missing user capability that advances an approved acceptance journey.
2. Read its source requirements and inspect related implementation/tests.
3. Define or extend a behavior test through the public CLI/JSON-RPC contract.
4. Implement a complete vertical slice across:
   - Discovery and typed input.
   - Core application behavior and validation.
   - State ownership and revision checks.
   - History, where applicable.
   - Turso persistence and assets, where applicable.
5. Exercise success, rejection, and relevant operational failure paths.
6. For persisted behavior, save, terminate the host, reopen in a fresh process, and verify the results.
7. Run relevant regressions and review the diff.
8. Update the acceptance map and capability ledger with evidence and limitations.
9. Continue to the next incomplete slice.

Prefer working workflows over broad scaffolding. Do not spend the run building abstractions without demonstrating the user capabilities they enable.

Do not stop after each routine slice to ask what to do next. Use the approved plan.

## Engineering rules

### One application core

- The core owns authoritative application state and business rules.
- The CLI and protocol adapter must not implement separate business rules or write directly to the database.
- Reuse existing types, validation, asset handling, schema, and behavior where appropriate.
- Fix shared rules rather than patching individual adapters.
- Do not create a second permanent implementation of campaign behavior.

### State and failure safety

- Reject stale writes rather than overwriting newer state.
- No-op actions should not create history entries or unnecessary revisions.
- Rejected actions must not unintentionally change state, history, or persisted data.
- Failed opens must preserve the active campaign.
- Dirty campaign switches require explicit save/discard intent.
- Keep compound changes atomic where their semantics require it.
- Define when an action is applied in memory versus durably saved.
- Never blindly retry a mutation after an ambiguous process/connection failure.

### History

Follow confirmed product requirements and the approved history policy.

- Keep history bounded and meaningfully labeled.
- Cover creation/deletion and compound edits where included in scope.
- Separate campaign-edit history from local text typing, navigation, and presentation history.
- Do not assume history survives restart unless that behavior has been approved.

### Data and Turso

- Use a pinned, tested Turso version and committed lockfiles.
- Test only temporary campaigns and copies of legacy fixtures.
- Preserve existing rich-note documents, assets, and unrelated record fields.
- Verify actual transaction, constraint, migration, locking, and journal behavior rather than assuming complete SQLite compatibility.
- Keep database references consistent with installed assets.
- Reject unsupported future formats instead of attempting a best-effort overwrite.
- Do not enable cloud services, replication, or experimental database features without an approved need.

### Player safety

- GM inspection and player-safe projections are different contracts.
- Never send private GM data to a player client and rely on visual hiding.
- An ordinary authoring operation must not implicitly grant live publishing permission.
- Do not claim player-safety requirements are fulfilled by a GM-only inspection endpoint.

### Testing

- Use public-contract behavior journeys as the main integration evidence.
- Use focused unit tests for primitives and rules that benefit from them.
- Use real Turso and isolated filesystem storage for persistence tests.
- Make fixtures deterministic through injected clocks, IDs, and external dependencies where needed.
- Avoid arbitrary sleeps; use completion signals or bounded waits.
- Deny unexpected network access in behavior tests when establishing that test infrastructure.
- Make failures report the action/step, expected result, actual result, revision, and structured error without exposing secrets.
- Keep tests readable and independent; do not couple them through persistent working directories.

## Acceptance criteria

Refine these during Phase A and obtain approval before executing broad implementation.

The run is complete when:
- Every approved workflow is represented in the acceptance map.
- Each implemented capability is discoverable through the headless contract.
- Each capability has appropriate public-contract success, rejection, and persistence coverage.
- Representative cross-record journeys work from campaign creation through save/reopen.
- Existing notes, assets, relationships, and unrelated campaign data survive round trips.
- Relevant historical campaign schemas and representative complex records have compatibility coverage.
- The existing desktop app's relevant regression checks remain passing.
- Documentation accurately distinguishes implemented capabilities, known limitations, and deferred work.
- No acceptance item is marked complete solely because code exists or a unit test passes.

## Required checks

From the repository root:

cargo build --workspace --locked
cargo test --workspace --locked
cargo test --workspace --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo fmt --all -- --check
cargo test --manifest-path ttrpg-gm-cm-app/src-tauri/Cargo.toml --locked

From ttrpg-gm-cm-app:

pnpm lint
pnpm test
pnpm build

Run focused checks during iteration and the full applicable suite at completion. Exercise the actual CLI workflow as well as the tests.

Report checks that were not run, environmental blockers, and anything still assumed. Passing checks do not establish UI parity or comprehensive data compatibility by themselves.

## Out of scope unless separately approved

- Rune implementation.
- Replacing the rich-text editor or docking system.
- Deleting the existing frontend.
- Desktop attachment, remote control, or network listeners.
- Turso Cloud, replication, or multiplayer editing.
- New features found only in brainstorm documents.
- Generic plugin/framework architecture without a concrete approved use.
- Irreversible operations on real campaign packages.
- Pushing, merging, or publishing.

## Stop and ask when

- A requirement conflict changes product behavior.
- Progress requires an incompatible format change or lossy conversion.
- A Turso limitation changes required durability or storage semantics.
- A destructive or irreversible operation is necessary.
- An architectural decision materially expands scope or creates a new platform/service dependency.

Do not guess when the project context cannot resolve these issues.

When blocked, report:
1. The exact requirement and source.
2. What you tried and the evidence.
3. Plausible options and their consequences.
4. Your recommended option.
5. Which independent approved work can continue safely.

## Durable progress and final handoff

Maintain the approved acceptance map and update the existing capability ledger so another agent can resume without reading the entire conversation.

Record:
- Completed capabilities and test evidence.
- Remaining acceptance items.
- Decisions and their rationale.
- Known limitations and blockers.
- Exact commands needed to reproduce the current state.

At completion, summarize outcomes against the approved acceptance criteria, checks actually run, remaining risks, and the recommended next bounded goal.

Do not start a different goal merely because time or context remains.

