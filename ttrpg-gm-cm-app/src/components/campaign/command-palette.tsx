import { useShallow } from "zustand/react/shallow";
import { appCommands } from "@/lib/app-commands";
import { selectCanGoBack, selectCanGoForward, useSessionStore } from "@/stores/session-store";
import { useEffect, useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import {
  ArrowLeftIcon, ArrowRightIcon, CircleHelpIcon, FilePlus2Icon, FolderOpenIcon, LayoutTemplateIcon,
  MapIcon, PanelTopCloseIcon, SaveIcon, SearchIcon, SettingsIcon, UserPlusIcon, UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useCampaign } from "@/lib/campaign-data";

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

export function CommandPalette() {
  const open = useSessionStore((state) => state.commandPaletteOpen);
  const onOpenChange = useSessionStore((state) => state.setCommandPaletteOpen);
  const canGoBack = useSessionStore(selectCanGoBack);
  const canGoForward = useSessionStore(selectCanGoForward);
  const ids = useCampaign(useShallow((state) => state.campaign.npcs.map((npc) => npc.id)));
  const names = useCampaign(useShallow((state) => state.campaign.npcs.map((npc) => npc.name)));
  const paletteGroups: PaletteGroup[] = [
    {
      value: "Actions",
      items: [
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
        {
          id: "open-map",
          label: "Open map",
          description: "Open the map workspace",
          keywords: ["location", "world", "atlas"],
          icon: MapIcon,
          onSelect: appCommands.openMap,
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
          description: "Close the current workspace tab",
          keywords: ["workspace", "remove", "tab"],
          icon: PanelTopCloseIcon,
          onSelect: appCommands.closeActiveTab,
        },
      ],
    },
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
