import { useId, useState } from "react";
import { FlagIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { appCommands } from "@/lib/app-commands";
import { SidebarSectionHeading } from "@/components/campaign/sidebar-section-heading";
import { useSessionStore } from "@/stores/session-store";
import { createFaction, useCampaign } from "@/lib/campaign-data";

export function FactionsDirectory() {
  const factions = useCampaign((state) => state.campaign.factions);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const matches = (factions ?? []).filter((faction) => faction.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const id = useId();
  return <>
    <SidebarMenuItem>
      <SidebarSectionHeading title="Factions" actionLabel="New faction" className="px-2 pb-3 pt-4 group-data-[collapsible=icon]:hidden" onCreate={() => setCreating(true)} />
      <SidebarMenuButton className="hidden group-data-[collapsible=icon]:flex" tooltip="New faction" onClick={() => { useSessionStore.getState().setSidebar({ open: true }); setCreating(true); }}><PlusIcon aria-hidden="true" /><span>New faction</span></SidebarMenuButton>
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
    {Boolean(factions?.length) && <li className="px-2 pb-2 group-data-[collapsible=icon]:hidden"><Input aria-label="Search factions" placeholder="Search factions…" value={search} onChange={(event) => setSearch(event.currentTarget.value)} /></li>}
    {matches.map((faction) => <SidebarMenuItem key={faction.id}>
      <SidebarMenuButton tooltip={faction.name} onClick={() => appCommands.openFaction(faction.id)}><FlagIcon aria-hidden="true" /><span>{faction.name}</span></SidebarMenuButton>
    </SidebarMenuItem>)}
    {!factions?.length && <li className="px-2 py-2 text-sm text-muted-foreground">No factions yet.</li>}
    {Boolean(factions?.length) && !matches.length && <li className="px-2 py-2 text-sm text-muted-foreground">No matching factions.</li>}
  </>;
}
