import { useEffect, useState } from "react";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { locationIcon } from "@/components/campaign/location-icon";
import { LocationCreateForm } from "@/components/campaign/location-fields";
import { appCommands } from "@/lib/app-commands";
import { useCampaign } from "@/lib/campaign-data";
import { locationAncestors, type Location } from "@/lib/location-data";
import { useSessionStore } from "@/stores/session-store";

export function LocationsDirectory() {
  const locations = useCampaign((state) => state.campaign.locations);
  const destination = useSessionStore((state) => state.workspaceDestination);
  const activeId = destination?.kind === "location" ? destination.locationId : null;
  const collapsedIds = useSessionStore((state) => state.locationDirectory.collapsedIds);
  const setDirectory = useSessionStore((state) => state.setLocationDirectory);
  const [creating, setCreating] = useState(false);

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
    const indentation = Math.min(depth, 5) * 10;
    return <SidebarMenuItem key={location.id}>
      <div className="relative min-w-0">
        <SidebarMenuButton tooltip={location.name} title={location.name} aria-current={activeId === location.id ? "page" : undefined} isActive={activeId === location.id}
          className="min-w-0" style={{ paddingLeft: indentation + 20 }} onClick={() => appCommands.openLocation(location.id)}>
          <Icon aria-hidden="true" /><span className="truncate">{location.name}</span>
        </SidebarMenuButton>
        {children.length > 0 && <Button type="button" variant="disclosure" size="icon-xs"
          className="absolute top-1 w-4" style={{ left: indentation }}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${location.name}`} aria-expanded={expanded}
          onClick={() => setDirectory({ collapsedIds: expanded ? [...collapsedIds, location.id] : collapsedIds.filter((id) => id !== location.id) })}>
          <ChevronRightIcon aria-hidden="true" className="transition-transform duration-150 group-aria-expanded/button:rotate-90 motion-reduce:transition-none" />
        </Button>}
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
      <SidebarMenu>
        {locations.filter((location) => !location.parentId || !locations.some((parent) => parent.id === location.parentId)).map((location) => renderLocation(location, 0))}
      </SidebarMenu>
      {!locations.length && <Empty size="compact">
        <EmptyHeader><EmptyTitle>Your atlas starts here</EmptyTitle>
          <EmptyDescription>Create a location, then add places within it.</EmptyDescription></EmptyHeader>
      </Empty>}

    </div>
    <SidebarMenuButton className="hidden group-data-[collapsible=icon]:flex" tooltip="New location" onClick={() => { useSessionStore.getState().setSidebar({ open: true }); setCreating(true); }}>
      <PlusIcon aria-hidden="true" /><span>New location</span>
    </SidebarMenuButton>
  </SidebarMenuItem>;
}
