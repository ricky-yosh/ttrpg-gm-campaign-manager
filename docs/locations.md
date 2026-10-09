# Locations

Locations are campaign records with a name, optional image, public description, and private GM notes. They do not require maps or pins. Public description is an authoring field; location presentation in the player window is not implemented yet.

## Authoring and navigation

Open **Locations & Maps** in the GM sidebar and choose **New location**. Enter a name and create the record, then use **Edit** in its tab to add details. Save changes applies the draft; Cancel restores the saved values. Location images use the shared Rust WebP importer. Canceling edit mode ignores unfinished image imports.

Locations open in Dockview tabs. Opening the same record focuses its existing tab in the active workspace. Tabs, scroll positions, and Back/Forward destinations are saved with the campaign. Removed records are skipped during history navigation.

The NPC's **Locations** card sits below Relationships in the statblock column. In edit mode, link an existing location and optionally describe the association (for example, “Childhood home”). Add/remove/label changes share the NPC's Save changes and Cancel flow. Links store the target ID; record names resolve from current locations. Missing targets remain visible as unavailable and can be removed.

## Structure and storage

- `campaign-data.ts`: Location type, creation/save functions, and NPC location links.
- `location-panel.tsx`: location draft editor and read view.
- `locations-directory.tsx`: sidebar creation form and record list.
- `npc-record-links.tsx`: shared NPC relationship and location-link cards.
- `workspaces.tsx`, `app-commands.ts`, and session state: tab opening and navigation history.
- Rust `campaign.rs`: validates records and links, handles image assets, and stores location JSON in a dedicated SQLite table in the same campaign save transaction.

Database version 2 adds the `location` table. Version 1 packages still load with no locations and upgrade when saved. Factions subsequently raises the current database version to 3; see [Factions](factions.md). Older app builds reject version 2 packages to prevent accidental loss of location data. The campaign JSON schema version remains 1; new collection fields default to empty when absent.

Save/reopen tests cover location images, NPC links, navigation destinations, moved packages, and database upgrades. There is no location deletion UI, map integration, or player-window location view in this pass.
