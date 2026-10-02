import { useEffect, useState } from "react";
import {
  ArrowLeftIcon, BookOpenIcon, ChevronsUpDownIcon, CircleHelpIcon, Dice5Icon, FlagIcon, LayoutDashboardIcon,
  MapIcon, PackageIcon, PuzzleIcon, ScrollTextIcon, SettingsIcon, UsersIcon,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { updateCampaign, useCampaign } from "@/lib/campaign-data";
import { SidebarResizeHandle } from "@/components/ui/sidebar-resize-handle";

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

type AppSidebarProps = {
  section: string | null;
  onSelectSection: (section: string | null) => void;
  onOpenCharacter: (name: string) => void;
  onCreateNpc: () => void;
};

export function AppSidebar({ section, onSelectSection, onOpenCharacter, onCreateNpc }: AppSidebarProps) {
  const { campaign } = useCampaign();
  const { isMobile, setOpenMobile, open, setOpen } = useSidebar();
  const [sidebarWidth, setSidebarWidth] = useState(campaign.sidebar.width);
  useEffect(() => {
    if (campaign.sidebar.width !== sidebarWidth || campaign.sidebar.open !== open) updateCampaign({ sidebar: { width: sidebarWidth, open } });
  }, [sidebarWidth, open, campaign.sidebar]);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const isMacOS = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const selectSection = (nextSection: string) => {
    onSelectSection(nextSection);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar className="top-11 bottom-0 h-auto" collapsible="icon" width={sidebarWidth}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" aria-disabled="true" title={campaign.name}>
              <Dice5Icon aria-hidden="true" />
              <span className="flex flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                <span>{campaign.name}</span>
                <span className="text-xs text-muted-foreground">D&D 5.5e</span>
              </span>
              <ChevronsUpDownIcon className="group-data-[collapsible=icon]:hidden" aria-hidden="true" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {section ? (
          <div key={`section:${section}`} className="animate-in fade-in slide-in-from-right-2 duration-200">
          <SidebarGroup>
            <SidebarGroupLabel className="sr-only">{section} navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="All sections" onClick={() => onSelectSection(null)}>
                    <ArrowLeftIcon aria-hidden="true" />
                    <span>All sections</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              <div className="px-2 pb-2 pt-4 text-xs font-semibold text-muted-foreground group-data-[collapsible=icon]:hidden">{section}</div>
              {section === "Characters" && <Button variant="outline" onClick={onCreateNpc}>New NPC</Button>}
              <SidebarMenu>
                {section === "Characters" ? campaign.npcs.map(({ id, name }) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton tooltip={name} onClick={() => onOpenCharacter(id)}>
                      <UsersIcon aria-hidden="true" />
                      <span>{name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )) : (
                  <li className="px-2 py-2 text-sm text-muted-foreground">Nothing here yet</li>
                )}
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Keyboard shortcuts" onClick={() => setIsShortcutsOpen(true)} title="Keyboard shortcuts">
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
                  <dt>Toggle sidebar</dt>
                  <Kbd>{isMacOS ? "⌘ B" : "Ctrl B"}</Kbd>
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
