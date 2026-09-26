# TTRPG GM Campaign Manager: Brainstorm

Ideas for a campaign management workspace where a GM prepares sessions, creates and organizes campaign notes, reviews what happened in previous sessions, and chooses what to show players on a projector or second screen during play.

More detailed design notes: [UI/UX](ui-ux.md), [Player Presentation](player-presentation.md), [Backend Architecture](backend-architecture.md), [Campaign Data Model](data-model.md), and [Maps and Exploration](maps.md).

## Core experience

- **Campaign workspace:** The GM can browse and edit session notes, NPCs, locations, maps, and other campaign records while preparing or reviewing a session. Presenting to players is one part of this workspace.
- **Presenter mode:** During play, the GM starts presentation from a top-right Play button and controls what appears on a projector or second screen. Stop or closing the player window ends the active output but saves the presentation so Play can restore it. The GM can still access private campaign information, including notes and hidden motivations; players do not interact with the app through their view.
- **Flexible presentation:** The read-only player view is a curated mirror of the campaign workspace. The GM can show known Characters, Factions, and Locations; Inventory and Crafting Progress; Full Map and the current battle or dungeon map; or static scene images. A visual can stay on screen as a background or appear temporarily as an overlay. NPC portraits can appear above any view: present NPCs are muted, the current speaker is highlighted, and an unknown person can appear as a `?` silhouette. A larger NPC card is a separate view for reminding players what they know about a character.
- **Live preview:** The GM can see what players currently see while preparing the next visual or overlay.

## Campaign planning and reference

- **Sessions:** Create and edit private plans before each session, record what actually happened afterward, and browse previous sessions for reference when preparing future ones. Let the GM present a session summary to players. Attach images and songs to session notes or specific story beats so the GM can quickly set the mood during a lull, such as between battles or exploration scenes.
- **NPCs:** Give each NPC a card with notes and images. Keep public information separate from private GM notes.
- **Bestiary:** Import a large reference library of creatures with stats, descriptions, and images. Protect source entries from casual editing. Create an editable NPC copy from a library entry or directly from a creature's battle-map token, preserving its current context and leaving the source definition intact.
- **Visual notes:** Support images, captions beneath images, and text columns within notes. Editor selection is under discussion in the [data model](data-model.md#visual-notes-and-document-format).
- **Items:** Track items, their rarity, details, and images.
- **Locations:** Store descriptions, images, and associated maps.
- **Threads:** Keep GM notes about ongoing story threads and ideas for future encounters. Link related NPCs and other involved parties.
- **Factions:** Store faction descriptions and images, associate NPCs with factions, and use organization charts to track leaders and relationships.

## Maps and encounters

- **World maps:** Show the wider campaign setting.
- **City and exploration maps:** Support exploration and dungeon crawls, including fog of war.
- **Battle maps:** Place character tokens and support initiative tracking, distance measurement, and grid snapping.
- **Map links:** Associate NPCs, enemies, items, and locations with map positions so the GM can quickly open their notes while using a map.
- **Session links:** Connect planned story beats to map pins and record places the party actually visits, so locations show their session history.

## Player-facing interactions

- **Puzzles:** Provide a modular way to create and display different puzzles over the course of a campaign.
- **Item unboxing:** Play a chest-opening video as part of revealing multiple items from one chest, with each item's information. Other visual motion, such as token movement, uses simple tweening and transitions.
- **Item crafting:** Let the GM manage players' decisions to recycle items they do not need and pool materials as a party to create new items. Save the party's collected materials and crafting activity.

## Rulesets

- **V1 statblock setting:** D&D 5.5e is the only available field set for NPC and enemy statblocks. It controls which inputs are shown and how those values are labeled and stored; it does not define automated rules for initiative, distance, item rarity, or crafting.
- **Later field sets:** Other TTRPG field sets or custom fields can come after v1. If the user changes the setting later, existing statblock values remain tagged with their original field set and are not erased or silently converted.

## Quality-of-life ideas

- **Flexible workspace:** Open campaign records in tabs and arrange them in resizable side-by-side or stacked panes. Let the GM keep, for example, session notes beside an NPC card or map, and restore the layout when reopening the campaign.
- **AI access:** Provide an MCP interface or CLI so an AI assistant can connect to the tool and make changes.
- **Portable saves:** Keep each campaign in a folder containing its SQLite database and imported images in an `assets/` folder. Backups and exports must include both so users can keep multiple campaigns or save versions and move them between computers.
- **Command palette:** Add a `Cmd+K` shortcut to find and open anything from anywhere in the app.
- **Undo and redo:** Make changes reversible. A command pattern and command stack could provide a consistent undo/redo history.
