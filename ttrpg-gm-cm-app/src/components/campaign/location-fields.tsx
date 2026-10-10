import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { appCommands } from "@/lib/app-commands";
import { createLocation, useCampaign } from "@/lib/campaign-data";
import { canParentLocation, locationAncestors, type Location } from "@/lib/location-data";

export function LocationSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (value: string) => void; children: ReactNode;
}) {
  const id = useId();
  return <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <NativeSelect className="w-full" id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
      {children}
    </NativeSelect>
  </Field>;
}

export function LocationParentField({ locations, locationId = "", parentId, onChange }: {
  locations: Location[]; locationId?: string; parentId: string | null; onChange: (id: string | null) => void;
}) {
  return <LocationSelect label="Parent location" value={parentId ?? ""} onChange={(value) => onChange(value || null)}>
    <NativeSelectOption value="">None — top-level location</NativeSelectOption>
    {locations.filter((location) => canParentLocation(locations, locationId, location.id)).map((location) =>
      <NativeSelectOption key={location.id} value={location.id}>
        {[...locationAncestors(locations, location.id).map((parent) => parent.name), location.name].join(" / ")}
      </NativeSelectOption>)}
  </LocationSelect>;
}

export function LocationCreateForm({ initialParentId = null, onClose }: {
  initialParentId?: string | null; onClose: () => void;
}) {
  const locations = useCampaign((state) => state.campaign.locations);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(initialParentId);
  const [error, setError] = useState("");
  const id = useId();
  return <form onSubmit={(event) => {
    event.preventDefault();
    const locationId = createLocation(name, parentId);
    if (!locationId) { setError("Choose an available parent and enter a name."); return; }
    onClose();
    appCommands.openLocation(locationId);
  }}>
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={id}>Location name</FieldLabel>
        <Input id={id} value={name} onChange={(event) => setName(event.currentTarget.value)} required autoFocus />
      </Field>
      <LocationParentField locations={locations} parentId={parentId} onChange={setParentId} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!name.trim()}>Create</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </FieldGroup>
  </form>;
}
