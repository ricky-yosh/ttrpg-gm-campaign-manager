import { useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { MapIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { MapEditor } from "./map-editor";
import { useCampaign } from "@/lib/campaign-data";
import { appCommands } from "@/lib/app-commands";
import type { CampaignMap } from "@/lib/map-data";

export function MapLibrary({ params }: IDockviewPanelProps) {
  const maps = useCampaign((state) => state.campaign.maps);
  const locations = useCampaign((state) => state.campaign.locations);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CampaignMap | "new" | null>(null);
  const search = query.trim().toLocaleLowerCase();
  const matches = (maps ?? []).filter((map) => [map.name, ...map.locationIds.map((id) => locations.find((place) => place.id === id)?.name ?? "")].some((name) => name.toLocaleLowerCase().includes(search)));
  return <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-serif text-3xl font-semibold">Maps</h1><Button onClick={() => setEditing("new")}><UploadIcon data-icon="inline-start" />Import map</Button></header>
    <Input aria-label="Search maps and attached places" placeholder="Search maps and places…" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
    {matches.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-4">
      {matches.map((map) => <Card key={map.id}>
        <CardHeader><CardTitle>{map.name}</CardTitle><CardDescription>{map.kind} · {map.locationIds.map((id) => locations.find((place) => place.id === id)?.name).filter(Boolean).join(", ") || "Standalone map"}</CardDescription></CardHeader>
        <CardContent><Button variant="ghost" size="inline" className="h-auto w-full" aria-label={`Open ${map.name}`} onClick={() => appCommands.openMap(map.id)}><img src={map.image.url} alt={map.name} className="h-40 w-full rounded-md bg-muted object-contain" /></Button></CardContent>
        <CardFooter><div className="flex gap-2"><Button size="sm" onClick={() => appCommands.openMap(map.id)}><MapIcon data-icon="inline-start" />Open</Button><Button variant="outline" size="sm" onClick={() => setEditing(map)}>Edit details</Button></div></CardFooter>
      </Card>)}
    </div> : <Empty><EmptyHeader><EmptyTitle>{search ? "No matching maps" : "Start your campaign atlas"}</EmptyTitle><EmptyDescription>{search ? "Try another map or place name." : "Import a world, city, building, or dungeon image, then link its pins to your locations."}</EmptyDescription></EmptyHeader></Empty>}
    {editing && <MapEditor map={editing === "new" ? undefined : editing} locationId={typeof params.locationId === "string" ? params.locationId : undefined} onClose={() => setEditing(null)} onSaved={(id) => appCommands.openMap(id)} />}
  </div>;
}
