# Maps and Locations — discussion brief

Status: historical designer discussion. The sidebar proposal below is superseded by the current direction in [Maps](maps.md).

## Current navigation requirements

Locations and Maps have separate sidebar sections. Maps follows the NPC and Faction directory pattern: an Add map action in the heading and one row per saved map. Import happens through that action; location pages offer existing-map attachments, placement, Open, and Locate. Keep the comprehensive right preview and child-location navigation. Defer a visual map library.

## Goal

Make the sidebar an atlas of the campaign: find a place, understand where it belongs, open its reference page, and reach its maps. Give location pages the same authored, illustrated feel as the NPC dossier while keeping them useful during play.

## Starting point

The existing sidebar has a flat location list and a separate Map prototype entry. Location pages currently contain a name, one image, public description, and GM notes. NPC pages provide the visual precedent: serif names, optional wide banners, a dedicated public-description card, understated narrative dividers, linked-record cards, independent columns, and explicit Edit / Save changes / Cancel.

## Sidebar proposal

Use **Locations & Maps** as one section with two views: **Places** (default) and **Maps**. Places shows geographic containment; Maps is a searchable map library that includes maps without a location.

```text
← All sections
Locations & Maps                         +
[Search places…                       ]
[ Places ] [ Maps ]

▾ The Known World
  ▾ Northern Reach
    ▾ Greyhaven
      ▧ City map
      ▾ Dock Ward
        ▾ The Lantern Inn
          ▧ Ground floor
          ▧ Cellar
        • Old Ferry Landing
      ▸ The Keep
  ▸ Southern Coast

Other locations
  • The Wandering Market
```

Locations and maps need visibly different icons. Indentation communicates parentage; do not depend on icon or color alone. Attached maps sit immediately beneath their owning location, before its child locations. The example's names are illustrative.

- Clicking a location name opens its page; clicking its chevron only expands the branch. Clicking a map opens the canvas in a workspace tab.
- Show a clear active row and remember expanded branches. Opening a location from a link can expose its ancestors so the GM can find it in the tree.
- Search shows matching names with their parent paths, avoiding ambiguity between two places called “The Keep.”
- The + menu offers New location and Import map. A location's row menu offers Add child location, Attach map, and Move to…. Creation makes the selected parent explicit.
- Start with Move to… for reparenting. Drag-and-drop can follow; keyboard users need an equivalent action. A place cannot be moved inside itself or one of its descendants.
- Parentless locations appear at the root. “Other locations” is a convenience grouping for places whose geography is unspecified; it is not a required fictional parent.
- Avoid permanent action buttons and multiple status badges on every row. Reveal secondary actions on hover/focus and in the row menu.

### Relationship rule

**A parent answers “Where does this place belong?” A map answers “Where can I see it?”**

Recommend one optional parent location and any number of map placements. Greyhaven can appear on the world map and regional map while remaining one location with one page. A location can own several maps, such as city overview, ground floor, and cellar. An unpinned location is still a valid record. Removing a map pin does not remove or reparent the location.

Use the geographic tree as the stable navigation structure. Show additional map appearances on the location page rather than duplicating location rows under every map. If a map is attached to several places, its shortcuts open the same map record.

## Location page proposal

```text
Northern Reach / Greyhaven / Dock Ward
The Lantern Inn                            [Edit]
Tavern · Dock Ward
──────────────── optional scenic banner ────────────────

MAIN NARRATIVE                     REFERENCE COLUMN
Description for Players [Public]   At a glance
  Scene image + short read-aloud     Type / parent / party knowledge

GM Reference                      Maps
  Atmosphere                        Ground floor      [Open]
  Background                        Cellar            [Open]
  What is happening now             Appears on: City map [Locate]
  Secrets and discoveries
                                  Places within
GM Notes                            Common room / Cellar
  Flexible rich-text prep
                                  Associated NPCs
                                    Innkeeper — proprietor
                                  Factions
                                    Dockworkers' Guild — meeting place
```

Use one scrolling page with two independent columns, following the NPC layout. Stack sections when the Dockview panel becomes narrow. The exact proportions need designer exploration; the reference column may need less width than the NPC statblock column.

- **Identity:** serif name, clickable parent breadcrumbs, optional short subtitle, and a restrained location-type label. Types should describe anything from region to room without forcing a different page template for each.
- **Art:** optional scenic banner and an explicitly player-safe scene image. These have separate roles from imported map artwork. Omit absent art cleanly.
- **Description for Players:** keep the existing NPC card language and Public badge. Write what players can perceive or be told; keep private context in GM Reference.
- **GM Reference:** atmosphere/sensory cues, background, current situation, secrets, and discoveries. These are suggested authoring prompts; omit empty sections in read mode.
- **At a glance:** a short reference card, not a location statblock. Begin with type, parent, and optional party knowledge (Unknown / Known / Visited). Owner, danger, or services can be explored later if they prove useful.
- **Maps:** distinguish maps of this place from maps on which it appears. Open goes to a map; Locate goes to the saved placement on a containing map. Use small previews only if they remain readable in the column.
- **Places within:** direct children, linked to their pages. Broad locations can prioritize this card above Maps; a tavern with no children omits it.
- **Associated NPCs / Factions:** reuse the NPC linked-card style and optional association labels. Existing NPC-to-location links can supply an initial read view; editable associations need a shared relationship design to avoid contradictory lists. Association does not imply an NPC is physically present right now.
- **GM Notes:** flexible rich-text space for session prep beyond the structured prompts.

Open in read mode. Edit stages changes until Save changes; Cancel discards them. A public description is available for future presentation, but saving it does not reveal the location. Party knowledge, visit history, and current player-screen visibility remain separate concepts. Location presentation is not currently implemented.

## Designer review request

Explore three frames first:

1. A populated sidebar with several hierarchy levels, a selected location, attached maps, and a search result with its path.
2. A city page emphasizing maps, districts, NPCs, and factions.
3. A tavern page emphasizing scene art, player description, atmosphere, secrets, and associated NPCs; also show a narrow-panel version.

Include a sparse location without art or maps, a long place name, a collapsed branch, and edit mode. Keep the existing stone palette, serif identity headings, rounded cards, quiet borders, and shadcn component conventions. Let artwork provide the fantasy character.

The first discussion to resolve is whether **Places first, Maps second** matches the GM's navigation habits. A map-first view could instead list pins under each map, but needs to handle places appearing on several maps and places without pins. The proposed Places view gives every location a stable home while the Maps view supports map-first browsing.

## Suggested sequence after design agreement

1. Parent locations and sidebar navigation, including root locations, search paths, and reparenting.
2. Location dossier layout and draft editing, preserving existing descriptions, images, notes, and NPC links.
3. Saved maps, attachment/placement links, and Open / Locate interactions.
4. Player presentation and session visit history as separately scoped features.

Related references: [NPC presentation](npc-presentation-design.md), [current locations](locations.md), and [map exploration concepts](maps.md). The map document contains historical renderer evaluation notes; current project guidance specifies Konva/react-konva.
