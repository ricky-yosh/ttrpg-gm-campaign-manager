import { useId, useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { LocationParentField } from "./location-fields";
import { useCampaign } from "@/lib/campaign-data";
import { locationSearchResults } from "@/lib/location-data";
import type { MapPin } from "@/lib/map-data";

export type PinDetails = { locationId: string; newName: string; parentId: string | null; label: string; destinationMapId: string | null };
export function MapPinEditor({ mapId, pin, initialLocationId = "", onClose, onChoose }: {
  mapId: string; pin?: MapPin; initialLocationId?: string; onClose: () => void; onChoose: (details: PinDetails) => void;
}) {
  const locations = useCampaign((state) => state.campaign.locations);
  const maps = useCampaign((state) => state.campaign.maps) ?? [];
  const [query, setQuery] = useState("");
  const [locationId, setLocationId] = useState(pin?.locationId ?? initialLocationId);
  const [newName, setNewName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [label, setLabel] = useState(pin?.label ?? "");
  const [destinationMapId, setDestinationMapId] = useState(pin?.destinationMapId ?? "");
  const [error, setError] = useState("");
  const searchId = useId(); const nameId = useId(); const labelId = useId(); const destinationId = useId();
  const locationResults = locationSearchResults(locations, query);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogPopup><div className="flex flex-col gap-4 overflow-y-auto p-5">
    <DialogTitle>{pin ? "Edit location pin" : "Add location pin"}</DialogTitle>
    <DialogDescription>{pin ? "Change this placement's link or label. The location dossier remains its source of details." : "Choose a place, then click its position on the map. New locations are created only when placed."}</DialogDescription>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (locationId === "new" ? !newName.trim() : !locations.some((location) => location.id === locationId)) { setError("Choose an available location or enter a new location name."); return; }
      onChoose({ locationId: locationId === "new" ? "" : locationId, newName: locationId === "new" ? newName.trim() : "", parentId, label: label.trim(), destinationMapId: destinationMapId || null });
    }}><FieldGroup>
      <Field>
        <FieldLabel htmlFor={searchId}>Linked location</FieldLabel>
        <Autocomplete.Root
          open
          inline
          items={locationResults}
          value={query}
          onValueChange={(value, details) => {
            setQuery(value);
            if (details.reason === "input-change" || details.reason === "input-clear") setLocationId("");
          }}
          itemToStringValue={({ location, path }) => [path, location.name].filter(Boolean).join(" / ")}
          autoHighlight="always"
        >
          <Autocomplete.Input id={searchId} placeholder="Search places…" className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
          <Autocomplete.Empty className="text-sm text-muted-foreground">
            <Empty size="inline">
              <EmptyHeader>
                <EmptyTitle>No matching locations</EmptyTitle>
                <EmptyDescription>Try a different search or create a new location.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Autocomplete.Empty>
          <Autocomplete.List className="max-h-40 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            {(result: (typeof locationResults)[number]) => (
              <Autocomplete.Item
                key={result.location.id}
                value={result}
                onClick={() => setLocationId(result.location.id)}
                className="flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
              >
                {[result.path, result.location.name].filter(Boolean).join(" / ")}
              </Autocomplete.Item>
            )}
          </Autocomplete.List>
        </Autocomplete.Root>
        <Button type="button" size="inline" variant={locationId === "new" ? "secondary" : "link"} className="w-fit" onClick={() => { setLocationId("new"); setQuery(""); }}>
          Create new location
        </Button>
        {locationId && locationId !== "new" && <p className="text-sm text-muted-foreground">Selected: {locations.find((location) => location.id === locationId)?.name}</p>}
      </Field>
      {locationId === "new" && <><Field><FieldLabel htmlFor={nameId}>New location name</FieldLabel><Input id={nameId} value={newName} required onChange={(event) => setNewName(event.currentTarget.value)} /></Field><LocationParentField locations={locations} parentId={parentId} onChange={setParentId} /></>}
      <Field><FieldLabel htmlFor={labelId}>Pin label override (optional)</FieldLabel><Input id={labelId} value={label} onChange={(event) => setLabel(event.currentTarget.value)} placeholder="Use location name" /></Field>
      <Field><FieldLabel htmlFor={destinationId}>Linked map shortcut (optional)</FieldLabel><NativeSelect id={destinationId} value={destinationMapId} onChange={(event) => setDestinationMapId(event.currentTarget.value)}><NativeSelectOption value="">None</NativeSelectOption>{maps.filter((map) => map.id !== mapId).map((map) => <NativeSelectOption key={map.id} value={map.id}>{map.name}</NativeSelectOption>)}</NativeSelect></Field>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">{pin ? "Save pin" : "Choose position"}</Button></div>
    </FieldGroup></form>
  </div></DialogPopup></Dialog>;
}
