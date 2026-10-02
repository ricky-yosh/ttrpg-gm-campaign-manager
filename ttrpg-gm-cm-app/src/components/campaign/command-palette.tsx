import { useEffect, useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { LayoutTemplateIcon, SearchIcon, UserRoundIcon, type LucideIcon } from "lucide-react";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useCampaign } from "@/lib/campaign-data";

type PaletteItem = {
  id: string;
  kind: "create-workspace" | "character";
  label: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
};

type PaletteGroup = {
  value: string;
  items: PaletteItem[];
};

export function CommandPalette({
  open,
  onOpenChange,
  onCreateWorkspace,
  onOpenCharacter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateWorkspace: () => void;
  onOpenCharacter: (name: string) => void;
}) {
  const { campaign } = useCampaign();
  const paletteGroups: PaletteGroup[] = [
    {
      value: "Actions",
      items: [
        {
          id: "create-workspace",
          kind: "create-workspace",
          label: "Create new workspace",
          description: "Open an empty workspace tab",
          keywords: ["tab", "new", "workspace"],
          icon: LayoutTemplateIcon,
        },
      ],
    },
    {
      value: "Characters",
      items: campaign.npcs.map(({ id, name }) => ({
        id,
        kind: "character",
        label: name,
        description: "Open character tab",
        keywords: ["character", "npc", "person"],
        icon: UserRoundIcon,
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
    if (item.kind === "create-workspace") onCreateWorkspace();
    else onOpenCharacter(item.id);
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
