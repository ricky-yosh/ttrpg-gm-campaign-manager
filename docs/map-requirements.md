# Map requirements: atlas, tactical tools, and headless behavior

**Status: requirements draft, not an implementation-completion report.**
The user's requested capabilities below are confirmed. Detailed recommendations
and open choices remain proposals; this document does not approve every proposed
mechanic or authorize a whole-map-system implementation in one agent run.

## 1. Scope and authority

Maps are both a linked campaign atlas and a tactical aid for running a session.
They must support meaningful core behavior before a frontend supplies the visual
controls. A saved image with pins is not a completed map feature.

Status labels used throughout:

- **Confirmed:** explicitly requested by the user for the map feature.
- **Existing direction:** established in [Maps](maps.md),
  [Data model](data-model.md#bestiary-creature-instances-and-npcs), or
  [Player presentation](player-presentation.md), but not necessarily implemented.
- **Recommended:** proposed detail to make a capability coherent and testable.
- **Open:** a product choice that must be resolved before implementing that part.

### Confirmed capability checklist

- Grid modes: **Hex, Square, None**.
- Snapping enabled or disabled.
- Tokens tied to NPCs and bestiary creatures, including enemies.
- Cone and circle tools to visualize attacks/areas.
- A ghost/path preview showing a proposed token move.
- A line/ruler with displayed measurements.
- Pins linked to locations on maps where useful; pins are not required on every map.
- Core-owned meaningful behavior, testable through the CLI and reflected by the
  eventual frontend.
- This depth of requirements applies to other intended GM-kit features too;
  completed CRUD alone is not a frontend-readiness gate.

### Approved first core slice

The user accepted starting with CLI-only scale, grids, snapping previews, and
measurement, before tokens/enemies and attack templates:

- Per-map units: feet, metres, or miles.
- Two-point calibration with a known distance.
- None/Square/Hex grids, including both hex orientations.
- Snapping on/off without implicitly moving saved objects.
- Straight-line distance by default; explicit grid-distance policies rather than
  an assumed universal TTRPG diagonal convention.
- Distance visualization, not movement-allowance enforcement or attack resolution.

The bounded implementation prompt is in `goal.md`. Its completion does not
complete the map feature. Other recommendations and open choices in this
document remain unapproved unless separately resolved; puzzles remain deferred.

### Implemented first slice (headless)

The first approved slice is implemented in the shared Rust core and public
JSON-RPC/CLI contract. It does not imply a completed tactical map or authorize
tokens, templates, fog, or frontend work.

- Public map points are normalized `{x,y}` in `0..1`, matching existing pins and
  party markers. Grid size/offset are image pixels. Calibration stores physical
  units (`feet`, `metres`, `miles`) and `pixelsPerUnit`.
- `map.calibrate` accepts two distinct normalized points and a positive known
  distance. It rejects coincident points, invalid units/numbers, and stale
  revisions without changing accepted state/history. `map.configure` changes
  scale units (converting the same physical scale), grid mode/visibility/size/
  offset/orientation, and snapping in revision-checked, undoable edits.
- None, Square, and both Hex orientations are implemented with nonzero
  alignment offsets. Square cell size is side length; hex size is circumradius.
  The offset is the centre of cell `(0,0)`. Exact formulas and tie behavior are
  documented in [Maps](maps.md#headless-map-geometry-implemented-first-slice).
- `map.snap` previews nearest-cell snapping with optional per-query override and
  returns requested/effective normalized and image positions, grid identity,
  cell addressing, and whether snapping applied. Grid visibility and snapping
  are independent; mode None disables snapping; hidden grids still snap.
- `map.measure` supports straight-line physical/image measurement plus explicit
  `square-equal-diagonals`, `square-alternating-diagonals`, and `hex-steps`
  policies. Alternating diagonal state carries across segments. Cell metrics
  require cell-centre endpoints or snapping and reject off-centre free-space
  input. Paths are bounded to 256 points; repeated/zero-length points are valid;
  out-of-map input is rejected rather than clamped.
- The API never rounds before summing; it reports `f64` values and leaves display
  rounding to clients. Straight measurement without calibration reports
  image-space distance/`imagePixels`, not invented physical units.
- Grid/scale/snap changes never move existing pins or the party marker. Queries
  read unsaved in-memory state, follow undo/redo, and leave revision, dirty
  state, history, assets, database, and WAL unchanged.
- Settings persist as additive `map_record` JSON fields without a table
  migration or database-version bump. Older maps load as uncalibrated, gridless,
  and unsnapped with their pins/party positions intact. Both storage adapters
  preserve the new fields; the real CLI journey saves, terminates, reopens, and
  repeats the same measurements.

The GM inspection/authoring endpoints are not player-safe. Still deferred from
this area: frontend controls/rendering, tokens and enemy instances, multi-cell
token anchors, ghost movement commits, attack templates, movement budgets,
terrain/elevation/pathfinding, fog/visibility, player projection, visits,
artwork remapping, and renderer performance claims.

### Current baseline, not the target

The current core supports map records with artwork/dimensions/kind, location
attachments, location pins, optional linked-map destinations, a party marker,
and the first-slice scale/grid/snap/measurement fields above, plus validation,
edit history, and persistence. See the
[implemented atlas](maps.md#implemented-atlas) and current
[headless contract](headless-development.md#implemented-contract).

Tactical tokens, attack templates, ghost paths, fog, and map presentation are
not established by that baseline. The existing NPC token-image field is artwork,
not a placed creature or enemy.

## 2. Core and frontend boundary

| Shared application core | Frontend-local mechanics |
| --- | --- |
| Map coordinates, scale, units, grid geometry, snapping policy | Screen/map coordinate conversion using the current camera |
| Distance and waypoint-path calculations | Pointer tracking, selection hit-testing, camera pan/zoom |
| Token identities, placements, and accepted movement | Smooth dragging, ghost drawing, animation |
| Canonical template geometry and numeric parameters | Handles, labels, paint, layering, visual affordances |
| Visibility/reveal rules and safe player projections | Render only the authorized projection |
| Validation, revisions, accepted edit history, persistence | Keyboard bindings and transient tool selection |

Preview and commit must use the same geometry and snapping rules. The UI may use
shared pure Rust geometry locally or request a core preview; it must not invent a
second rule set. No GPU, Rune, React, window, or screen-pixel type belongs in the
authoritative domain model.

**Recommended:** measurement/preview queries return useful geometry, distances,
units, and any applicable warnings without dirtying the campaign or recording
undo. Persisted configuration, placements, and retained templates use typed
revision-checked actions. A completed drag is one accepted edit, not an edit for
each pointer event.

## 3. Coordinates, scale, grids, and snapping

### Coordinates and calibration

**Existing direction:** map-space positions are independent of camera pan/zoom.
The current pins/party marker use normalized coordinates; extending maps must
preserve their locations, not silently reinterpret them as pixels or grid cells.

**Recommended:**

- Define one documented conversion between stored positions, image dimensions,
  physical distance units, and grid cells. Account for non-square images: equal
  normalized x/y differences do not necessarily represent equal distances.
- Support calibration from two distinct image/map points and a positive known
  distance, plus explicit inspection/editing of the resulting scale.
- Persist units and scale per map. Do not derive scale from monitor DPI or zoom.
- Distinguish physical units from cell counts. Without calibration, report
  explicitly unscaled distance rather than inventing feet/metres.
- Changing scale updates measured interpretation, not token positions. Artwork
  replacement/resizing must have an explicit preservation/remapping policy.
- Reject nonfinite coordinates, invalid dimensions, nonpositive scale, and
  coincident calibration points without changing accepted data/history.

### Grid modes

**Confirmed:** Square, Hex, and None.

**Recommended:**

- Square: configurable cell size and alignment offset.
- Hex: pointy-top and flat-top orientations, cell size, and alignment offset.
  Define the stored size convention (for example centre-to-centre spacing),
  rather than leaving clients to guess radius versus diameter.
- None: free positioning and calibrated measurement remain available.
- Grid visibility, grid topology used for distance, and snapping are distinct
  settings. Hiding a drawn grid must not silently change measurement rules.
- Grid changes preserve existing placements. Re-snapping existing tokens is an
  explicit operation with a preview and one undo entry, not a side effect of
  opening or changing grid settings.
- Persist alignment and geometry; define deterministic cell addressing and
  boundary/tie-breaking so CLI and UI agree.

### Snapping

**Confirmed:** on/off.

**Recommended:** persist a default per-map policy and allow an explicit
per-operation override. Define valid anchors for tokens with different footprints,
not just the nearest intersection for every object. A token centre/cell anchor,
a pin position, ruler endpoint, and template origin may need different policies.

With no grid, grid snapping is inactive; do not silently enable an invisible
square grid. Turning snapping off must retain grid display and allow continuous
positions. Merely toggling it must not move existing objects.

**Open:** which anchors and overrides the first implementation offers, including
multi-cell token anchoring and edge/corner placement for template origins.

## 4. Measurement and movement preview

### Ruler and path

**Confirmed:** measured line and ghost movement/path preview.

**Recommended:**

- Measure a straight segment or ordered waypoint path; report segment lengths
  and total, unit, metric, and whether snapping was applied.
- Keep the ruler's geometric distance and any movement-cost interpretation
  distinguishable. A proposed path is not automatically a legal move.
- Support calibrated free-space measurement with or without a drawn grid, and
  cell-based measurement where explicitly selected.
- Handle zero-length segments, repeated waypoints, map edges, fractional cells,
  and a route longer than the direct endpoint distance deterministically.
- Square-grid diagonals need an explicit metric: straight-line, equal-cost
  diagonals, or alternating diagonal costs. For an alternating rule, carry the
  diagonal count across path segments rather than restarting at each waypoint.
- Hex measurement must specify cell-step distance versus straight-line distance;
  both hex orientations must produce consistent results.
- Retain precision internally and define display rounding separately. Neither
  camera zoom nor label rounding may affect committed movement.

**Open:** supported metrics/defaults and whether a first tactical slice includes
movement budgets, difficult terrain, or elevation. Do not infer these from the
NPC statblock field-set setting.

### Ghost movement

**Recommended:** a proposal contains token/placement ID, starting revision and
position, ordered path points, and selected metric/snap policy. Preview reports
the proposed final placement and path distances. The original token stays put;
the frontend draws the ghost and path from this result.

Canceling changes no accepted state/history. Confirming applies one atomic move;
undo restores the prior placement and redo restores the committed one. Reject a
stale preview if the token, calibration, or relevant map state changed.

Cross-map moves require an explicit identity/placement policy and grouped undo.
Moving or previewing a token must not record a session visit, reveal an enemy,
switch the player display, or consume resources.

## 5. Tokens, NPCs, bestiary, and enemies

**Confirmed:** add tokens tied to NPCs and bestiary creatures; enemies must be
supported. **Existing direction:** the
[bestiary model](data-model.md#bestiary-creature-instances-and-npcs) separates
protected creature definitions from individual creatures in play.

| Concept | Responsibility |
| --- | --- |
| NPC | A named editable campaign character/dossier |
| Bestiary definition | Reusable creature type, artwork/default stats, source/version |
| Creature/enemy instance | An individual creature, with its own identity and any implemented mutable encounter state |
| Token placement | Where that character/instance appears on a specific map, with artwork and footprint overrides |

Three goblins from one definition are three individuals, not three movements of
one shared goblin. Moving a token does not mutate its definition or duplicate
its dossier. Removing a placement does not delete the linked character/creature.

**Recommended requirements:**

- Place, inspect, move, resize, rotate, hide/show, and remove a token placement.
  Specify meaningful dimensions/footprint separately from image crop/masking.
- Resolve linked NPC identity/artwork without copying a full dossier into each
  token. Retain source provenance and copied starting values for bestiary-derived
  individuals; library updates must not overwrite active creatures.
- Support distinct enemy instances from the same definition with independent
  placement and any approved HP/status state.
- Define behavior for missing source records/artwork, duplicate placements,
  off-grid footprints, overlap, and map deletion. Preserve context; do not
  silently delete campaign characters.
- Preserve instance identity and state when moving between maps.
- Existing direction permits creating an NPC from a creature in play as one
  undoable creation/relink operation, without resetting its current state.
- Campaign copies retain creature data/assets required to run offline.

**Open:** encounter ownership and instance reuse across maps; which HP/status/
initiative fields belong in the first enemy slice; bestiary import format and
campaign-local versus shared library scope. A full initiative/combat engine is
not implied by adding a token.

## 6. Attack-area templates

**Confirmed:** cones and circles for attack visualization/distance management.
The measured ruler line is confirmed; a thick beam/line-area template is an
additional **recommendation**, not an assumed user requirement.

**Recommended:**

- Circle parameters: centre and radius with explicit units.
- Cone parameters: origin, direction, range, and angle. Define whether it is a
  circular sector or another ruleset shape before implementing it.
- Inspect, place, move, rotate where applicable, resize, and remove templates;
  permit an origin anchored to a token as well as a free point.
- Return canonical map geometry and measurements for the renderer and CLI.
- Separate geometry from token-hit adjudication. Cell inclusion, centre-inside,
  footprint intersection, partial coverage, and exact-edge contact are different
  rules. If coverage highlighting is implemented, expose the chosen rule and
  return candidates only, not automatic damage/hits.
- Handle invalid radius/range/angle, missing anchors, out-of-map geometry, and
  precision at boundaries consistently.
- Define whether anchored templates follow later token movement. Moving or
  deleting an anchor must not silently relocate or delete retained content.
- Distinguish a temporary tool preview from a retained map template. Preview/
  cancel is not an edit; placing or editing retained content is undoable.
- GM-only previews are private. Showing a template to players requires explicit
  publication through presentation state and must respect Pause.

**Open:** cone shape, default angle, anchoring rules, coverage policy, and which
templates persist across save/reopen. Do not assume a particular game's spell
shapes or automatically apply damage, range legality, or saving throws.

## 7. Pins, locations, sessions, and linked maps

**Confirmed:** optional pins connect to location records.
**Existing direction:**

- A location has one source dossier and may have placements on multiple maps.
  Map attachment ("map of this place") differs from a pin ("appears here").
- Removing a pin preserves its location. Deleting a map clears incoming map
  shortcuts and placements without deleting linked locations/characters.
- Pins may open a more detailed map; returning restores navigation context.
- Session preparation may reference a location/pin; actual visits are explicit,
  ordered session events, not inferred from movement or browsing.

**Recommended:** retain stable pin IDs, validate destination links, expose
references for CLI inspection, and group creation of a new location with its
placed pin atomically. A canceled placement must not leave an orphan location.
Do not generalize every pin to every record type as an accidental schema change;
NPC/item/enemy pin associations need an explicit extension of current behavior.

## 8. Visibility, fog, and presentation safety

**Existing direction:** terrain fog, pin visibility, party knowledge, and current
presentation are distinct. Revealing terrain must not reveal secret pins or
enemy identities. Moving markers and ordinary GM navigation do not publish.

**Recommended:**

- Persist fog/reveal data in map coordinates, not a renderer-owned bitmap alone.
  Define reveal/conceal geometry, clipping, resolution, and undo grouping.
- Define player visibility for pins, individual tokens, templates, labels,
  movement ghosts, measurements, and selected-record details.
- Player output is a separate allowlisted projection. Exclude private record
  IDs/details where they would disclose hidden content, unrevealed map
  destinations, enemy stats, GM templates, and secret path endpoints.
- Do not send the full map model to players and hide it with drawing layers.
- Public measurement and template previews must not bypass frozen Live state
  while presentation is paused.

Dynamic lighting, wall drawing, collision/pathfinding, automatic line of sight,
multiplayer player control, automated targeting/damage, and map-art generation
are **not implied** by these tools. They require separate scope decisions.

## 9. Persistence, failures, and performance

**Recommended acceptance requirements:**

- Inspect all meaningful configuration and accepted state through the public
  core contract. Do not make agents simulate mouse gestures to author map data.
- Persist grid/scale, placements/identities, retained templates, fog/visibility,
  and explicit session references as each capability is introduced.
- Reopen existing packages without losing map positions or unrelated records.
  Use tested migrations, campaign copies, and both active storage adapters.
- Reject stale writes and invalid/missing map targets without partial mutations.
  Compound changes and their undo must be atomic.
- Queries and canceled previews leave revision, dirty state, history, and
  persisted files unchanged. History durability remains a separate policy.
- Benchmark representative map images, many placements, long paths, hex-grid
  extents, fog strokes, and repeated previews. Record fixtures, timing/memory
  baselines, and agreed budgets before claiming performance readiness.
- Cap malformed/unreasonably large operations with documented errors. Do not
  allocate an unbounded grid or coverage set for a huge range.
- Use lightweight inspection/projection results rather than repeatedly embedding
  every image in tactical queries. Rendering still needs separate native/input
  performance checks; CLI success does not prove smooth dragging.

## 10. Public-contract acceptance journeys

These are **proposed tests**, not existing CLI commands. Each implemented slice
needs success, rejection, history, and real-storage evidence.

| ID | Journey and proof |
| --- | --- |
| M1 | Calibrate an image; measure horizontal, vertical, diagonal, and waypoint paths; verify units, precision, non-square image conversion, and zero-length behavior. Save/reopen calibration. |
| M2 | Exercise Square, both Hex orientations, and None; align the grid; toggle snap; inspect deterministic endpoints and tie cases. Settings changes never move existing placements implicitly. |
| M3 | Place an NPC and three enemy instances from one definition. Move one; others and the source stay unchanged. Remove its placement without deleting the creature. |
| M4 | Preview a waypoint move and inspect ghost endpoint/length. Cancel changes nothing. Commit once, undo/redo once; reject stale position/grid revisions. |
| M5 | Place/resize/rotate a cone and a circle, inspect geometry, test boundaries and invalid dimensions. Verify temporary cancellation versus retained-template persistence. |
| M6 | Put hidden pins/enemies/templates under revealed terrain. Player projection excludes their private data. Publish permitted content; Pause freezes Live during subsequent GM edits. |
| M7 | Link a location to multiple maps, remove a pin, delete/undo a linked map, and verify source locations and incoming references survive according to policy. |
| M8 | Link prep to a place/pin, move the party without recording a visit, explicitly record a session visit, and inspect the saved history from both sides. |
| M9 | Save, terminate, move a temporary package, reopen, and verify accepted map state/assets and independent creature identities. Reject corrupt assets and future formats without replacing active state. |
| M10 | Run defined large fixtures with bounded previews/coverage queries and record performance evidence. Keep unit geometry tests plus real CLI journeys and later renderer checks. |

## 11. Suggested bounded implementation sequence

This is a recommendation, not authorization to start all phases. The non-rendering
part of steps 1–2 is now implemented as the headless first slice above; token
commit rules and renderer integration remain future work.

1. Settle coordinate/calibration and measurement policies; implement scale,
   units, ruler/path queries, and migration tests.
2. Add Square/Hex/None geometry and snapping with shared preview/commit rules.
3. Define bestiary source and individual enemy contracts; implement NPC/creature
   token placements and ghost movement without a combat engine.
4. Add cone/circle geometry, template lifecycle, and any approved coverage query.
5. Add fog, per-object visibility, and player-safe map projections integrated
   with the presentation contract.
6. Add explicitly scoped session/pin/visit and cross-map creature workflows.
7. Review the complete core acceptance matrix before frontend implementation;
   later validate input, rendering, native integration, and performance.

For every intended GM-kit feature, use the same requirements gate: user journey,
entities/relationships, actions/queries, core/UI ownership, persistence,
validation/failures, undo/redo, privacy, CLI acceptance, and explicit non-goals.
Do not replace a missing specification with "the frontend will figure it out."
This gate does not promote every brainstorm feature into the current release.

## 12. Decisions to review in manageable groups

1. **Distance and grid:** physical units, square diagonal metrics, hex step versus
   straight distance, snap anchors, and defaults. Recommendation: explicit
   per-map choices, independent of statblock system, with no hidden resnapping.
2. **Creature identity:** enemy instance/encounter ownership and multi-map reuse.
   Recommendation: protected definitions, stable individuals, separate placements.
3. **Attack tools:** cone geometry/angle, coverage semantics, anchor behavior,
   and retained versus temporary templates. Recommendation: geometric aids
   first, no automatic combat adjudication.
4. **Boundaries/lifecycle:** permitted out-of-map previews/placements, artwork
   resizing, missing sources, and cross-map movement. Recommendation: previews
   explain invalid commits; no silent clamping or data deletion.
5. **Fog/publication:** fog representation, token visibility under fog, and public
   ghosts/templates. Recommendation: explicit publication, private by default,
   with core privacy tests before any map is claimed player-safe.

Resolve only the group needed for the next bounded goal; do not ask the user to
pick storage types or implementation details. Recommendations here are not
approved answers.

## 13. Puzzles are deferred

The user wants to explore puzzles as plugin-like experiences. React versus Rune,
plugin execution, storage/package format, and AI generation remain undecided.
Do not implement the earlier suggested declarative puzzle model, choose a plugin
runtime, or make puzzles a prerequisite for this map work.
