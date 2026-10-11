# Maps and Exploration

Working design for a sandbox atlas that helps the GM track where the party is, what is nearby, and what to show players. See [UI/UX](ui-ux.md) for the app workspace and [Campaign Data Model](data-model.md) for related records.

For the current first-pass visual requirements, see [Maps — designer requirements](maps-designer-requirements.md): retain the existing map UI, expand the right-hand location preview with child-location navigation and map thumbnails, and omit a mini-map.

## Implemented atlas

Maps now persist as campaign records. Open the **Map library** from Maps, or find a saved map through campaign search. Import PNG, JPEG, or WebP artwork in the desktop app; the shared importer converts it to WebP and retains the existing 10 MiB upload limit. Map details include a name, kind, and optional attachments to locations. Artwork previews identify maps in the library and location dossiers.

Location cards distinguish **Maps of this place** (Open) from **Appears on** (Locate a pin). Attaching a map does not change location parentage. A location can have several maps and placements. Removing a pin preserves its location; deleting a map clears incoming map shortcuts and removes attachments while keeping location pages.

The Konva canvas retains Space-drag panning, trackpad panning, pointer-centered zoom, and Fit map. Select mode browses pins; Move mode enables deliberate pin/party dragging; the party tool places an approximate group marker. Add pin can select an existing place or stage a new location with an explicit parent. A staged new location is created only when its pin is placed. Map gestures form single undo steps, with bounded in-memory history for the current campaign. Editing map metadata separately can invalidate earlier history rather than overwrite newer edits.

The resizable, collapsible right preview shows the selected location's artwork, details, public description, child places, maps, and associated records. Browsing children retains canvas framing and works without pins. Open location opens its full dossier beside the map and collapses the preview so the map stays usable. Narrow map panes use an overlay preview. There is no mini-map.

Each saved map opens in its own Dockview tab. Back/Forward returns to linked maps; Locate selects and centers a placement. Camera centers are stored in map coordinates, so restoring a view or resizing a pane preserves framing. Camera, preview selection, and inspector settings are saved with the workspace. Legacy prototype tabs are removed on restoration because their local content was never saved.

SQLite version 5 adds `map_record`; versions 1–4 load with an empty map collection when the table is absent and upgrade on save. Map images use the campaign's hashed assets directory. Older app builds reject version 5 packages. Party knowledge and player output do not change when browsing or moving a marker. Fog, tactical tools, session visits, and map presentation remain future features described below.

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

**The implemented atlas uses Konva + react-konva** for the shared interactive map canvas. It supplies React bindings for images, shapes, layers, pointer events, dragging, and tweening; its official examples demonstrate pointer-centered zoom. We still implement grid snapping, measurement rules, fog editing, linked-map navigation, and command integration. Sources: [React integration](https://konvajs.org/docs/react/index.html), [zoom example](https://konvajs.org/docs/sandbox/Zooming_Relative_To_Pointer.html), [license](https://github.com/konvajs/konva/blob/master/LICENSE).

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
