import { useId, useState } from "react";
import { FlagIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { appCommands } from "@/lib/app-commands";
import { createFaction, useCampaign } from "@/lib/campaign-data";

export function FactionsDirectory() {
  const factions = useCampaign((state) => state.campaign.factions);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const id = useId();
  return <>
    <SidebarMenuItem>
      <SidebarMenuButton tooltip="New faction" onClick={() => setCreating(true)}><PlusIcon aria-hidden="true" /><span>New faction</span></SidebarMenuButton>
    </SidebarMenuItem>
    {creating && <li className="p-2">
      <form onSubmit={(event) => {
        event.preventDefault();
        const factionId = createFaction(name);
        if (!factionId) return;
        setName(""); setCreating(false); appCommands.openFaction(factionId);
      }}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={id}>Faction name</FieldLabel>
            <Input id={id} value={name} onChange={(event) => setName(event.currentTarget.value)} required />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={!name.trim()}>Create</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setCreating(false); setName(""); }}>Cancel</Button>
          </div>
        </FieldGroup>
      </form>
    </li>}
    {(factions ?? []).map((faction) => <SidebarMenuItem key={faction.id}>
      <SidebarMenuButton tooltip={faction.name} onClick={() => appCommands.openFaction(faction.id)}><FlagIcon aria-hidden="true" /><span>{faction.name}</span></SidebarMenuButton>
    </SidebarMenuItem>)}
    {!factions?.length && <li className="px-2 py-2 text-sm text-muted-foreground">No factions yet.</li>}
  </>;
}
