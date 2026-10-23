import { useShallow } from "zustand/react/shallow";
import { appCommands } from "@/lib/app-commands";
import { selectCanGoBack, selectCanGoForward, useSessionStore } from "@/stores/session-store";
import { useEffect, useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import {
  BookOpenIcon, ArrowLeftIcon, ArrowRightIcon, CircleHelpIcon, FilePlus2Icon, FolderOpenIcon, LayoutTemplateIcon,
  PackageIcon, BackpackIcon, FlagIcon, MapPinIcon, MapIcon, MonitorIcon, PanelLeftCloseIcon, PanelLeftIcon, PanelTopCloseIcon, SaveIcon, SearchIcon, SettingsIcon, UserPlusIcon, UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useCampaign } from "@/lib/campaign-data";
import { locationAncestors } from "@/lib/location-data";
import { useSidebar } from "@/components/ui/sidebar";

type PaletteItem = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  onSelect: () => void;
};

type PaletteGroup = {
  value: string;
  items: PaletteItem[];
};

export function CommandPalette({ isPresenterView, onTogglePresenterView, onCloseActiveTab }: {
  isPresenterView: boolean;
  onTogglePresenterView: () => void;
  onCloseActiveTab: () => void;
}) {
  const open = useSessionStore((state) => state.commandPaletteOpen);
  const onOpenChange = useSessionStore((state) => state.setCommandPaletteOpen);
  const { toggleSidebar } = useSidebar();
  const canGoBack = useSessionStore(selectCanGoBack);
  const canGoForward = useSessionStore(selectCanGoForward);
  const ids = useCampaign(useShallow((state) => state.campaign.npcs.map((npc) => npc.id)));
  const names = useCampaign(useShallow((state) => state.campaign.npcs.map((npc) => npc.name)));
  const locations = useCampaign(useShallow((state) => state.campaign.locations ?? []));
  const maps = useCampaign((state) => state.campaign.maps);
  const items = useCampaign((state) => state.campaign.items);
  const threads = useCampaign(useShallow((state) => state.campaign.threads ?? []));
  const factions = useCampaign(useShallow((state) => state.campaign.factions ?? []));
  const paletteGroups: PaletteGroup[] = [
    {
      value: "Actions",
      items: [
        {
          id: "toggle-sidebar",
          label: "Toggle sidebar",
          description: "Show or hide the current navigation sidebar",
          keywords: ["navigation", "panel", "show", "hide"],
          icon: PanelLeftIcon,
          onSelect: toggleSidebar,
        },
        ...(!isPresenterView ? [{
          id: "toggle-workspaces-sidebar",
          label: "Toggle workspaces sidebar",
          description: "Show or hide the workspace list",
          keywords: ["workspace", "panel", "show", "hide"],
          icon: PanelLeftCloseIcon,
          onSelect: () => {
            const state = useSessionStore.getState();
            state.setWorkspaceSidebar({ collapsed: !state.workspaceCollapsed });
          },
        }] : []),
        {
          id: "toggle-presenter-view",
          label: "Toggle Presenter View",
          description: isPresenterView ? "Return to GM View" : "Switch to Presenter View",
          keywords: ["presentation", "gm", "view", "mode"],
          icon: MonitorIcon,
          onSelect: onTogglePresenterView,
        },
        {
          id: "create-workspace",
          label: "Create new workspace",
          description: "Open an empty workspace tab",
          keywords: ["tab", "new", "workspace"],
          icon: LayoutTemplateIcon,
          onSelect: appCommands.createWorkspace,
        },
        {
          id: "new-campaign",
          label: "New campaign",
          description: "Create a campaign",
          keywords: ["file", "campaign", "create"],
          icon: FilePlus2Icon,
          onSelect: appCommands.newCampaign,
        },
        {
          id: "open-campaign",
          label: "Open campaign",
          description: "Choose a campaign to open",
          keywords: ["file", "load"],
          icon: FolderOpenIcon,
          onSelect: () => { void appCommands.openCampaign(); },
        },
        {
          id: "save-campaign",
          label: "Save campaign",
          description: "Save changes to the current campaign",
          keywords: ["file", "write", "persist"],
          icon: SaveIcon,
          onSelect: () => { void appCommands.saveCampaign(); },
        },
        {
          id: "save-campaign-as",
          label: "Save campaign as…",
          description: "Save a copy to another location",
          keywords: ["file", "copy", "duplicate", "export"],
          icon: SaveIcon,
          onSelect: () => { void appCommands.saveCampaignAs(); },
        },
        {
          id: "create-npc",
          label: "Create new NPC",
          description: "Add a character to this campaign",
          keywords: ["character", "person", "npc", "new"],
          icon: UserPlusIcon,
          onSelect: appCommands.createNpc,
        },
        ...(!isPresenterView ? [
          { id: "locations", label: "Browse locations", description: "Open the location tree", keywords: ["places", "world"], icon: MapPinIcon, onSelect: () => appCommands.selectSection("Locations") },
          { id: "maps", label: "Browse maps", description: "Show saved maps in the sidebar", keywords: ["atlas", "world"], icon: MapIcon, onSelect: () => appCommands.selectSection("Maps") },
          { id: "inventory", label: "Open party inventory", description: "Gold, carried items, and materials", keywords: ["gold", "items", "materials", "holdings"], icon: BackpackIcon, onSelect: () => { appCommands.selectSection("Inventory"); appCommands.openInventory(); } },
        ] : []),
        {
          id: "create-map",
          label: "Add map",
          description: "Import map artwork into this campaign",
          keywords: ["location", "world", "atlas"],
          icon: MapIcon,
          onSelect: appCommands.createMap,
        },
        {
          id: "settings",
          label: "Open settings",
          description: "Change appearance and app preferences",
          keywords: ["preferences", "appearance", "theme", "dark", "light"],
          icon: SettingsIcon,
          onSelect: appCommands.openSettings,
        },
        {
          id: "shortcuts",
          label: "Keyboard shortcuts",
          description: "Show available keyboard shortcuts",
          keywords: ["help", "keys", "hotkeys"],
          icon: CircleHelpIcon,
          onSelect: appCommands.openShortcuts,
        },
        ...(canGoBack ? [{
          id: "go-back",
          label: "Go back",
          description: "Return to the previous location",
          keywords: ["history", "previous", "back"],
          icon: ArrowLeftIcon,
          onSelect: appCommands.goBack,
        }] : []),
        ...(canGoForward ? [{
          id: "go-forward",
          label: "Go forward",
          description: "Move to the next location",
          keywords: ["history", "next", "forward"],
          icon: ArrowRightIcon,
          onSelect: appCommands.goForward,
        }] : []),
        {
          id: "close-tab",
          label: "Close active tab",
          description: "Close the current view tab",
          keywords: ["workspace", "remove", "tab"],
          icon: PanelTopCloseIcon,
          onSelect: onCloseActiveTab,
        },
      ],
    },
    ...(!isPresenterView ? [{
      value: "Maps",
      items: (maps ?? []).map((map) => ({ id: `map:${map.id}`, label: map.name,
        description: `${map.kind} map`, keywords: ["map", "atlas", ...map.locationIds.map((id) => locations.find((place) => place.id === id)?.name ?? "")],
        icon: MapIcon, onSelect: () => { appCommands.selectSection("Maps"); appCommands.openMap(map.id); } })),
    }] : []),
    {
      value: "Characters",
      items: ids.map((id, index) => ({
        id,
        label: names[index],
        description: "Open character tab",
        keywords: ["character", "npc", "person"],
        icon: UserRoundIcon,
        onSelect: () => appCommands.openCharacter(id),
      })),
    },
    ...(!isPresenterView ? [{
      value: "Locations",
      items: locations.map((location) => {
        const ancestors = locationAncestors(locations, location.id);
        const path = [...ancestors.map((ancestor) => ancestor.name), location.name].join(" / ");
        return {
          id: `location:${location.id}`,
          label: location.name,
          description: [location.locationType, path].filter(Boolean).join(" · "),
          keywords: [...ancestors.map((ancestor) => ancestor.name), ...(location.tags ?? []), location.locationType ?? "", location.publicDescription].filter(Boolean),
          icon: MapPinIcon,
          onSelect: () => {
            appCommands.selectSection("Locations");
            appCommands.openLocation(location.id);
          },
        };
      }),
    }] : []),
    ...(!isPresenterView ? [{
      value: "Items",
      items: [{ id: "items:catalog", label: "Item catalog", description: "Browse or create items", keywords: ["items", "equipment"], icon: PackageIcon,
        onSelect: () => { appCommands.selectSection("Items"); appCommands.openItems(); } },
        ...(items ?? []).map((item) => ({ id: `item:${item.id}`, label: item.name, description: "Open item", keywords: ["item", "equipment"], icon: PackageIcon,
          onSelect: () => { appCommands.selectSection("Items"); appCommands.openItem(item.id); } })),
      ],
    }] : []),
    ...(!isPresenterView ? [{
      value: "Story Threads",
      items: [{ id: "threads:directory", label: "All story threads", description: "Browse or create a story thread", keywords: ["thread", "story"], icon: BookOpenIcon, onSelect: () => { appCommands.selectSection("Story Threads"); appCommands.openThreads(); } },
        ...threads.map((thread) => ({ id: `thread:${thread.id}`, label: thread.title, description: thread.origin || "Open story thread", keywords: ["thread", "story", thread.origin], icon: BookOpenIcon,
          onSelect: () => { appCommands.selectSection("Story Threads"); appCommands.openThread(thread.id); } })),
      ],
    }] : []),
    ...(!isPresenterView ? [{
      value: "Factions",
      items: factions.map((faction) => ({
        id: `faction:${faction.id}`,
        label: faction.name,
        description: "Open faction dossier",
        keywords: ["faction", "organization"],
        icon: FlagIcon,
        onSelect: () => {
          appCommands.selectSection("Factions");
          appCommands.openFaction(faction.id);
        },
      })),
    }] : []),
  ];

  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const selectItem = (item: PaletteItem) => {
    setQuery("");
    onOpenChange(false);
    item.onSelect();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setQuery("");
        onOpenChange(nextOpen);
      }}
    >
      <DialogPopup className="max-w-lg">
        <DialogTitle className="sr-only">Search campaign</DialogTitle>
        <DialogDescription className="sr-only">
          Search campaign actions and characters. Use the arrow keys to move, Enter to select, or Escape to close.
        </DialogDescription>
        <Autocomplete.Root
          open
          inline
          items={paletteGroups}
          value={query}
          onValueChange={setQuery}
          itemToStringValue={(item) => `${item.label} ${item.keywords.join(" ")}`}
          autoHighlight="always"
        >
          <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
            <SearchIcon className="text-muted-foreground" aria-hidden="true" />
            <Autocomplete.Input
              autoFocus
              aria-label="Search campaign and commands"
              placeholder="Search campaign…"
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Kbd>Esc</Kbd>
          </div>
          <Autocomplete.Empty className="text-center text-sm text-muted-foreground">
            <div className="px-4 py-8">
              No matching results.
            </div>
          </Autocomplete.Empty>
          <Autocomplete.List className="max-h-80 overflow-y-auto p-2">
            {(group: PaletteGroup) => (
              <Autocomplete.Group key={group.value} items={group.items} className="py-1">
                <Autocomplete.GroupLabel className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                  {group.value}
                </Autocomplete.GroupLabel>
                <Autocomplete.Collection>
                  {(item: PaletteItem) => {
                    const Icon = item.icon;
                    return (
                      <Autocomplete.Item
                        key={item.id}
                        value={item}
                        onClick={() => selectItem(item)}
                        className="flex cursor-default items-center gap-3 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                      >
                        <Icon className="shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{item.label}</span>
                          <span className="truncate text-xs text-muted-foreground">{item.description}</span>
                        </span>
                      </Autocomplete.Item>
                    );
                  }}
                </Autocomplete.Collection>
              </Autocomplete.Group>
            )}
          </Autocomplete.List>
        </Autocomplete.Root>
        <div className="flex shrink-0 items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> Open</span>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
