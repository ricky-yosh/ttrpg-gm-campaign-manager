# Campaign Data Model

Working attribute and relationship map, without committing to a database schema yet. See [Backend Architecture](backend-architecture.md) for commands and persistence questions.

## Design principle

Separate campaign story content from statblock fields. A GM should be able to keep session notes, NPC identities, images, maps, and links if the campaign's statblock field set changes later. Store statblock values with a field-set ID and version attached to the relevant NPC or enemy.

## Core objects and candidate attributes

These are starting attributes to discuss, not a complete schema. Every saved object needs a stable ID and campaign association unless it is nested under a parent object.

| Object | Candidate attributes | Main relationships |
| --- | --- | --- |
| Campaign | Name, description, statblock field-set ID and version, created/updated dates | Contains all campaign records and sessions; v1 uses the D&D 5.5e field set |
| Session | Title, order/date, private plan, what happened, player-facing summary | Contains story beats and visits; links to NPCs, places, items, images, and songs |
| Story beat | Title, order, private notes, optional player-facing text | Belongs to a session; may link to a planned location or map pin, other records, and media cues |
| Session visit | Session ID, location or pin ID, order, optional note on what happened | Records where the party actually went; supports a location's visit history |
| NPC | Name, portrait, public description, private notes and motivations | May belong to factions, appear in sessions, and have map markers or a tagged statblock |
| Bestiary source | Name, source identifier, edition/version, import date, attribution | Groups imported creature definitions; import formats and library scope remain to be decided |
| Bestiary entry | Source ID, source entry identifier/version, name, image, description, tagged default statblock | Protected reference definition; creates encounter participants or editable NPC copies without changing the source |
| Encounter participant | Encounter ID, bestiary source reference/version or NPC ID, copied starting stats, current HP, initiative, instance notes | Represents one creature in play; linked token placements keep their identity when this participant becomes an NPC |
| Faction | Name, image, description, private notes | Links to member NPCs and parent/child factions for an organization chart |
| Location | Name, image, public description, private notes | Links to maps, sessions, NPCs, and other locations |
| Map | Name, kind (world, region, city, exploration, dungeon, battle), image, grid and display settings | Has pins, fog state, tokens, and linked locations or records; a pin may open another map |
| Map pin | Map position, discovery state, player visibility, label/icon overrides | Links to a campaign record and optionally a more detailed map |
| Token placement | Map position, linked character/enemy or party | Tracks where a participant or party appears without duplicating its record |
| Item | Name, image, description, private notes, optional rarity | May appear in sessions, rewards, or party holdings |
| Party inventory entry | Item ID, quantity, player-visible details, optional party note | Links an item to the party's projected Inventory view without exposing private item information |
| Crafting project | Target item or result, materials collected, progress, status, player-visible details | Links party inventory and crafting activity to the projected Crafting Progress view |
| Story thread | Title, status, private notes | Links to sessions, story beats, NPCs, factions, and locations |
| Puzzle | Name, instructions or content, private solution notes | Links to sessions, story beats, and locations |
| Media asset | Original filename, MIME type, byte length, image/video dimensions, video duration when applicable, content hash, relative asset path, title, attribution or source if needed | Original image or video stored in the campaign's `assets/` folder and referenced by asset ID in SQLite; can be reused, including a chest-opening video |
| Song cue | Title, provider, link or identifier, optional GM note | Can be attached to sessions or story beats |
| Record link | Source ID, target ID, relationship type | Connects campaign records without copying them |
| Player knowledge | Record ID, known/revealed state, optional session of discovery, references to revealed fields or a public alias | Determines which NPCs, factions, locations, and other records appear in player-facing directories without copying their full records |
| Statblock | NPC or enemy ID, field-set ID/version, entered values | V1 uses only the bundled D&D 5.5e input definition; future field-set changes preserve existing values |
| Workspace state (proposal) | Campaign/window/mode identity, schema version, open and active tabs, pane layout, sidebar state, per-view positions, bounded navigation entries and current history index | Keeps GM and Presenter navigation separate; each entry identifies a view, optional record, and preferred tab/pane; independent of edit undo and recently closed tabs |
| Presentation checkpoint | Live and Next view state, selected record IDs and image asset references, player-safe display data needed to retain paused content, overlays, open and active tabs, per-tab scroll positions, map pan/zoom and framing, paused/running flag, accumulated elapsed time | Saved after every presentation change so Play can recover after Stop, player-window close, or app restart; stores state details, with no screenshot requirement |

Public descriptions and summaries are candidate player-facing fields; private notes must remain GM-only. Exactly how the GM selects which fields to present is a UI decision.

Player knowledge is persistent: it records what the party knows about campaign records. The live Player Presentation state is separate: it selects the active view, visible NPC portraits, and current speaker. Build the player window's content from known records and explicitly allowed fields rather than passing full NPC, map, or item records to it. See [Player Presentation](player-presentation.md).

## Bestiary, creature instances, and NPCs

The enemy library is an importable bestiary. Preserve imported reference information by making entries read-only by default; custom variations should be explicit copies. An NPC is an editable campaign character created from that reference or from a particular creature already in play.

Proposed model: retain the bestiary entry's source ID and version alongside a copy of the starting stats used by a participant or NPC. Subsequent library imports must not silently rewrite existing NPCs or active encounters. Whether the library is shared across campaigns or stored per campaign is still open; campaigns must retain the data and assets they use so portable saves remain self-contained.

Provide **Create NPC from this creature** on a selected battle-map token or its inspector. Creating the NPC preserves that participant's current encounter state, token placement, map framing, and selection, while associating the existing participant with the new NPC. The original bestiary entry and other creatures using it remain unchanged. Creating an NPC directly from the library uses its default stats. Perform the creation and relinking as one undoable operation.

Import is a planned capability. Start by defining a structured bestiary import format, previewing validation errors and duplicate/version conflicts before applying changes. Source formats, supported providers, and any PDF extraction are not yet selected.

## Visual notes and document format

Confirmed editor requirements: visual editing, inline images with captions (text beneath images), and side-by-side text columns within the note. These columns are document content and are separate from workspace split panes. Record links and image-to-presentation actions should fit into this editor.

Proposed saved note envelope: `id`, owner/field association, `editor_format`, `schema_version`, `document_json`, `created_at`, and `updated_at`. Use the selected editor's structured document format with versioned app-specific blocks rather than inventing an editor engine. Store image references as stable asset IDs and resolve them for display; the image bytes stay in `assets/`. Preserve captions, block order, column structure, and widths in the document. Searchable plain text is derived from that document. Keep private notes and player-facing summaries separate.

### Editor candidates (researched September 25, 2026; selection pending)

- **Plate (current evaluation candidate):** Provides column layouts, image/media blocks, editable captions, and app-owned UI kits installed through shadcn. Its public demo includes captions and side-by-side columns. The repository uses MIT except where individual packages specify otherwise; the layout and media package manifests explicitly declare MIT. Use the open-source kits; Pro offerings have separate terms. Sources: [columns](https://platejs.org/docs/column), [media and captions](https://platejs.org/docs/media), [Plate UI](https://platejs.org/docs/installation/plate-ui), [repository license](https://github.com/udecode/plate/blob/main/LICENSE), [layout package](https://raw.githubusercontent.com/udecode/plate/main/packages/layout/package.json), [media package](https://raw.githubusercontent.com/udecode/plate/main/packages/media/package.json).
- **BlockNote:** Ready-made block editing with image captions and a shadcn integration. Side-by-side columns use `@blocknote/xl-multi-column`. Core is MPL-2.0; the XL columns package is GPL-3.0 or commercially licensed, so the distribution/license decision affects adoption. Sources: [image blocks](https://www.blocknotejs.org/docs/features/blocks/embeds), [column structure](https://www.blocknotejs.org/docs/foundations/document-structure), [shadcn integration](https://www.blocknotejs.org/docs/getting-started/shadcn), [licensing](https://www.blocknotejs.org/pricing).
- **Tiptap:** Flexible foundation if we want more control over the editing UI and document nodes. Its image extension supports images and resizing; the official figure/caption example is explicitly experimental and unmaintained. Budget implementation work for a supported caption node, column layout, and their controls. Sources: [image extension](https://tiptap.dev/docs/editor/extensions/nodes/image), [figure experiment](https://tiptap.dev/docs/examples/experiments/figure), [custom nodes](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/node).
- **Lexical:** A modular editor framework with more assembly required for this experience. Its official playground has an image node with captions; that example still needs application integration. Columns and their editing controls need evaluation/implementation. Sources: [framework](https://lexical.dev/), [playground image node](https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/nodes/ImageNode.tsx).

The project uses **Apache-2.0**, as confirmed by the user. Preserve this licensing choice. BlockNote's GPL-3.0 XL columns cannot be included while distributing the combined application solely under Apache-2.0; Apache-to-GPL compatibility does not work in the reverse direction. A commercial XL license would require evaluating its distribution terms. Sources: [Apache's compatibility explanation](https://www.apache.org/licenses/GPL-compatibility.html), [BlockNote licensing](https://www.blocknotejs.org/pricing).

Updated recommendation: evaluate **Plate first**, as agreed with the user, with Tiptap's [MIT-licensed open-source core](https://github.com/ueberdosis/tiptap/blob/main/LICENSE.md) as a fallback. BlockNote core remains an option with independently implemented columns, subject to its MPL obligations. No final editor selection or license change is decided. Before committing, validate a representative note with captions, columns, local assets, record links, save/reload, and undo in the Tauri app. No editor dependency has been installed.

For the Plate evaluation, begin with basic text formatting, lists, columns, images/captions, and record mentions. Adapt media import to the Rust asset service instead of adopting a hosted upload service from an example. Save versioned document JSON through the existing command boundary; resolve stable asset IDs to local display URLs at render time. Add campaign-record links and a Show to players image action as application integrations. In the eventual prototype, check typing and undo, image paste/import, keyboard movement between columns, narrow split-pane layouts, and reopening the same saved document. Public-demo inspection confirms the example UI exists; it does not yet verify these behaviors in Tauri.

## Statblock field sets

- **Field-set definition:** Identify the TTRPG system and version and define its statblock inputs. V1 bundles one definition: D&D 5.5e. Settings can show it as the current field set, but there is no alternative choice or custom-field editor in v1.
- **Statblock:** Store the owning NPC or enemy ID, field-set ID/version, and entered values. Keep the original values and field definitions readable if a future setting change selects a different field set.
- **D&D 5.5e inputs:** Candidate fields include ability scores, hit points, Armor Class, proficiency, actions, and other creature statblock details. V1 stores and displays the entered values; it does not calculate gameplay mechanics from them.
- **Other systems later:** Do not require D&D fields in the common NPC or enemy object. For example, another system might use entirely different fields. Changing the campaign setting later should affect new statblocks and the available input form, not rewrite existing values.

Initiative, map distance, item rarity, and crafting are separate features; the statblock setting does not change their rules or values. The tagged statblock design still matters now so future field sets do not require rewriting campaign records.

Custom statblock fields are a later option, not part of v1.

## Changing a campaign's statblock field set (future proposal)

V1 exposes only D&D 5.5e. When another field set is added later, changing the campaign default should **not clear or silently rewrite any data**.

1. Show a preview of the change, including how many NPC and enemy statblocks use the current field set. Warn that their fields will not automatically map to the new one.
2. Confirm the change. Keep all story content, media, links, maps, and existing statblocks tagged with the field set and version that created them.
3. Use the new field set for new statblocks. Existing ones remain visible with their original labels and values, and can still be edited with their original form.
4. Offer a separate, explicit conversion flow only when a safe mapping exists. Preview each conversion, preserve fields that cannot be mapped, and never silently discard the original statblock.
5. Make the default-field-set change undoable. Undo restores the previous default; the change deleted no values. Any explicit conversion is its own undoable operation.

This permits a transition with old and new statblocks in one campaign. Label each statblock's field set clearly; the campaign setting does not imply a conversion.

## Commands implied by this model

- V1: `CreateStatblock`, `UpdateStatblock`, and `RemoveStatblock` edit D&D 5.5e values separately from story content.
- Later: `SetCampaignStatblockFieldSet` changes the default without converting existing records; `ConvertStatblock` is an explicit, value-preserving conversion.
- Later custom fields: manage a named statblock template and preserve old field values when its definition changes.

## Questions to settle

- Which exact D&D 5.5e statblock fields should the v1 form include?
- If a new field set is added later, should the old and new forms coexist indefinitely or only during a transition?

## Rules references

- [D&D Beyond 2024 Basic Rules: Creating a Character](https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character)
- [D&D Beyond 2024 Basic Rules: Playing the Game](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game)
- [Fate Core: The Character Sheet](https://fate-srd.com/fate-core/character-sheet)
