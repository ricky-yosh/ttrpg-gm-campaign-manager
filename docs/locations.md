# Locations

Locations are campaign records with a name, optional parent, type, tags, party knowledge, scenic banner, player-facing scene image, public description, structured GM reference, and private GM notes. They do not require maps or pins. Public description is an authoring field; location presentation in the player window is not implemented yet.

## Authoring and navigation

Open **Locations** in the GM sidebar and use the **+** button to create a location. Choose an optional parent, or use **Add location** in a place’s **Places within** card to start with that parent selected. The location directory shows an expandable geographic tree; search results include parent paths. Branch expansion and search stay in session memory across section changes and reset when the campaign changes.

Use **Edit** in a location’s tab to add details or change its parent. Parent choices exclude the location and its descendants, and both frontend commands and Rust validation reject cycles. Save changes applies the draft; Cancel restores the saved values. Location images use the shared Rust WebP importer. Canceling edit mode ignores unfinished image imports.

The dossier uses the NPC page’s serif identity, public-description treatment, and independent columns. At panel widths below 900 px, the columns stack. Breadcrumbs and **Places within** rows open linked location pages. **Associated NPCs** reads existing NPC location links, including their association labels; these links are still edited on the NPC page. Maps and faction associations have empty states for this first UI pass. **Maps** in the sidebar and the location card open the existing unsaved map prototype.

Locations open in Dockview tabs. Opening the same record focuses its existing tab in the active workspace. Tabs, scroll positions, and Back/Forward destinations are saved with the campaign. Removed records are skipped during history navigation.

The NPC's **Locations** card sits below Relationships in the statblock column. In edit mode, link an existing location and optionally describe the association (for example, “Childhood home”). Add/remove/label changes share the NPC's Save changes and Cancel flow. Links store the target ID; record names resolve from current locations. Missing targets remain visible as unavailable and can be removed.

## Structure and storage

- `location-data.ts`: Location types, backward-compatible field defaults, ancestry, parent checks, and search paths.
- `campaign-data.ts`: Location creation/save functions and NPC location links.
- `location-panel.tsx`: location draft editor and read view.
- `locations-directory.tsx`, `location-fields.tsx`: sidebar tree, search, creation forms, and parent selectors.
- `npc-record-links.tsx`: shared NPC relationship and location-link cards.
- `workspaces.tsx`, `app-commands.ts`, and session state: tab opening and navigation history.
- Rust `campaign/` modules: validates records and links, handles image assets, and stores location JSON in a dedicated SQLite table in the same campaign save transaction.

Database version 2 adds the `location` table. Version 1 packages still load with no locations and upgrade when saved. Factions raises the database version to 3; Inventory raises it to 4. See [Factions](factions.md) and [Inventory](inventory.md). Older app builds reject version 2 packages to prevent accidental loss of location data. The campaign JSON schema version remains 1; new collection fields default to empty when absent.

The new dossier fields use the existing location JSON column without a table migration. Missing fields in older records default to empty values, no parent, and Unknown party knowledge. Older builds that reject unknown location fields cannot open packages saved with the new dossier fields.

Save/reopen tests cover location scene and banner images, dossier fields, hierarchy, NPC links, navigation destinations, moved packages, and database upgrades. There is no location deletion UI, map integration, or player-window location view in this pass.
