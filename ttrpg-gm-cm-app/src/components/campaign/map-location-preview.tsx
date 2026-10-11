import { ChevronRightIcon, ExternalLinkIcon, LocateFixedIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LocationMaps } from "./location-maps";
import { appCommands } from "@/lib/app-commands";
import { useCampaign } from "@/lib/campaign-data";
import { locationAncestors, withLocationDefaults } from "@/lib/location-data";
import type { CampaignMap } from "@/lib/map-data";

export function MapLocationPreview({ map, locationId, onPreview, onCenter, onOpenLocation }: {
  map: CampaignMap; locationId: string; onPreview: (id: string) => void; onCenter: (pinId: string) => void; onOpenLocation: (id: string) => void;
}) {
  const locations = useCampaign((state) => state.campaign.locations);
  const npcs = useCampaign((state) => state.campaign.npcs);
  const factions = useCampaign((state) => state.campaign.factions);
  const raw = locations.find((place) => place.id === locationId);
  if (!raw) return <p className="p-4 text-sm text-muted-foreground">This location is unavailable. Select another pin or update its link.</p>;
  const location = withLocationDefaults(raw);
  const ancestors = locationAncestors(locations, location.id);
  const parent = ancestors[ancestors.length - 1];
  const children = locations.filter((place) => place.parentId === location.id);
  const image = location.image ?? location.banner;
  const pin = map.pins.find((item) => item.locationId === location.id);
  const related = npcs.filter((npc) => location.associatedNpcs.some((link) => link.targetId === npc.id) || npc.presentation.locations.some((link) => link.targetId === location.id));
  const shortcut = pin?.destinationMapId;
  return <div className="flex flex-col gap-4 p-4">
    <div className="sticky top-0 flex flex-col gap-3 bg-background pb-3">
    <nav aria-label="Location hierarchy" className="flex flex-wrap items-center gap-1 text-xs">
      {ancestors.map((ancestor) => <span key={ancestor.id} className="flex items-center gap-1"><Button variant="link" size="inline" onClick={() => onPreview(ancestor.id)}>{ancestor.name}</Button><ChevronRightIcon className="size-3" /></span>)}<span aria-current="page">{location.name}</span>
    </nav>
    <div className="flex flex-col gap-2">{pin?.label && pin.label !== location.name && <p className="text-xs text-muted-foreground">Pin label: {pin.label}</p>}<h2 className="break-words font-serif text-2xl font-semibold">{location.name}</h2><p className="text-xs text-muted-foreground">{location.locationType || "Location"}{!pin && " · No pin on this map"}</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onOpenLocation(location.id)}><ExternalLinkIcon data-icon="inline-start" />Open location</Button>{parent && <Button size="sm" variant="ghost" onClick={() => onPreview(parent.id)}>Back to {parent.name}</Button>}</div>
    </div>
    </div>
    {image && <img src={image.url} alt={location.name} className="max-h-52 w-full rounded-lg object-cover" />}
    <section className="flex flex-col gap-3"><h3 className="font-serif text-lg font-semibold">At a glance</h3><Separator /><dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Type</dt><dd>{location.locationType || "Unspecified"}</dd>
      <dt className="text-muted-foreground">Parent</dt><dd>{parent ? <Button variant="link" size="inline" onClick={() => onPreview(parent.id)}>{parent.name}</Button> : "Top-level location"}</dd>
      <dt className="text-muted-foreground">Party knowledge</dt><dd>{location.partyKnowledge[0].toUpperCase() + location.partyKnowledge.slice(1)}</dd>
      {location.tags.length > 0 && <><dt className="text-muted-foreground">Tags</dt><dd className="flex flex-wrap gap-1">{location.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</dd></>}
    </dl></section>
    {location.publicDescription && <section className="flex flex-col gap-2"><Separator /><h3 className="font-serif text-lg font-semibold">Description for players</h3><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{location.publicDescription}</p></section>}
    <section className="flex flex-col gap-3"><Separator /><h3 className="font-serif text-lg font-semibold">Places within <Badge variant="secondary">{children.length}</Badge></h3>
      {children.length ? children.map((child) => <Button key={child.id} variant="ghost" className="h-auto w-full justify-start" onClick={() => onPreview(child.id)}>
        {(child.image ?? child.banner) && <img src={(child.image ?? child.banner)!.url} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover" />}<span className="min-w-0 flex-1 text-left"><span className="block truncate">{child.name}</span><span className="block text-xs text-muted-foreground">{child.locationType || "Location"}</span></span><ChevronRightIcon data-icon="inline-end" />
      </Button>) : <p className="text-sm text-muted-foreground">No child locations.</p>}
    </section>
    <section className="flex flex-col gap-3"><Separator /><h3 className="font-serif text-lg font-semibold">Maps</h3><LocationMaps locationId={location.id} currentMapId={map.id} />
      {shortcut && <Button size="sm" variant="outline" onClick={() => appCommands.openMap(shortcut)}>Open linked map shortcut</Button>}
    </section>
    {related.length > 0 && <section className="flex flex-col gap-2"><Separator /><h3 className="font-serif text-lg font-semibold">Associated NPCs</h3>{related.map((npc) => <Button key={npc.id} variant="ghost" className="justify-start" onClick={() => appCommands.openCharacter(npc.id)}>{npc.name}</Button>)}</section>}
    {location.associatedFactions.length > 0 && <section className="flex flex-col gap-2"><Separator /><h3 className="font-serif text-lg font-semibold">Associated factions</h3>{location.associatedFactions.map((link) => {
      const faction = factions.find((item) => item.id === link.targetId);
      return <Button key={link.targetId} variant="ghost" className="justify-start" disabled={!faction} onClick={() => appCommands.openFaction(link.targetId)}>{faction?.name ?? "Unavailable faction"}</Button>;
    })}</section>}
    {pin && <Button variant="outline" size="sm" onClick={() => onCenter(pin.id)}><LocateFixedIcon data-icon="inline-start" />Center on pin</Button>}
  </div>;
}
