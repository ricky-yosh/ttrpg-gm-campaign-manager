# Party inventory

The GM sidebar groups Campaign (Overview, Sessions, Story Threads), World (Locations, Maps, Factions), and People & Things (Characters, Items, Inventory, Puzzles). Locations keeps its parent tree. Maps opens the existing unsaved map prototype. Saved navigation from the former Locations & Maps section migrates according to the destination type.

Inventory opens a shared Party Inventory document. Edit, Save changes, and Cancel manage a draft containing whole-number gold and item/material entries with a name, positive whole-number quantity, and optional public note. Remove entries when none remain. All inventory content is player-facing. Entries currently use names rather than links to the future Items catalog; individual character inventories and transfers are not implemented.

Presenter has a read-only Inventory view. Live presentation publishes a public inventory snapshot; Paused holds the last published snapshot while the GM edits or stages another view. Resume publishes the current selection. Stopping clears the player display. Switching campaigns resets staged content.

The campaign database stores inventory as JSON in `party_inventory` and advances `user_version` to 4. Older campaigns load with zero gold and no entries, then upgrade on save. Older builds reject version 4. Rust validates quantities, names, kinds, and unique IDs before saving; invalid saves preserve the existing file. Inventory tabs and typed history are saved with workspace state.
