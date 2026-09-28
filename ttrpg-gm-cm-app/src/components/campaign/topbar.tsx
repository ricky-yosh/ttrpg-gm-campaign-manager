import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon, PlayIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { SavedLayout } from "@/App";

export function Topbar({ layouts, activeLayout, isLayoutDirty, onSelectLayout, onSaveLayoutChanges, onSaveAsNewLayout, onDeleteLayout, onSwitchWithChanges }: {
  layouts: SavedLayout[];
  activeLayout: string | null;
  isLayoutDirty: boolean;
  onSelectLayout: (name: string) => void;
  onSaveLayoutChanges: (name: string) => void;
  onSaveAsNewLayout: (name: string) => boolean;
  onDeleteLayout: (name: string) => void;
  onSwitchWithChanges: (name: string, saveCurrent: boolean) => void;
}) {
  const isMacOS = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLayoutSwitcherOpen, setIsLayoutSwitcherOpen] = useState(false);
  const [layoutQuery, setLayoutQuery] = useState("");
  const [highlightedLayout, setHighlightedLayout] = useState(0);
  const [isLayoutManagerOpen, setIsLayoutManagerOpen] = useState(false);
  const [layoutName, setLayoutName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<string | null>(null);
  const [pendingRevert, setPendingRevert] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  const openLayoutManager = () => {
    setIsLayoutSwitcherOpen(false);
    setLayoutName("");
    setLayoutError(null);
    setPendingDelete(null);
    setPendingOverwrite(null);
    setPendingRevert(null);
    setPendingSwitch(null);
    setIsLayoutManagerOpen(true);
  };

  const visibleLayouts = layouts.filter(({ name }) => name.toLocaleLowerCase().includes(layoutQuery.trim().toLocaleLowerCase()));

  const chooseLayout = (name: string) => {
    setIsLayoutSwitcherOpen(false);
    setLayoutQuery("");
    if (name === activeLayout) return;
    if (isLayoutDirty) {
      setPendingSwitch(name);
      setIsLayoutManagerOpen(true);
    } else onSelectLayout(name);
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditing = target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
      const hasPrimaryModifier = isMacOS ? event.metaKey : event.ctrlKey;
      if (
        !isEditing && !isLayoutManagerOpen && !isLayoutSwitcherOpen &&
        !event.altKey && event.shiftKey && hasPrimaryModifier && event.key.toLowerCase() === "l"
      ) {
        event.preventDefault();
        setLayoutQuery("");
        setHighlightedLayout(0);
        setIsLayoutSwitcherOpen(true);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [isMacOS, isLayoutManagerOpen, isLayoutSwitcherOpen]);

  useEffect(() => {
    if (!isTauri()) return;

    const currentWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const syncFullscreen = () => {
      void currentWindow.isFullscreen().then((fullscreen) => {
        if (!disposed) setIsFullscreen(fullscreen);
      });
    };

    syncFullscreen();
    void currentWindow.onResized(syncFullscreen).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <header
      data-tauri-drag-region="deep"
      data-macos={isMacOS && !isFullscreen ? "true" : undefined}
      className="app-topbar flex h-11 shrink-0 items-center gap-3 border-b px-3"
    >
      <div className="flex h-full shrink-0 items-center">
        <div className="macos-traffic-light-space" aria-hidden="true" data-tauri-drag-region />
        <div className="flex h-full w-12 shrink-0 items-center justify-center">
          <SidebarTrigger data-tauri-drag-region="false" title="Toggle sidebar" />
        </div>
        <div className="flex items-center gap-1">
          <Button
            data-tauri-drag-region="false"
            variant="ghost"
            size="icon-sm"
            aria-label="Back"
            aria-disabled="true"
            title="Back — coming soon"
          >
            <ArrowLeftIcon />
          </Button>
          <Button
            data-tauri-drag-region="false"
            variant="ghost"
            size="icon-sm"
            aria-label="Forward"
            aria-disabled="true"
            title="Forward — coming soon"
          >
            <ArrowRightIcon />
          </Button>
        </div>
        <div className="flex items-center" data-tauri-drag-region="false">
          <Button
            data-tauri-drag-region="false"
            variant="outline"
            size="sm"
            aria-label={`Switch layout${activeLayout ? `, current layout ${activeLayout}` : ""}${isLayoutDirty ? ", unsaved changes" : ""}`}
            title={`Switch layout (${isMacOS ? "⌘⇧L" : "Ctrl+Shift+L"}; outside text fields)`}
            onClick={() => {
              setLayoutQuery("");
              setHighlightedLayout(0);
              setIsLayoutSwitcherOpen(true);
            }}
            className="max-w-48 justify-between"
          >
            <span className="min-w-0 truncate">{activeLayout ?? "Choose layout"}{isLayoutDirty ? " •" : ""}</span>
            <ChevronDownIcon className="size-3.5 shrink-0" />
            <Kbd className="hidden xl:inline-flex">{isMacOS ? "⌘⇧L" : "Ctrl ⇧ L"}</Kbd>
          </Button>
        </div>
      </div>
      <Button
        data-tauri-drag-region="false"
        variant="outline"
        size="sm"
        className="mx-auto min-w-0 w-full max-w-80 flex-1 justify-start"
        aria-disabled="true"
        title="Search — coming soon"
      >
        <SearchIcon data-icon="inline-start" />
        <span className="min-w-0 truncate">Search campaign…</span>
        <Kbd className="ml-auto shrink-0">⌘ K</Kbd>
      </Button>
      <div className="flex h-full shrink-0 items-center justify-end">
        <Button
          data-tauri-drag-region="false"
          variant="outline"
          size="icon-sm"
          aria-label="Play presentation"
          aria-disabled="true"
          title="Play presentation — coming soon"
        >
          <PlayIcon className="size-3" />
        </Button>
      </div>
      <Dialog
        open={isLayoutSwitcherOpen}
        onOpenChange={(open) => {
          setIsLayoutSwitcherOpen(open);
          if (!open) setLayoutQuery("");
        }}
      >
        <DialogPopup>
          <div className="border-b px-5 py-4">
            <DialogTitle>Switch layout</DialogTitle>
            <DialogDescription className="mt-1">Search layouts, then choose one to open.</DialogDescription>
          </div>
          <div className="p-4">
            <Input
              autoFocus
              role="combobox"
              aria-label="Search layouts"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="layout-options"
              aria-activedescendant={visibleLayouts[highlightedLayout] ? `layout-option-${highlightedLayout}` : undefined}
              placeholder="Type a layout name…"
              value={layoutQuery}
              onChange={(event) => {
                setLayoutQuery(event.target.value);
                setHighlightedLayout(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && visibleLayouts.length) {
                  event.preventDefault();
                  setHighlightedLayout((index) => (index + 1) % visibleLayouts.length);
                } else if (event.key === "ArrowUp" && visibleLayouts.length) {
                  event.preventDefault();
                  setHighlightedLayout((index) => (index - 1 + visibleLayouts.length) % visibleLayouts.length);
                } else if (event.key === "Enter" && visibleLayouts[highlightedLayout]) {
                  event.preventDefault();
                  chooseLayout(visibleLayouts[highlightedLayout].name);
                }
              }}
            />
            <div id="layout-options" role="listbox" aria-label="Saved layouts" className="mt-3 max-h-64 space-y-1 overflow-y-auto">
              {visibleLayouts.map(({ name }, index) => (
                <Button
                  key={name}
                  id={`layout-option-${index}`}
                  type="button"
                  variant={index === highlightedLayout ? "secondary" : "ghost"}
                  role="option"
                  aria-selected={name === activeLayout}
                  tabIndex={-1}
                  onMouseEnter={() => setHighlightedLayout(index)}
                  onClick={() => chooseLayout(name)}
                  className="w-full justify-start"
                >
                  <span className="min-w-0 flex-1 truncate text-left">{name}</span>
                  {name === activeLayout && <><span className="text-xs text-muted-foreground">Current{isLayoutDirty ? " · Unsaved" : ""}</span><CheckIcon className="size-4" /></>}
                </Button>
              ))}
              {!visibleLayouts.length && <p className="px-2 py-5 text-center text-sm text-muted-foreground">{layouts.length ? "No layouts match your search." : "No saved layouts yet."}</p>}
            </div>
          </div>
          <div className="flex justify-between border-t px-4 py-3">
            <Button type="button" variant="ghost" onClick={openLayoutManager}>＋ New layout…</Button>
            <Button type="button" variant="outline" onClick={openLayoutManager}>Manage layouts</Button>
          </div>
          <p className="border-t px-5 py-2 text-xs text-muted-foreground">↑ ↓ to move · Enter to open · Esc to close</p>
        </DialogPopup>
      </Dialog>
      <Dialog
        open={isLayoutManagerOpen}
        onOpenChange={(open) => {
          setIsLayoutManagerOpen(open);
          if (!open) {
            setPendingDelete(null);
            setPendingOverwrite(null);
            setPendingRevert(null);
            setPendingSwitch(null);
          }
        }}
      >
        <DialogPopup>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = layoutName.trim();
              if (!name) return;
              setLayoutError(null);
              if (!onSaveAsNewLayout(name)) {
                setLayoutError("A layout with this name already exists. Choose another name, or save changes to the selected layout.");
                return;
              }
              setIsLayoutManagerOpen(false);
            }}
          >
            {pendingSwitch ? (
              <div className="space-y-4 p-5">
                <div>
                  <DialogTitle>Unsaved changes</DialogTitle>
                  <DialogDescription className="mt-1">
                    {activeLayout ? `Save your changes to “${activeLayout}” before switching to “${pendingSwitch}”?` : `Switch to “${pendingSwitch}” and discard the current workspace arrangement?`}
                  </DialogDescription>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button autoFocus type="button" variant="outline" onClick={() => { setPendingSwitch(null); setIsLayoutManagerOpen(false); }}>Keep editing</Button>
                  <Button type="button" variant="outline" onClick={() => { onSwitchWithChanges(pendingSwitch, false); setPendingSwitch(null); setIsLayoutManagerOpen(false); }}>Discard and switch</Button>
                  {activeLayout && <Button type="button" onClick={() => { onSwitchWithChanges(pendingSwitch, true); setPendingSwitch(null); setIsLayoutManagerOpen(false); }}>Save and switch</Button>}
                </div>
              </div>
            ) : pendingOverwrite ? (
              <div className="space-y-4 p-5">
                <div>
                  <DialogTitle>Replace “{pendingOverwrite}”?</DialogTitle>
                  <DialogDescription className="mt-1">The saved arrangement will be replaced with the current workspace.</DialogDescription>
                </div>
                <div className="flex justify-end gap-2">
                  <Button autoFocus type="button" variant="outline" onClick={() => setPendingOverwrite(null)}>Cancel</Button>
                  <Button type="button" onClick={() => { onSaveLayoutChanges(pendingOverwrite); setPendingOverwrite(null); }}>Update layout</Button>
                </div>
              </div>
            ) : pendingRevert ? (
              <div className="space-y-4 p-5">
                <div>
                  <DialogTitle>Revert to saved layout?</DialogTitle>
                  <DialogDescription className="mt-1">
                    Unsaved changes to “{pendingRevert}” will be discarded. The saved tabs, panes, and sizes will be restored.
                  </DialogDescription>
                </div>
                <div className="flex justify-end gap-2">
                  <Button autoFocus type="button" variant="outline" onClick={() => setPendingRevert(null)}>Cancel</Button>
                  <Button type="button" variant="destructive" onClick={() => { onSelectLayout(pendingRevert); setPendingRevert(null); }}>Revert to saved</Button>
                </div>
              </div>
            ) : pendingDelete ? (
              <div className="space-y-4 p-5">
                <div>
                  <DialogTitle>Delete “{pendingDelete}”?</DialogTitle>
                  <DialogDescription className="mt-1">This saved layout will be removed. This action can’t be undone.</DialogDescription>
                </div>
                <div className="flex justify-end gap-2">
                  <Button autoFocus type="button" variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      onDeleteLayout(pendingDelete);
                      setPendingDelete(null);
                    }}
                  >
                    Delete layout
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b px-5 py-4">
                  <DialogTitle>Manage layouts</DialogTitle>
                  <DialogDescription className="mt-1">Update the selected layout, save a new one, or remove a saved layout.</DialogDescription>
                </div>
                {activeLayout && <div className="flex items-center justify-between gap-3 px-5 pt-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{activeLayout}</p>
                    <p className="text-xs text-muted-foreground">{isLayoutDirty ? "Current arrangement has unsaved changes" : "Current layout is up to date"}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" disabled={!isLayoutDirty} onClick={() => setPendingRevert(activeLayout)}>Revert to saved</Button>
                    <Button type="button" variant="outline" disabled={!isLayoutDirty} onClick={() => setPendingOverwrite(activeLayout)}>Save changes</Button>
                  </div>
                </div>}
                <div className="space-y-2 px-5 py-4">
                  <label htmlFor="layout-name" className="text-sm font-medium">Save as new layout</label>
                  <div className="flex gap-2">
                    <Input
                      id="layout-name"
                      autoFocus
                      value={layoutName}
                      onChange={(event) => setLayoutName(event.target.value)}
                      placeholder="For example, Session prep"
                      maxLength={40}
                    />
                    <Button type="submit" disabled={!layoutName.trim()}>Save as new</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Press Enter to save. Duplicate names are rejected.</p>
                  {layoutError && <p role="alert" className="text-sm text-destructive">{layoutError}</p>}
                </div>
                <div className="min-h-20 border-t px-5 py-4">
                  <h3 className="mb-2 text-sm font-medium">Saved layouts</h3>
                  {layouts.length ? (
                    <ul className="space-y-1">
                      {layouts.map(({ name }) => (
                        <li key={name} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                          <span className="min-w-0 truncate">{name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete ${name} layout`}
                            title={`Delete ${name}`}
                            onClick={() => setPendingDelete(name)}
                          >
                            <Trash2Icon />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted-foreground">No saved layouts yet.</p>}
                </div>
                <div className="flex justify-end border-t px-5 py-3">
                  <Button type="button" variant="outline" onClick={() => setIsLayoutManagerOpen(false)}>Done</Button>
                </div>
              </>
            )}
          </form>
        </DialogPopup>
      </Dialog>
    </header>
  );
}
