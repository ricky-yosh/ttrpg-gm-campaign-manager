# Maps and Exploration

Working design for a sandbox atlas that helps the GM track where the party is, what is nearby, and what to show players. See [UI/UX](ui-ux.md) for the app workspace and [Campaign Data Model](data-model.md) for related records.

The expanded [map requirements](map-requirements.md) define the atlas/tactical
target: Hex/Square/None grids, snapping, NPC and enemy tokens, movement ghosts,
measured paths, cones/circles, visibility, and core/CLI acceptance. They separate
user-confirmed scope from recommended details and unresolved gameplay choices.
The implemented atlas below is a baseline, not completion of that target.

The current visual direction retains the map canvas and comprehensive right-hand location preview, with child-location navigation and map thumbnails. There is no mini-map. Maps are added and opened through their own sidebar section; a visual library is deferred.

## Implemented atlas

Maps now persist as campaign records. Choose **Maps** in the sidebar to see all saved maps, then click a name to open its canvas. The heading’s **Add map** button opens the shared import dialog; a collapsed sidebar exposes the same action. Campaign search also opens individual saved maps or runs Add map. Import PNG, JPEG, or WebP artwork in the desktop app; the shared importer converts it to WebP and retains the existing 10 MiB upload limit. Map details include a name, kind, and optional attachments to locations. Artwork previews identify maps in location dossiers. Location pages attach existing maps and place location pins; new maps are added from the Maps sidebar. Edit details on the canvas renames or deletes a map and updates its sidebar entry.

Location cards distinguish **Maps of this place** (Open) from **Appears on** (Locate a pin). Attaching a map does not change location parentage. A location can have several maps and placements. Removing a pin preserves its location; deleting a map clears incoming map shortcuts and removes attachments while keeping location pages.

The Konva canvas retains Space-drag panning, trackpad panning, pointer-centered zoom, and Fit map. Select mode browses pins; Move mode enables deliberate pin/party dragging; the party tool places an approximate group marker. Add pin can select an existing place or stage a new location with an explicit parent. A staged new location is created only when its pin is placed. Map gestures form single undo steps, with bounded in-memory history for the current campaign. Editing map metadata separately can invalidate earlier history rather than overwrite newer edits.

The resizable, collapsible right preview shows the selected location's artwork, details, public description, child places, maps, and associated records. Browsing children retains canvas framing and works without pins. Open location opens its full dossier beside the map and collapses the preview so the map stays usable. Narrow map panes use an overlay preview. There is no mini-map.

Each saved map opens in its own Dockview tab. Back/Forward returns to linked maps; Locate selects and centers a placement. Camera centers are stored in map coordinates, so restoring a view or resizing a pane preserves framing. Camera, preview selection, and inspector settings are saved with the workspace. Legacy prototype and map-library tabs are removed on restoration. Old library history entries become Maps sidebar routes. A temporary empty component and backend layout recognition allow older campaigns to restore before these obsolete tabs are removed; saved map records are retained.

SQLite version 5 adds `map_record`; versions 1–4 load with an empty map collection when the table is absent and upgrade on save. Map images use the campaign's hashed assets directory. Older app builds reject version 5 packages. Party knowledge and player output do not change when browsing or moving a marker. The headless core/CLI now implement calibration, grid configuration, snapping previews, and measurement without changing the database version; fog, tokens, attack templates, session visits, map presentation, and frontend grid/measurement controls remain future features described below.

## Headless map geometry (implemented first slice)

The shared Rust core and CLI now support the non-rendering foundation of the
tactical map: per-map scale/units, None/Square/Hex grid configuration, snap
previews, and straight or waypoint measurement. The desktop canvas does not yet
expose these controls, and there is no player-safe map projection.

### Coordinates and units

- Public map points are normalized `{x,y}` values in `0..1`, origin top-left,
  using the same convention as saved pins and the party marker. Convert to image
  pixels with `(x * width, y * height)`. Non-square images therefore produce
  different image/ground distances for equal normalized x and y offsets.
- Grid `size` and `offsetX`/`offsetY` are **image pixels**. `size` means square
  side length for Square, and hex circumradius (centre-to-vertex) for Hex. The
  offset is the image-space centre of cell `(0,0)`: square `(col,row)=(0,0)` or
  hex axial `(q,r)=(0,0)`.
- Calibration stores a physical unit (`feet`, `metres`, or `miles`) and
  `pixelsPerUnit`, computed as the Euclidean image-pixel distance between the
  two calibration points divided by the known distance. Physical distance is
  image-pixel distance divided by `pixelsPerUnit`. It never depends on camera zoom, viewport size, display DPI,
  or a statblock ruleset.
- Changing units requires an existing calibration and converts its scale to
  preserve the same physical distance. Calibration from two points is the action
  that sets units and changes the intended physical scale. Calibration and grid
  changes never move pins or the party marker.
- The API retains full `f64` precision and never rounds before summing path
  segments. Display rounding belongs to a client. Tests compare with numeric
  tolerance rather than implying rounded storage.

### Grid geometry and snapping

- **None:** no grid snapping and no cell-based measurement; calibrated
  straight-line measurement still works. A stored snap preference is inactive.
- **Square:** cell `(col,row)` centre is
  `(offsetX + col*size, offsetY + row*size)` and its cell spans half a `size`
  around that centre. Snapping picks the nearest centre; an exact shared-edge
  tie goes to the larger column or row (east/south).
- **Hex, pointy-top:** axial `(q,r)` centre is
  `(offsetX + sqrt(3)*size*(q + r/2), offsetY + 1.5*size*r)`.
- **Hex, flat-top:** axial `(q,r)` centre is
  `(offsetX + 1.5*size*q, offsetY + sqrt(3)*size*(r + q/2))`.
- Hex `centerSpacing` reports the axial basis spacing (`sqrt(3)*size` by
  `1.5*size`, or the transpose for flat-top); `sizeMeaning` identifies the size
  as a circumradius. Clients do not infer radius versus diameter.
- Hex snapping chooses the nearest cell centre. An exact tie chooses the
  smallest `q`, then the smallest `r`. Snapped centres outside the image are
  rejected rather than clamped.
- Grid visibility, grid topology, calibration, and snapping are independent.
  Hiding the grid does not change snapping or cell measurement. Toggling
  snapping never moves saved objects. Old maps load with mode None, visibility
  off, snapping off, and no calibration.
- `map.configure` replaces the complete grid object when supplied; omitting
  `grid`, `snap`, or `units` preserves the current value. Calibration units are
  changed only through `map.configure`, with recalibration available through
  `map.calibrate`.

### Measurement policies

`map.measure` accepts an ordered path of 2–256 normalized points and returns the
effective points, per-segment image distance, per-segment metric distance,
`imageTotal`, `total`, units, metric, and whether snapping was applied. Repeated
points and zero-length segments are valid and add zero. A path totals its
segments, not just endpoint separation.

- `straight` (default): Euclidean image distance, converted to calibrated
  physical units. Without calibration, `units` is `imagePixels` and no physical
  scale is invented.
- `square-equal-diagonals`: requires Square; every orthogonal or diagonal cell
  step costs 1 (`max(|dcol|,|drow|)`).
- `square-alternating-diagonals`: requires Square; diagonals alternate cost
  1, 2, 1, 2…, orthogonals cost 1. The diagonal state continues across waypoint
  segments, so splitting an equivalent diagonal route does not reset the count.
- `hex-steps`: requires Hex; one segment costs
  `(|dq| + |dr| + |dq+dr|) / 2` cell steps.

Cell metrics require endpoints at cell centres. With snapping enabled, endpoints
are snapped first. With snapping disabled, off-centre free-space endpoints are
rejected instead of being silently rounded. `units` is `cells` for cell
policies; image distances remain available separately. Cell measures do not
enforce movement allowances, terrain cost, elevation, attacks, or resource use.

The settings are additive fields in the existing `map_record` JSON, so no table
migration or database-version bump is required. Compatibility tests open older
map records with pins/party markers and complex unrelated records, apply the new
settings through Turso, and read them back through the temporary desktop
`rusqlite` adapter; both adapters preserve the same map record.

Both read-only queries read the current in-memory campaign, including unsaved edits
and undo/redo state, and leave revision, dirty state, history, assets, database,
and WAL unchanged. All of this is GM inspection/authoring; nothing here is a
player-safe map projection. See [Headless development](headless-development.md)
for the exact JSON-RPC requests, responses, and error behavior.

## Core idea: linked maps

The campaign can contain many maps at different levels of detail: world, region, city, building, dungeon, and battle. A pin on one map can open a more detailed map. For example:

`World → city pin → city map → NPC house pin → house or dungeon map → battle map`

This is navigation between linked map images, not a requirement for one enormous image with continuous zoom. The GM should have a clear path back to the previous map. A location may appear on more than one map without duplicating its notes.

## Objects on a map

| Object | Purpose |
| --- | --- |
| **Pin** | A fixed point of interest: city, house, shop, clue, treasure, encounter entrance, or anything worth noting. It links to one campaign record and can optionally open another map. |
| **Party marker** | The party's approximate position on world, region, or city maps. It can move from pin to pin without requiring battle-scale movement. |
| **Character token** | A movable participant linked to a character or enemy record. Most useful on battle or dungeon maps, but available on a city or world map if the GM wants to track individuals there. |
| **Fog** | Areas hidden or revealed on an exploration or battle map. |

Pins and tokens are map placements; the linked NPC, location, item, or enemy remains the source of its name, notes, and images. Moving or deleting a pin should not delete that campaign record.

## GM workflow

1. Place pins while preparing a map. A pin can create a new location or link to an existing one.
2. Add the details that matter at that point: who is there, what players might notice, clues, items, associated images, and private GM notes.
3. During play, move the party marker or character tokens as the players travel. Select a pin to open its linked record beside the map, keeping the current position visible.
4. When the party reaches a city, building, or dungeon entrance, open its linked map. Carry the navigation context forward so the GM knows where they came from.
5. Explicitly choose when to present a map, pin, or image in Presenter mode. Browsing private map notes must not reveal them to players.

A selected or reached pin could show a compact **At this location** panel: NPCs present, interactable details, clues, relevant story threads, and a button to open the linked map. This is a navigation aid for the GM, not an automated encounter trigger.

## Connection to sessions

Maps and locations persist across the campaign; sessions refer to them. A pin can participate in many sessions without duplicating the pin or the linked location record.

- **During prep:** Link a session story beat to a location or pin. On the map, the GM can highlight places planned for the current session and open the matching notes.
- **During play:** When the party actually goes somewhere, the GM can choose **Mark visited in this session** and add a short note about what happened. Moving a token alone should not create a visit, since the GM may reposition tokens while preparing or correcting the map.
- **When reviewing:** A location or pin shows which sessions mentioned it and when the party visited it. A past session shows its linked places and visits in order.

The visit history can determine whether a place has been visited. **Discovered** is a separate state: the party may know about the NPC's house before going there. Whether a pin is currently visible on the player screen is separate again.

## Player visibility

- The GM map can show all pins and private notes. Each pin can be hidden, visible, or revealed during play on the player-facing map.
- A player-visible pin may have a public label and image without exposing its private GM notes.
- Fog and pin visibility are separate: revealing terrain need not reveal a secret location pin.
- Switching maps in the GM workspace does not automatically change the projector. The GM uses Presenter mode to decide when players see the new map.

## Map-specific behavior

- **World and region maps:** Emphasize landmarks, routes, and an approximate party position. Exact grid movement is optional.
- **City maps:** Emphasize point-crawl destinations such as homes, shops, factions, and entrances. Pins can open location details or interior maps; the GM can use a party marker or individual tokens.
- **Dungeon and exploration maps:** Support room or area pins, fog of war, and tokens where useful.
- **Battle maps:** Support character and enemy tokens, grid snapping, measurement, and initiative.

The map kind provides useful defaults, but should not prevent a GM from placing a pin or token where it helps their campaign.

## Data and commands to consider

- A map stores its image, kind, view settings, optional grid and scale settings, and placed objects.
- A pin stores map coordinates, discovery state, player visibility, label/icon overrides, a linked record ID, and optionally a linked map ID.
- A token placement stores the map, position, and linked party/character/enemy ID. Tokens on different maps are placements of the same record, not duplicate characters.
- A session story beat may link to a pin or location for planned content. A session visit records a session ID, location or pin ID, order, and optional notes for what actually happened.
- Candidate commands: `AddMapPin`, `MoveMapPin`, `UpdateMapPin`, `RemoveMapPin`, `LinkPinToMap`, `SetPinVisibility`, `MovePartyMarker`, `PlaceToken`, `MoveToken`, `RemoveToken`, and `PaintFog`.
- Session-related commands include `LinkStoryBeatToPin`, `RecordLocationVisit`, `UpdateLocationVisit`, and `RemoveLocationVisit`.
- A drag or fog stroke should become one undo step. Moving the party into a linked map may need one grouped command to preserve its former map and position.

## Map canvas tooling

The map canvas is a separate integration to evaluate alongside the note editor. **Confirmed scope:** artists create the map artwork outside the app. The app imports and displays those images, adding pins, tokens, fog, grids, measurement, pan/zoom, and links to other maps. Map-art generation and tools for drawing terrain, rooms, or walls are outside the current scope.

**The implemented atlas uses Konva + react-konva** for the shared interactive map canvas. It supplies React bindings for images, shapes, layers, pointer events, dragging, and tweening; its official examples demonstrate pointer-centered zoom. The headless core now owns grid snapping and measurement geometry; the canvas still needs controls, rendering, fog editing, linked-map navigation, and command integration for those core actions. Sources: [React integration](https://konvajs.org/docs/react/index.html), [zoom example](https://konvajs.org/docs/sandbox/Zooming_Relative_To_Pointer.html), [license](https://github.com/konvajs/konva/blob/master/LICENSE).

Alternatives: [Leaflet](https://leafletjs.com/reference) supplies image overlays, markers, and pan/zoom with `CRS.Simple` for non-geographic maps; it is worth evaluating if atlas navigation dominates. [PixiJS](https://pixijs.com/8.x/guides/getting-started/intro) with [pixi-viewport](https://github.com/pixijs-userland/pixi-viewport) is an alternative for GPU-rendered scenes if representative map tests show a need. These alternatives are historical evaluation context; Konva/react-konva is installed and used by the current atlas.

Keep map-space positions separate from camera pan/zoom. Opening a child map uses its ID and restores its own camera; returning restores the previous map's camera. Renderer objects are not the database model. Persist pins, tokens, fog, and camera state through the application boundary, and render the player window from its explicitly safe projection. Evaluate a large representative map, token dragging/tweening, fog, and two-window output in Tauri before settling the renderer.

## Questions to discuss

- Does the GM move a single party marker on world/city maps, or individual character markers there too?
- Should reaching a pin simply open its details when clicked, or also surface a subtle nearby prompt as the party marker approaches?
- Can a pin link to multiple maps, such as an exterior, floor plan, and battle map?
- Should the GM mark discovery manually, or should presenting a pin to players mark it discovered?
- How should the GM move between related maps: breadcrumbs, a map tree, or both?

## References

- [LegendKeeper maps](https://www.legendkeeper.com/features/) show nested maps and linked pins as a worldbuilding pattern.
- [Foundry Map Notes](https://foundryvtt.com/article/map-notes/) show pins linked to journal entries; deleting a placement does not delete its source entry.
