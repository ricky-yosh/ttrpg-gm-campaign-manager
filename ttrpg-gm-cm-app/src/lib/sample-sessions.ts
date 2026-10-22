import type { Value } from "platejs";
import type { SessionBeat, SessionNote, SessionRecordLink } from "../stores/session-notes-store.ts";

type NamedRecord = { id: string; name: string };
export type SessionSampleRecords = { npcs: NamedRecord[]; locations: NamedRecord[]; factions: NamedRecord[] };
const notes = (...paragraphs: string[]): Value => paragraphs.map((text) => ({ type: "p", children: [{ text }] }));
const heading = (text: string): Value[number] => ({ type: "h3", children: [{ text }] });
const beat = (id: string, title: string, text: string, status: SessionBeat["status"] = "planned"): SessionBeat => ({ id, title, notes: notes(text), status });

export function sampleSessions(records: SessionSampleRecords): SessionNote[] {
  const link = (kind: "npc" | "location" | "faction", name: string, label: string): SessionRecordLink[] => {
    const source = kind === "npc" ? records.npcs : kind === "location" ? records.locations : records.factions;
    const record = source.find((item) => item.name === name);
    return record ? [{ kind, targetId: record.id, label }] : [];
  };
  const thread: SessionRecordLink = { kind: "thread", targetId: "sample-thread-shipment", label: "Follow the diverted cargo" };
  const puzzle: SessionRecordLink = { kind: "puzzle", targetId: "sample-puzzle-bells", label: "Listen before choosing the order" };
  return [
    {
      id: "sample-session-low-tide", title: "The Low Tide", number: 8, date: "", previous: false,
      whereLeftOff: notes("A soaked manifest survived the warehouse fire. Niya recognized a guild seal, and Carlos found a trail leading toward the eastern seawall."),
      prep: [heading("Opening image"), ...notes("Three harbor bells sound over the empty quay. A pale lantern moves beneath the seawall, just above the falling water."), heading("Keep in reach"), ...notes("Niya wants the manifest intact. Carlos wants to know who has been entering the tunnels. The guild wants the cargo recovered quietly.", "Clue: fresh green wax on the tunnel latch matches the replacement seals in the warehouse.", "If the party stays above ground, a dockworker offers the same lead in exchange for protection. The tunnel is a possibility, not the only route forward.")],
      happened: notes(""), summary: notes("Last time, you escaped the warehouse fire carrying a damaged manifest. Tonight, low tide may expose the route used by the missing shipments."),
      beats: [
        beat("low-tide-1", "Meet Niya at the harbor", "Niya waits beneath the bell tower with a folded tide chart. She offers a safe route below the seawall if the party agrees to recover her missing ledger."),
        beat("low-tide-2", "Follow the lantern", "Carlos spots bootprints in salt-stained mud. Let the party choose between following the light, questioning the lookout, or waiting for the next delivery."),
        beat("low-tide-3", "The three harbor bells", "The marks on the manifest give the ships' arrival order: Morrow, Wren, Saint Orra. Ringing the matching bells opens the sluice. A wrong attempt alerts the lookout; it does not seal the entrance."),
      ],
      links: [...link("npc", "Niya Jade", "Contact with the tide chart"), ...link("npc", "Carlos Tree", "Tracks the tunnel traffic"), ...link("location", "The Harbor", "Opening meeting"), ...link("location", "Eastern Seawall", "Hidden entrance at low tide"), ...link("faction", "Dockworkers’ Guild", "Wants the stolen cargo returned"), thread, puzzle],
    },
    {
      id: "sample-session-quiet-bargain", title: "A Quiet Bargain", number: 9, date: "", previous: false,
      whereLeftOff: notes("Use this quieter session if the party returns to town to negotiate instead of exploring the tunnels."),
      prep: [heading("People first"), ...notes("Begin over breakfast at the Lantern Inn. Niya has brought a buyer for the recovered ledger, but she has not said whose money is behind the offer.", "Ask each character what they want from the deal. Give them room to talk before introducing a complication."), heading("Three things to reveal"), ...notes("The guild's cargo tallies were changed before the ship left port.", "The Saltglass Circle will trade a chart for one page of the ledger.", "Renot was hired to protect the buyer, not threaten the party."), heading("If conversation stalls"), ...notes("A messenger delivers two incompatible invitations. The party must choose whom to meet first; the other contact will remember being kept waiting.")],
      happened: notes(""), summary: notes("A warm meal, a recovered ledger, and an offer that sounds almost too generous. Your next lead may come from a conversation rather than a fight."),
      beats: [],
      links: [...link("npc", "Niya Jade", "Arranged the meeting"), ...link("npc", "Renot Force", "The buyer's bodyguard"), ...link("location", "The Lantern Inn", "Breakfast and negotiations"), ...link("faction", "The Saltglass Circle", "Offers a chart in exchange for information"), thread],
    },
    {
      id: "sample-session-ashes", title: "Ashes at the Quay", number: 7, date: "2026-10-17", previous: true,
      whereLeftOff: notes("The party followed a false cargo tally to a locked warehouse. Renot agreed to keep watch while they searched."),
      prep: notes("Give the party a chance to question the night clerk before the alarm sounds.", "The cellar contains a manifest, spare wax seals, and a waterlogged crate. Fire threatens the evidence after the smugglers retreat."),
      happened: [heading("Decisions"), ...notes("The party entered through the loading doors and persuaded the clerk to leave. They refused to hand the manifest to the guild without making a copy."), heading("Consequences"), ...notes("Renot rescued two dockworkers from the fire. The guild now considers the party useful, but suspects they kept evidence.", "The party never opened the waterlogged crate. Its contents remain available for a later discovery."), heading("Next time"), ...notes("Niya can identify the seal on the manifest. Carlos noticed the smugglers retreat toward the seawall.")],
      summary: notes("You uncovered a warehouse full of diverted cargo and escaped when the smugglers set it alight. Renot helped the trapped dockworkers, and a damaged manifest points toward the eastern seawall."),
      beats: [beat("ashes-1", "Question the night clerk", "The clerk admitted that the tally books had been replaced and fled before the fighting began.", "happened"), beat("ashes-2", "Save the manifest", "The party recovered the papers while Renot held a burning beam away from the cellar stairs.", "happened"), beat("ashes-3", "Inspect the sealed crate", "Unused prep: a green-wax seal hides a second shipping address. Carry this clue into a future session if needed.", "skipped")],
      links: [...link("npc", "Renot Force", "Rescued the trapped workers"), ...link("npc", "Niya Jade", "Can identify the recovered seal"), ...link("location", "The Harbor", "Warehouse fire"), ...link("faction", "Dockworkers’ Guild", "Questions who kept the evidence"), thread],
    },
    {
      id: "sample-session-debt", title: "A Debt in Salt", number: 6, date: "2026-10-10", previous: true,
      whereLeftOff: notes("The party needed passage into Greyhaven and had little money left after the storm."),
      prep: notes("A short arrival session: establish the harbor, introduce Niya, and offer one favor with an open-ended cost."),
      happened: notes("Niya arranged passage in exchange for a future favor. The party agreed, but insisted the favor could not involve harming an innocent.", "Carlos guided the group through the crowded docks. They spent the night at the Lantern Inn and heard that cargo had been vanishing from guild warehouses."),
      summary: notes("You reached Greyhaven with help from Niya Jade. You owe her a favor, found shelter at the Lantern Inn, and heard the first rumors of missing shipments."),
      beats: [beat("debt-1", "Agree on the favor", "The party set a clear boundary on Niya's request. Remember the exact promise when she calls in the debt.", "happened")],
      links: [...link("npc", "Niya Jade", "The party owes her a favor"), ...link("npc", "Carlos Tree", "Guide through Greyhaven"), ...link("location", "The Lantern Inn", "First safe place in town")],
    },
  ];
}
