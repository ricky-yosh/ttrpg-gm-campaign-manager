# Factions

Faction records contain a name, optional image, description, and private GM notes. Open **Factions** in the GM sidebar, choose **New faction**, and enter a name. Use **Edit** in its tab to add details; Save changes applies the draft and Cancel restores saved values. Images use the Rust WebP importer, and unfinished imports are ignored when editing is canceled.

## NPC affiliations

The NPC Factions card sits beneath Locations in the statblock column. Link an existing faction and add an optional affiliation label, such as “Member,” “Friendly,” or “Enemy.” Links are directional from NPC to faction and store the faction ID. Each NPC can link to a faction once. Missing targets remain visible as unavailable and can be removed in edit mode.

Link edits share the NPC's Save changes / Cancel flow. Clicking a row opens or focuses the faction's tab in the current workspace. Navigation enters Back/Forward history; it does not save the NPC draft. Shared campaign edit undo remains planned. Factions and affiliation details are not published to the player window in this pass.

## Structure and persistence

- `campaign-data.ts`: Faction records, create/save functions, and NPC affiliation links.
- `faction-panel.tsx` and `factions-directory.tsx`: record editor and sidebar directory, following the Locations pattern.
- `npc-record-links.tsx`: shared link cards with per-kind labels, icons, and navigation commands.
- Workspace commands and session state: faction tabs, saved scroll positions, and history destinations.
- Rust `campaign.rs`: record validation, managed image assets, and faction JSON stored in a dedicated SQLite table within the campaign save transaction.

Database version 3 adds the `faction` table. Versions 1 and 2 remain readable and upgrade on save. Missing faction collections and NPC faction-link lists default to empty. Older builds reject version 3 packages to prevent data loss. The campaign JSON schema version remains 1.

Tests cover faction records/images/links/history after save and reopen, moved packages, upgrading version 2 without losing locations, invalid records, duplicate links, and navigation past unavailable records. Hierarchies, deletion UI, and player presentation are future work.
