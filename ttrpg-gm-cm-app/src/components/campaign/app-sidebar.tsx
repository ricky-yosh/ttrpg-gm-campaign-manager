import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { appCommands } from "@/lib/app-commands";
import { useSessionStore } from "@/stores/session-store";
import {
  ArrowLeftIcon, BookOpenIcon, ChevronsUpDownIcon, CircleHelpIcon, Dice5Icon, FlagIcon, FolderOpenIcon,
  LayoutDashboardIcon, MapIcon, PackageIcon, PaletteIcon, PuzzleIcon, ScrollTextIcon, SettingsIcon, UserPlusIcon, UsersIcon,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { openCampaignAt, useCampaign } from "@/lib/campaign-data";
import { SidebarResizeHandle } from "@/components/ui/sidebar-resize-handle";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type RecentCampaign = { name: string; path: string };
const RECENT_CAMPAIGNS_KEY = "ttrpg-gm-cm.recent-campaigns";

function readRecentCampaigns(): RecentCampaign[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_CAMPAIGNS_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((item): item is RecentCampaign =>
      typeof item?.name === "string" && typeof item?.path === "string",
    );
  } catch {
    return [];
  }
}

function rememberCampaign(name: string, path: string): RecentCampaign[] {
  const recent = [{ name, path }, ...readRecentCampaigns().filter((item) => item.path !== path)].slice(0, 8);
  try {
    localStorage.setItem(RECENT_CAMPAIGNS_KEY, JSON.stringify(recent));
  } catch {
    // Keep the picker usable for the current session if storage is unavailable.
  }
  return recent;
}

const destinations = [
  { label: "Overview", icon: LayoutDashboardIcon },
  { label: "Sessions", icon: BookOpenIcon },
  { label: "Characters", icon: UsersIcon },
  { label: "Factions", icon: FlagIcon },
  { label: "Locations & Maps", icon: MapIcon },
  { label: "Items", icon: PackageIcon },
  { label: "Story Threads", icon: ScrollTextIcon },
  { label: "Puzzles", icon: PuzzleIcon },
];

export function AppSidebar() {
  const { campaignName, campaignPath, campaignStatus, isLeaving } = useCampaign(useShallow((state) => ({
    campaignName: state.campaign.name, campaignPath: state.path, campaignStatus: state.status, isLeaving: state.isLeaving,
  })));
  const ids = useCampaign(useShallow((state) => state.campaign.npcs.map((npc) => npc.id)));
  const names = useCampaign(useShallow((state) => state.campaign.npcs.map((npc) => npc.name)));
  const section = useSessionStore((state) => state.section);
  const sidebarWidth = useSessionStore((state) => state.sidebar.width);
  const isShortcutsOpen = useSessionStore((state) => state.shortcutsOpen);
  const setIsShortcutsOpen = useSessionStore((state) => state.setShortcutsOpen);
  const setSidebarWidth = (width: number) => useSessionStore.getState().setSidebar({ width });
  const { isMobile, open, setOpen } = useSidebar();
  const [recentCampaigns, setRecentCampaigns] = useState<RecentCampaign[]>(readRecentCampaigns);
  const isMacOS = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const selectSection = (nextSection: string) => {
    appCommands.selectSection(nextSection);
  };

  useEffect(() => {
    if (!campaignPath || campaignStatus !== "Saved") return;
    setRecentCampaigns(rememberCampaign(campaignName, campaignPath));
  }, [campaignName, campaignPath, campaignStatus]);

  return (
    <Sidebar className="top-11 bottom-0 h-auto" collapsible="icon" width={sidebarWidth}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger disabled={isLeaving} render={
                <SidebarMenuButton size="lg" tooltip="Recent campaigns" title="Recent campaigns">
                  <Dice5Icon aria-hidden="true" />
                  <span className="flex flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                    <span>{campaignName}</span>
                    <span className="text-xs text-muted-foreground">D&D 5.5e</span>
                  </span>
                  <ChevronsUpDownIcon className="group-data-[collapsible=icon]:hidden" aria-hidden="true" />
                </SidebarMenuButton>
              } />
              <DropdownMenuContent className="w-64" align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Recent campaigns</DropdownMenuLabel>
                  {recentCampaigns.length ? recentCampaigns.map((campaign) => (
                    <DropdownMenuItem key={campaign.path} onClick={() => void openCampaignAt(campaign.path)}>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{campaign.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{campaign.path}</span>
                      </span>
                    </DropdownMenuItem>
                  )) : <DropdownMenuItem disabled>No recent campaigns</DropdownMenuItem>}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void appCommands.openCampaign()}>
                  <FolderOpenIcon aria-hidden="true" />Open campaign…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {section && section !== "Settings" ? (
          <div key={`section:${section}`} className="animate-in fade-in slide-in-from-right-2 duration-200">
          <SidebarGroup>
            <SidebarGroupLabel className="sr-only">{section} navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="All sections" onClick={() => appCommands.selectSection(null)}>
                    <ArrowLeftIcon aria-hidden="true" />
                    <span>All sections</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {section === "Characters" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="New NPC" onClick={appCommands.createNpc}>
                      <UserPlusIcon aria-hidden="true" />
                      <span>New NPC</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
              <div className="px-2 pb-2 pt-4 text-xs font-semibold text-muted-foreground group-data-[collapsible=icon]:hidden">{section}</div>
              <SidebarMenu>
                {section === "Characters" ? ids.map((id, index) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton tooltip={names[index]} onClick={() => appCommands.openCharacter(id)}>
                      <UsersIcon aria-hidden="true" />
                      <span>{names[index]}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )) : section === "Locations & Maps" ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Map prototype" onClick={appCommands.openMap}>
                      <MapIcon aria-hidden="true" />
                      <span>Map prototype</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : (
                  <li className="px-2 py-2 text-sm text-muted-foreground">Nothing here yet</li>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          </div>
        ) : section === "Settings" ? (
          <div key="settings" className="animate-in fade-in slide-in-from-right-2 duration-200">
            <SidebarGroup>
              <SidebarGroupLabel className="sr-only">Settings navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="All sections" onClick={() => appCommands.selectSection(null)}>
                      <ArrowLeftIcon aria-hidden="true" />
                      <span>All sections</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
                <div className="px-2 pb-2 pt-4 text-xs font-semibold text-muted-foreground group-data-[collapsible=icon]:hidden">Settings</div>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Appearance" isActive onClick={() => selectSection("Settings")}>
                      <PaletteIcon aria-hidden="true" />
                      <span>Appearance</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ) : (
          <div key="sections" className="animate-in fade-in slide-in-from-left-2 duration-200">
          <SidebarGroup>
            <SidebarGroupLabel>Campaign</SidebarGroupLabel>
            <SidebarGroupContent>
              <nav aria-label="Campaign navigation">
                <SidebarMenu>
                  {destinations.map(({ label, icon: Icon }) => (
                    <SidebarMenuItem key={label}>
                      <SidebarMenuButton tooltip={label} onClick={() => selectSection(label)}>
                        <Icon aria-hidden="true" />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
          </div>
        )}
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        {section === null && (
          <div key="root-actions" className="animate-in fade-in slide-in-from-left-2 duration-200">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Keyboard shortcuts" onClick={appCommands.openShortcuts} title="Keyboard shortcuts">
                  <CircleHelpIcon aria-hidden="true" />
                  <span>Keyboard shortcuts</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Settings" onClick={() => selectSection("Settings")}>
                  <SettingsIcon aria-hidden="true" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        )}
      </SidebarFooter>
      {!isMobile && (
        <SidebarResizeHandle
          label="Resize campaign sidebar"
          width={sidebarWidth}
          collapsed={!open}
          collapsedWidth={48}
          minWidth={200}
          maxWidth={400}
          collapseThreshold={160}
          onWidthChange={setSidebarWidth}
          onCollapsedChange={(collapsed) => setOpen(!collapsed)}
        />
      )}
      <Dialog open={isShortcutsOpen} onOpenChange={setIsShortcutsOpen}>
        <DialogPopup>
          <div className="border-b px-5 py-4">
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription className="mt-1">Navigate the workspace and search from the keyboard. Use the top-bar search button while editing rich text.</DialogDescription>
          </div>
          <div className="space-y-5 p-5">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace</h3>
              <dl className="space-y-3">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Close active tab</dt>
                  <Kbd>{isMacOS ? "⌘ W" : "Ctrl W"}</Kbd>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Open search and command palette</dt>
                  <Kbd>{isMacOS ? "⌘ K" : "Ctrl K"}</Kbd>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Open settings</dt>
                  <Kbd>{isMacOS ? "⌘ ," : "Ctrl ,"}</Kbd>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Toggle sidebar</dt>
                  <Kbd>{isMacOS ? "⌘ B" : "Ctrl B"}</Kbd>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Toggle workspaces sidebar</dt>
                  <Kbd>{isMacOS ? "⌘ \\" : "Ctrl \\"}</Kbd>
                </div>
              </dl>
            </section>

          </div>
          <div className="flex justify-end border-t px-5 py-3">
            <Button type="button" variant="outline" onClick={() => setIsShortcutsOpen(false)}>Done</Button>
          </div>
        </DialogPopup>
      </Dialog>
    </Sidebar>
  );
}
