import { BookOpenIcon, CalendarDaysIcon, CheckCircle2Icon, Clock3Icon, MapPinIcon, PackageIcon, PuzzleIcon, ScrollTextIcon, SwordsIcon, UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import sampleArtwork from "@/assets/sample-campaign/artwork.json";

const sectionArtwork: Record<string, { banner: string; entries: string[] }> = {
  Overview: { banner: "greyhaven", entries: [] },
  Sessions: { banner: "harbor", entries: ["eastern-seawall", "harbor", "lantern-inn"] },
  "Story Threads": { banner: "eastern-seawall", entries: ["eastern-seawall", "harbor", "dockworkers-guild", "greyhaven"] },
  Items: { banner: "harbor-relics", entries: ["harbor-relics", "harbor-relics", "harbor-relics", "harbor-relics"] },
  Puzzles: { banner: "salt-written-chart", entries: ["eastern-seawall", "salt-written-chart", "salt-written-chart"] },
};

function artworkUrl(name: string) {
  return sampleArtwork[name as keyof typeof sampleArtwork];
}

const sections = {
  Overview: {
    eyebrow: "Campaign dashboard", title: "The Lanterns of Greyhaven", description: "A coastal mystery about old promises, missing ships, and lights that should not be burning.",
    stats: [["Next session", "The Low Tide", "Tomorrow · 6:30 PM"], ["Active threads", "4", "2 ready to resolve"], ["Known places", "12", "Across 3 regions"], ["Party funds", "248 gp", "Shared inventory"]],
  },
  Sessions: {
    eyebrow: "Campaign journal", title: "Sessions", description: "A running record of the party’s adventures and the choices that changed Greyhaven.",
    entries: [
      ["Session 08 · The Low Tide", "Planned · Tomorrow, 6:30 PM", "The harbor bells rang at low tide. The party follows a lantern beneath the old seawall.", "Upcoming"],
      ["Session 07 · Ashes at the Quay", "Played · 12 Mar", "The smugglers’ warehouse burned. A soaked manifest survived in the cellar.", "Played"],
      ["Session 06 · A Debt in Salt", "Played · 05 Mar", "Niya arranged passage aboard the Morrow. Captain Venn recognized the party’s sigil.", "Played"],
    ],
  },
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

const icons: Record<string, typeof BookOpenIcon> = { Overview: CalendarDaysIcon, Sessions: BookOpenIcon, "Story Threads": ScrollTextIcon, Items: PackageIcon, Puzzles: PuzzleIcon };

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
        {"stats" in data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.stats.map(([label, value, detail]) => <Card key={label}><CardHeader><CardDescription>{label}</CardDescription><CardTitle variant="dossier">{value}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{detail}</p></CardContent></Card>)}
            </section>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle variant="dossier">The story so far</CardTitle><CardDescription>Recent events in Greyhaven</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-4 text-sm leading-6"><p>The party arrived in Greyhaven looking for passage north. A missing ship, a stolen cargo ledger, and a lantern shining beneath the harbor have pulled them into the city’s older secrets.</p><div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3"><Clock3Icon className="mt-0.5 size-4 text-muted-foreground" /><span><strong>Next up:</strong> The tide will expose a sealed stair beneath the eastern seawall.</span></div></div></CardContent></Card>
              <Card><CardHeader><CardTitle variant="dossier">Recent activity</CardTitle><CardDescription>At the table and around town</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-3 text-sm"><p className="flex gap-3"><CheckCircle2Icon className="size-4 text-muted-foreground" />The party recovered a waterlogged cargo manifest.</p><p className="flex gap-3"><MapPinIcon className="size-4 text-muted-foreground" />Niya found a lead at the Lantern Inn.</p><p className="flex gap-3"><UsersIcon className="size-4 text-muted-foreground" />Carlos warned the group about Mossgate Watch.</p></div></CardContent></Card>
            </div>
          </>
        ) : (
          <section className="grid gap-4 lg:grid-cols-2">
            {data.entries.map(([title, meta, description, status], index) => <Card key={title}><img src={artworkUrl(artwork.entries[index])} alt={`Illustration for ${title}`} loading="lazy" className="aspect-video w-full object-cover" /><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle variant="dossier">{title}</CardTitle><Badge variant="secondary">{status}</Badge></div><CardDescription>{meta}</CardDescription></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">{description}</p></CardContent></Card>)}
          </section>
        )}
      </div>
    </main>
  );
}
