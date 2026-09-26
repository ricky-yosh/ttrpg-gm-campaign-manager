import {
  BookOpenIcon, ChevronsUpDownIcon, Dice5Icon, FlagIcon, LayoutDashboardIcon,
  MapIcon, PackageIcon, PuzzleIcon, ScrollTextIcon, SettingsIcon, UsersIcon,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";

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

export function AppSidebar({ section, onSelect }: { section: string; onSelect: (section: string) => void }) {
  const { isMobile, setOpenMobile } = useSidebar();

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
        <SidebarGroup>
          <SidebarGroupLabel>Campaign</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Campaign navigation">
              <SidebarMenu>
                {destinations.map(({ label, icon: Icon }) => (
                  <SidebarMenuItem key={label}>
                    <SidebarMenuButton
                      isActive={section === label}
                      aria-current={section === label ? "page" : undefined}
                      onClick={() => {
                        onSelect(label);
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton aria-disabled="true" title="Settings — coming soon">
              <SettingsIcon aria-hidden="true" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
