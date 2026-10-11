import { MapIcon, PlusIcon } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { SidebarSectionHeading } from "./sidebar-section-heading";
import { appCommands } from "@/lib/app-commands";
import { useCampaign } from "@/lib/campaign-data";
import { useSessionStore } from "@/stores/session-store";

export function MapsDirectory() {
  const maps = useCampaign((state) => state.campaign.maps);
  const destination = useSessionStore((state) => state.workspaceDestination);
  return <>
    <SidebarMenuItem>
      <SidebarSectionHeading title="Maps" actionLabel="Add map" onCreate={appCommands.createMap} className="px-2 pb-3 pt-4 group-data-[collapsible=icon]:hidden" />
      <SidebarMenuButton className="hidden group-data-[collapsible=icon]:flex" tooltip="Add map" onClick={appCommands.createMap}>
        <PlusIcon aria-hidden="true" /><span>Add map</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
    {(maps ?? []).map((map) => <SidebarMenuItem key={map.id}>
      <SidebarMenuButton tooltip={map.name} isActive={destination?.kind === "map" && destination.mapId === map.id} onClick={() => appCommands.openMap(map.id)}>
        <MapIcon aria-hidden="true" /><span>{map.name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>)}
    {!maps?.length && <li className="group-data-[collapsible=icon]:hidden"><div className="px-2 py-2"><Empty size="inline"><EmptyHeader><EmptyTitle>No maps yet</EmptyTitle><EmptyDescription>Use Add map to import artwork.</EmptyDescription></EmptyHeader></Empty></div></li>}
  </>;
}
