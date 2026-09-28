import { useState } from "react";
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

const characters = ["Carlos Tree", "Niya Jade", "Renot Force"];

type AppSidebarProps = {
  section: string | null;
  onSelectSection: (section: string | null) => void;
  onOpenCharacter: (name: string) => void;
};

export function AppSidebar({ section, onSelectSection, onOpenCharacter }: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const isMacOS = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const selectSection = (nextSection: string) => {
    onSelectSection(nextSection);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar className="top-11 bottom-0 h-auto" collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" aria-disabled="true" title="Campaign selector — coming soon">
              <Dice5Icon aria-hidden="true" />
              <span className="flex flex-1 flex-col gap-0.5">
                <span>My campaign</span>
                <span className="text-xs text-muted-foreground">D&D 5.5e</span>
              </span>
              <ChevronsUpDownIcon aria-hidden="true" />
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
                  <SidebarMenuButton onClick={() => onSelectSection(null)}>
                    <ArrowLeftIcon aria-hidden="true" />
                    <span>All sections</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              <div className="px-2 pb-2 pt-4 text-xs font-semibold text-muted-foreground">{section}</div>
              <SidebarMenu>
                {section === "Characters" ? characters.map((name) => (
                  <SidebarMenuItem key={name}>
                    <SidebarMenuButton onClick={() => onOpenCharacter(name)}>
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
                      <SidebarMenuButton onClick={() => selectSection(label)}>
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
            <SidebarMenuButton onClick={() => setIsShortcutsOpen(true)} title="Keyboard shortcuts">
              <CircleHelpIcon aria-hidden="true" />
              <span>Keyboard shortcuts</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => selectSection("Settings")}>
              <SettingsIcon aria-hidden="true" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <Dialog open={isShortcutsOpen} onOpenChange={setIsShortcutsOpen}>
        <DialogPopup>
          <div className="border-b px-5 py-4">
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription className="mt-1">Navigate the workspace and manage layouts from the keyboard. The layout shortcut is ignored while typing in text fields or editors.</DialogDescription>
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
                  <dt>Toggle sidebar</dt>
                  <Kbd>{isMacOS ? "⌘ B" : "Ctrl B"}</Kbd>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Open layout switcher</dt>
                  <Kbd>{isMacOS ? "⌘⇧L" : "Ctrl ⇧ L"}</Kbd>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Filter layouts</dt>
                  <Kbd>Type name</Kbd>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Move through results</dt>
                  <Kbd>↑ ↓</Kbd>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Open selected layout</dt>
                  <Kbd>Enter</Kbd>
                </div>
              </dl>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layout manager</h3>
              <dl className="space-y-3">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Open layout manager</dt>
                  <span className="text-right text-muted-foreground">Choose “Manage layouts”</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Save a new layout</dt>
                  <Kbd>Enter</Kbd>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Move between controls</dt>
                  <Kbd>Tab</Kbd>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt>Close a dialog</dt>
                  <Kbd>Esc</Kbd>
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
