# Goal: Build headless map calibration, grids, snapping, and measurement

Implement the first tactical-map foundation through the shared Rust core and
public JSON-RPC/CLI contract. No frontend implementation is required or
authorized. This is a bounded slice of the complete map requirements, not the
whole map system.

## GM outcome

A GM or agent can configure an existing map's scale and grid, preview snapped
positions, and measure lines and waypoint paths without launching a window:

Configure map → calibrate scale → select grid and snapping → inspect preview
positions and distances → save → terminate → reopen → obtain the same results.

Example: 100 image pixels represent 10 feet. A straight horizontal 250-pixel
measurement reports 25 feet. Changing camera zoom would not change that answer.
An unsnapped query preserves its supplied position; a snapped query reports the
deterministic grid anchor without moving any saved pin or marker.

## Approved first-slice choices

The user accepted these defaults:

- Units are per map: feet, metres, or miles.
- Calibration uses two distinct map points and a positive known distance.
- Grids are None, Square, or Hex; support pointy-top and flat-top hexes.
- Snapping can be enabled/disabled; toggling it never moves existing objects.
- Straight-line distance is the default. Grid distance uses an explicitly
  selected, documented rule; there is no universal implicit TTRPG diagonal rule.
- Tools display distances. They do not enforce movement allowances, resolve
  attacks, or consume character resources.

Implement within this scope without seeking approval for routine technical
details. Do not interpret approval as including every recommendation in the full
map specification.

## Read and inspect first

Read `AGENTS.md` and applicable nested instructions, then:

- `docs/map-requirements.md`, especially coordinates, grids, snapping,
  measurement, core/UI ownership, persistence, and acceptance journeys M1/M2.
- `docs/maps.md`
- `docs/headless-development.md`
- `docs/headless-core-plan.md`
- `docs/data-model.md`
- Relevant current status notes in `docs/product-readiness/`.

Inspect current map domain types, validation, map create/update/get actions,
history, asset handling, discovery, both storage adapters, and CLI journeys.
Existing map pins/party positions are normalized coordinates; do not silently
reinterpret them as pixels or cell coordinates.

Game sessions and session reference queries are implemented. Preserve them and
other existing campaign behavior. Record the actual starting revision and dirty
worktree; do not redo prior goals.

## Required behavior

### 1. Coordinate and measurement contract

- Document the coordinate convention for every public input/output. Reuse
  existing normalized positions where coherent; keep image/map coordinates,
  physical units, and grid cells explicitly distinguishable.
- Convert normalized x/y using the respective image width/height. Test
  non-square maps; identical normalized offsets on different axes need not
  represent identical distances.
- Geometry and distances are independent of camera pan/zoom, viewport size,
  display DPI, and frontend framework.
- Preserve numeric precision internally. Specify reported/display rounding
  separately; never round before summing path lengths or snapping.
- Physical measurement requires calibration. An uncalibrated map must be
  explicitly inspectable as uncalibrated; either return clearly identified
  image-space distances or a structured error for a physical-distance request.
  Never invent a default feet-per-cell conversion.

### 2. Calibration and units

- Configure scale from two distinct points and a positive known distance with
  explicit units; expose the accepted calibration/scale for inspection.
- Support feet, metres, and miles without conflating them with cell counts.
  Changing a unit converts the same physical scale; recalibration is the action
  that changes the intended physical scale.
- Persist the scale and unit per map. Changing them does not reposition existing
  pins or the party marker, rewrite artwork, or reset grid alignment.
- Reject invalid/degenerate calibration, nonfinite values, nonpositive distance,
  invalid units, and missing maps without accepted-state/history changes.

### 3. Grid configuration

- Support None, Square, and Hex, with pointy-top/flat-top hex orientation.
- Configure alignment origin/offset and positive cell size in a documented
  map/image-space convention. Define exactly what hex size measures, including
  conversion to cell-centre spacing; clients must not guess radius vs diameter.
- Keep grid topology, overlay visibility, cell geometry, physical calibration,
  and snapping policy distinct. Hiding a grid is not the same as removing it.
- Grid changes and snap toggles must never implicitly move existing placements.
  Bulk resnapping and artwork replacement/remapping are outside this goal.
- Old maps default to no grid and no calibration, without moving their pins or
  marker. Define how a stored snap preference behaves when mode is None:
  grid snapping is inactive, not an invisible square grid.

### 4. Snap previews

- Expose a read-only position-preview query using saved grid settings and an
  optional explicit snapping override.
- For this point-geometry foundation, snap to nearest square/hex cell centres;
  document the square/hex cell addressing and exact boundary/tie behavior.
  Multi-cell token anchors and template edge/corner anchors are later work.
- Off means continuous positioning; None has no grid snapping. Return both the
  requested and effective positions and enough grid identity to inspect results.
- Preview and future commit paths must be able to reuse the same pure geometry.
  Do not implement a second rule in CLI argument handling.

### 5. Measured lines and waypoint paths

- Add a read-only query for a straight segment or ordered waypoint path.
  Return effective points, per-segment lengths, total, units, selected metric,
  and whether snapping was applied, plus current campaign revision.
- Use saved map settings unless the request explicitly overrides a supported
  policy. All returned values must be unambiguous about physical vs cell units.
- Provide straight-line measurement as the default. For explicit square-grid
  measurement, support equal-cost diagonals and alternating diagonal costs as
  named policies. For hexes, support cell-step distance as an explicit policy.
  These geometric policies do not infer a ruleset from NPC statblock settings.
- Specify valid endpoints for cell-based metrics and how off-centre input is
  handled. Do not silently round unsnapped free-space requests into cell steps.
  Reject incompatible combinations with actionable structured errors.
- Alternating diagonal costs carry their state across waypoint segments rather
  than restarting at each waypoint. Splitting an equivalent route must not
  reset the diagonal count.
- Zero-length segments and repeated waypoints are valid and contribute zero.
  A bent path reports the sum of its segments, not just endpoint separation.
- Preserve existing map boundary conventions; define behavior at edges and
  document rejected out-of-map requests. Do not silently clamp input.
- Reject malformed paths and unreasonable input sizes with bounded diagnostics.
  Use analytic distance/cell calculations; do not enumerate an entire map grid.

### 6. Actions, history, and storage

- Keep authoritative configuration and geometry in the UI-independent core.
  JSON-RPC/CLI adapters only decode, dispatch, and present machine-readable data.
- Make new operations discoverable with generated input schemas and explicit
  query/mutation classification. Prefer additive methods; preserve existing
  map methods and response contracts.
- Read-only geometry queries must not alter revision, dirty state, campaign
  data, history, assets, database, or WAL. Read accepted unsaved map changes,
  not just the last saved database state.
- Accepted configuration changes require expectedRevision and enter labeled
  campaign history. Reject stale writes; no-ops do not add edits/revisions.
- Validate and normalize through a coherent shared rule before applying edits.
  Ensure ordinary map updates cannot accidentally drop new settings.
- Save/reopen and undo/redo preserve configuration. Extend both Turso and the
  temporary legacy adapter so existing desktop saves can preserve the new data
  even though desktop controls are outside scope.
- Use the smallest tested, compatible persistence change. If a migration is
  necessary, it must preserve older packages, their positions, assets, sessions,
  relationships, and unrelated workspace data. Never test on original campaigns.
- All endpoints in this slice are GM inspection/authoring. Do not claim a
  player-safe map or publish geometry to players.

## Execution loop

1. Inspect the existing map contract and define precise input/output examples.
2. Add public-contract tests for one small capability, including failure cases.
3. Implement a complete core/discovery/storage slice where applicable.
4. Verify no-ops, stale writes, unchanged state after rejection, and read-only
   previews; test geometry primitives separately where useful.
5. Prove undo/redo and real save/fresh-process reopen.
6. Run regressions, review the diff, update docs, and continue within this scope.

Do not stop after routine slices to ask what to do next. Favor a few direct,
reusable geometry functions over a generic rules engine or renderer abstraction.

## Acceptance checklist

Use temporary campaigns and the actual public CLI/host:

- Discover the new operations and generated schemas.
- Create a non-square map; calibrate a known horizontal segment and verify
  horizontal, vertical, diagonal, fractional, and zero-distance results.
- Verify physically equivalent calibrations and unit conversions, plus rejected
  coincident points, invalid numbers, invalid units, and stale revisions.
- Exercise None, Square, and both Hex orientations with nonzero alignment
  offsets. Test known cell centres, neighbours, edges, and deterministic ties.
- Toggle grid visibility and snapping independently. Verify existing pins/
  marker coordinates remain unchanged and unsnapped preview preserves input.
- Measure direct and waypoint paths with per-segment/total assertions, repeated
  points, and each supported metric. Test alternating-diagonal continuity and
  incompatible/off-centre grid requests explicitly.
- Verify query output follows accepted configuration edits and undo/redo.
- Compare campaign state, revision, dirty flag, and history before/after queries,
  including dirty campaigns. Verify saved database/WAL are unchanged by queries.
- Verify configuration no-ops and rejected changes preserve state/history/data.
- Save, terminate, reopen, and remeasure with the same results and settings.
- Open/save representative older packages with existing pins/party markers and
  unrelated complex records; verify backward compatibility and adapter parity.
- Cover missing maps, no active campaign, unsupported settings, bounded large
  paths, and active-campaign isolation.

Property/unit tests for coordinate conversion, snapping idempotence, distance
symmetry, hex-neighbour steps, and numeric tolerance supplement real CLI
journeys. They do not replace persistence/contract evidence.

## Explicitly outside this goal

- Rune/React controls, canvas rendering, pointer events, camera code, screenshots.
- Token placements, NPC/bestiary/enemy instances, ghost-token movement commits.
- Cone/circle/beam templates, attack targeting, hit/damage calculation.
- Movement budgets, terrain cost, elevation, pathfinding, walls, dynamic lighting.
- Fog, visibility/reveal state, player-safe projection, presentation.
- Session visits, per-beat/map-pin references, relationship-model expansion.
- Artwork replacement/remapping, backup/recovery, map-art generation.
- Puzzles: plugin-like design is deferred; React/Rune, storage, execution, and
  AI generation remain undecided.

These remain in the broader requirements where applicable. Completing this goal
does not make the whole map feature or core frontend-ready.

Preserve unrelated dirty work. Do not commit, push, merge, publish, or change
real campaign data. Stop for a specific user decision only if a conflicting
product rule, incompatible migration, storage limitation, or scope expansion
prevents safe progress; report evidence and a recommended resolution.

## Required checks and handoff

From the repository root:

```sh
cargo build --workspace --locked
cargo test --workspace --locked
cargo test --workspace --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo fmt --all -- --check
cargo test --manifest-path ttrpg-gm-cm-app/src-tauri/Cargo.toml --locked
git diff --check
```

From `ttrpg-gm-cm-app`:

```sh
pnpm lint
pnpm test
pnpm build
```

Run a real CLI calibration/grid/measurement journey and fresh-process reopen
in addition to tests. Record exact commands, failures, checks not run, and
remaining assumptions. Do not claim renderer performance from geometry tests.

Update `docs/headless-development.md`, `docs/maps.md`, and
`docs/map-requirements.md` with implemented contract/examples, exact geometry/
unit/rounding conventions, compatibility evidence, and remaining limitations.
Keep confirmed requirements, proposed later features, and implemented behavior
distinct.

Finish with the supported workflow, changed files, verification evidence, and
remaining map work. **Stop when this slice passes; do not start tokens, enemies,
templates, frontend work, or another goal.**
