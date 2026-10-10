import { useEffect, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { locationIcon } from "@/components/campaign/location-icon";
import { LocationCreateForm } from "@/components/campaign/location-fields";
import { appCommands } from "@/lib/app-commands";
import { useCampaign } from "@/lib/campaign-data";
import { locationAncestors, locationSearchResults, type Location } from "@/lib/location-data";
import { useSessionStore } from "@/stores/session-store";

export function LocationsDirectory() {
  const locations = useCampaign((state) => state.campaign.locations);
  const destination = useSessionStore((state) => state.workspaceDestination);
  const activeId = destination?.kind === "location" ? destination.locationId : null;
  const directory = useSessionStore((state) => state.locationDirectory);
  const setDirectory = useSessionStore((state) => state.setLocationDirectory);
  const [creating, setCreating] = useState(false);
  const { query, collapsedIds } = directory;

  useEffect(() => {
    if (!activeId) return;
    const ancestors = new Set(locationAncestors(locations, activeId).map((location) => location.id));
    const collapsed = useSessionStore.getState().locationDirectory.collapsedIds;
    if (collapsed.some((id) => ancestors.has(id))) {
      setDirectory({ collapsedIds: collapsed.filter((id) => !ancestors.has(id)) });
    }
  }, [activeId, locations, setDirectory]);

  const renderLocation = (location: Location, depth: number) => {
    const children = locations.filter((item) => item.parentId === location.id);
    const expanded = !collapsedIds.includes(location.id);
    const Icon = locationIcon(location.locationType);
    return <SidebarMenuItem key={location.id}>
      <div className="flex min-w-0 items-center gap-0.5" style={{ paddingLeft: Math.min(depth, 5) * 14 }}>
        {children.length ? <Button type="button" variant="ghost" size="icon-sm"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${location.name}`} aria-expanded={expanded}
          onClick={() => setDirectory({ collapsedIds: expanded ? [...collapsedIds, location.id] : collapsedIds.filter((id) => id !== location.id) })}>
          {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </Button> : <span className="w-7 shrink-0" />}
        <SidebarMenuButton tooltip={location.name} title={location.name} aria-current={activeId === location.id ? "page" : undefined} isActive={activeId === location.id}
          className="min-w-0" onClick={() => appCommands.openLocation(location.id)}>
          <Icon aria-hidden="true" /><span className="truncate">{location.name}</span>
        </SidebarMenuButton>
      </div>
      {expanded && children.length > 0 && <SidebarMenu>{children.map((child) => renderLocation(child, depth + 1))}</SidebarMenu>}
    </SidebarMenuItem>;
  };

  return <SidebarMenuItem>
    <div className="flex flex-col gap-3 px-2 pb-3 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Browse locations</span>
        <Button type="button" size="icon-sm" variant="outline" aria-label="New location" onClick={() => { setCreating(true); }}><PlusIcon /></Button>
      </div>
      {creating && <LocationCreateForm onClose={() => setCreating(false)} />}
      <Input aria-label="Search places" placeholder="Search places…" value={query} onChange={(event) => setDirectory({ query: event.currentTarget.value })} />
      <SidebarMenu>
        {query.trim() ? locationSearchResults(locations, query).map(({ location, path }) => {
          const Icon = locationIcon(location.locationType);
          return <SidebarMenuItem key={location.id}>
            <SidebarMenuButton className="h-auto min-h-9" title={path ? `${path} / ${location.name}` : location.name}
              isActive={activeId === location.id} onClick={() => appCommands.openLocation(location.id)}>
              <Icon aria-hidden="true" />
              <span className="flex min-w-0 flex-col"><span className="truncate">{location.name}</span>{path && <span className="truncate text-xs text-muted-foreground">{path}</span>}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>;
        }) : locations.filter((location) => !location.parentId || !locations.some((parent) => parent.id === location.parentId)).map((location) => renderLocation(location, 0))}
      </SidebarMenu>
      {(!locations.length || (query.trim() && !locationSearchResults(locations, query).length)) && <Empty size="compact">
        <EmptyHeader><EmptyTitle>{query.trim() ? "No matching places" : "Your atlas starts here"}</EmptyTitle>
          <EmptyDescription>{query.trim() ? "Try another name." : "Create a location, then add places within it."}</EmptyDescription></EmptyHeader>
      </Empty>}

    </div>
    <SidebarMenuButton className="hidden group-data-[collapsible=icon]:flex" tooltip="New location" onClick={() => { useSessionStore.getState().setSidebar({ open: true }); setCreating(true); }}>
      <PlusIcon aria-hidden="true" /><span>New location</span>
    </SidebarMenuButton>
  </SidebarMenuItem>;
}
