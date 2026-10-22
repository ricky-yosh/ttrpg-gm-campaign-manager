import { PackageIcon, PuzzleIcon, ScrollTextIcon, SwordsIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import sampleArtwork from "@/assets/sample-campaign/artwork.json";

const sectionArtwork: Record<string, { banner: string; entries: string[] }> = {
  "Story Threads": { banner: "eastern-seawall", entries: ["eastern-seawall", "harbor", "dockworkers-guild", "greyhaven"] },
  Items: { banner: "harbor-relics", entries: ["harbor-relics", "harbor-relics", "harbor-relics", "harbor-relics"] },
  Puzzles: { banner: "salt-written-chart", entries: ["eastern-seawall", "salt-written-chart", "salt-written-chart"] },
};

function artworkUrl(name: string) {
  return sampleArtwork[name as keyof typeof sampleArtwork];
}

const sections = {
  "Story Threads": {
    eyebrow: "Campaign journal", title: "Story Threads", description: "Open questions, looming trouble, and the leads the party can follow next.",
    entries: [
      ["The Lantern Below", "Urgent · Greyhaven", "A pale light moves under the seawall whenever the tide turns. The old lighthouse ledger names the same signal.", "In motion"],
      ["The Missing Morrow", "Mystery · Northern Reach", "The fishing vessel vanished three nights ago. Its empty dinghy washed ashore with fresh wax seals inside.", "Gathering clues"],
      ["A Favor for the Guild", "Character · Dock Ward", "The Dockworkers’ Guild wants the party to identify who is diverting its night shipments.", "Ready"],
      ["Mossgate Watch", "Long term · Harrow Glen", "Blue sparks have returned to the forest ruin, and Carlos refuses to go there alone.", "Waiting"],
    ],
  },
  Items: {
    eyebrow: "People & things", title: "Item Catalog", description: "Notable gear, curiosities, and rewards the party may encounter.",
    entries: [
      ["Tideglass Compass", "Wondrous item · Uncommon", "Its needle points toward the nearest body of salt water. At night, it trembles near old magic.", "Unidentified"],
      ["Morrow’s Wax Seal", "Evidence · Quest item", "A black wax seal stamped with a split crescent. The matching ledger is missing.", "Party holds"],
      ["Lantern of the Deep", "Wondrous item · Rare", "A brass hooded lantern that burns with cold blue light beneath the sea.", "Not found"],
      ["Dock Ward Key", "Tool · Common", "A heavy iron key marked with the Dockworkers’ Guild tally.", "Niya carries"],
    ],
  },
  Puzzles: {
    eyebrow: "People & things", title: "Puzzles & Clues", description: "Mysteries prepared for play, with their current state and table-facing clues.",
    entries: [
      ["The Three Harbor Bells", "Location · Greyhaven seawall", "Ring the bells in the order the ships entered the harbor: Morrow, Wren, then Saint Orra.", "Unsolved"],
      ["The Salt-Written Chart", "Prop · The Lantern Inn", "Warm seawater reveals a second coastline beneath the ink. The marked cove has no name on modern maps.", "Clue found"],
      ["The Lighthouse Ledger", "Investigation · North Point", "One page was cut out cleanly. The remaining entries stop on the night the Morrow disappeared.", "In progress"],
    ],
  },
} as const;

const icons: Record<string, typeof ScrollTextIcon> = { "Story Threads": ScrollTextIcon, Items: PackageIcon, Puzzles: PuzzleIcon };

export function SampleSectionPage({ section }: { section: string }) {
  const data = sections[section as keyof typeof sections];
  if (!data) return null;
  const Icon = icons[section] ?? SwordsIcon;
  const artwork = sectionArtwork[section];
  return (
    <main className="h-full overflow-auto bg-background px-6 py-8 md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <img src={artworkUrl(artwork.banner)} alt={`Artwork for ${data.title}`} className="aspect-[4/1] w-full rounded-xl object-cover" />
        <header className="flex flex-col gap-3 border-b pb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Icon className="size-4" />{data.eyebrow}<Badge variant="outline">Sample campaign</Badge></div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">{data.title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{data.description}</p>
        </header>
        <section className="grid gap-4 lg:grid-cols-2">
          {data.entries.map(([title, meta, description, status], index) => <Card key={title}><img src={artworkUrl(artwork.entries[index])} alt={`Illustration for ${title}`} loading="lazy" className="aspect-video w-full object-cover" /><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle variant="dossier">{title}</CardTitle><Badge variant="secondary">{status}</Badge></div><CardDescription>{meta}</CardDescription></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">{description}</p></CardContent></Card>)}
        </section>
      </div>
    </main>
  );
}
