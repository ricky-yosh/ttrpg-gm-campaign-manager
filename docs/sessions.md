# Sessions

## Frontend prototype

Open **Sessions** in the Campaign sidebar, then **All sessions** to browse or create a session. The sample campaign includes four filled-out examples: exploration prep, freeform social prep, a detailed recap, and a short recap; other campaigns start empty. Search by title or session number. Sessions are grouped as Upcoming or Previous; change the group in Edit.

Each session opens in a workspace tab. Use **Edit / Save changes / Cancel** for its title, number, optional date, Where we left off, Prep notes, What happened, and separate Summary for Players. Optional story beats have rich-text notes, a Planned / Happened / Skipped status, and Move up / Move down controls.

Related records group NPCs, locations, factions, story threads, and puzzles. NPC/location/faction/thread links open existing campaign records; puzzles have labeled sample options only in the demo campaign. Other campaigns show puzzles as unavailable until their implementation exists. Links describe relevance and do not record visits, encounters, or player knowledge.

**Quick capture** appends a private note to What happened from read mode. Edit drafts and unsubmitted captures remain available while navigating to other records. Cancel discards the edit draft; navigation does not save it.

All session content stays in memory and resets on reload or campaign replacement. Save changes and Save note update this memory only; campaign saves do not include session notes or transient session tabs. Other record tabs retain their saved layouts. No backend changes, player-window presentation, visit tracking, or Connected sessions cards on other pages are included in this prototype.

## UI conventions

Session pages use the project's shadcn Card, Field, Button, NativeSelect, Empty, Badge, and Collapsible components. Named Tailwind container queries adapt spacing and columns to the workspace pane, with semantic theme colors. Sample prose and placeholder references live in `sample-sessions.ts`; real record names and links resolve from the current campaign. Shared drafts synchronize between workspace copies without resetting the editor on local typing.
