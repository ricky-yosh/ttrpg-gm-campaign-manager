import { useId, useState } from "react";
import { MapPinIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { appCommands } from "@/lib/app-commands";
import { createLocation, useCampaign } from "@/lib/campaign-data";

export function LocationsDirectory() {
  const locations = useCampaign((state) => state.campaign.locations);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const id = useId();
  return <>
    <SidebarMenuItem>
      <SidebarMenuButton tooltip="New location" onClick={() => setCreating(true)}><PlusIcon aria-hidden="true" /><span>New location</span></SidebarMenuButton>
    </SidebarMenuItem>
    {creating && <li className="p-2">
      <form onSubmit={(event) => {
        event.preventDefault();
        const locationId = createLocation(name);
        if (!locationId) return;
        setName(""); setCreating(false); appCommands.openLocation(locationId);
      }}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={id}>Location name</FieldLabel>
            <Input id={id} value={name} onChange={(event) => setName(event.currentTarget.value)} required />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={!name.trim()}>Create</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setCreating(false); setName(""); }}>Cancel</Button>
          </div>
        </FieldGroup>
      </form>
    </li>}
    {(locations ?? []).map((location) => <SidebarMenuItem key={location.id}>
      <SidebarMenuButton tooltip={location.name} onClick={() => appCommands.openLocation(location.id)}><MapPinIcon aria-hidden="true" /><span>{location.name}</span></SidebarMenuButton>
    </SidebarMenuItem>)}
    {!locations?.length && <li className="px-2 py-2 text-sm text-muted-foreground">No locations yet.</li>}
  </>;
}
