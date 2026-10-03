import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowLeftIcon, ArrowRightIcon, PlayIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/campaign/command-palette";
import { appCommands } from "@/lib/app-commands";
import { selectCanGoBack, selectCanGoForward, useSessionStore } from "@/stores/session-store";
import { CampaignControls } from "@/components/campaign/campaign-controls";

export function Topbar() {
  const canGoBack = useSessionStore(selectCanGoBack);
  const canGoForward = useSessionStore(selectCanGoForward);
  const isMacOS = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const element = target instanceof HTMLElement ? target : null;
      const isInDialog = Boolean(element?.closest('[role="dialog"]'));
      const isInRichTextEditor = Boolean(element?.closest('[contenteditable="true"]'));
      const hasPrimaryModifier = isMacOS ? event.metaKey : event.ctrlKey;

      if (
        event.repeat || isInDialog || isInRichTextEditor || event.altKey || event.shiftKey ||
        !hasPrimaryModifier || event.key.toLowerCase() !== "k"
      ) return;

      event.preventDefault();
      appCommands.openCommandPalette();
    };

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [isMacOS]);

  useEffect(() => {
    const handleSettingsShortcut = (event: KeyboardEvent) => {
      const hasPrimaryModifier = isMacOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        event.repeat || event.altKey || event.shiftKey || !hasPrimaryModifier || event.key !== "," ||
        target?.closest('[role="dialog"]')
      ) return;

      event.preventDefault();
      appCommands.openSettings();
    };

    window.addEventListener("keydown", handleSettingsShortcut);
    return () => {
      window.removeEventListener("keydown", handleSettingsShortcut);
    };
  }, [isMacOS]);

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
        <CampaignControls />
        <div className="flex h-full w-12 shrink-0 items-center justify-center">
          <SidebarTrigger data-tauri-drag-region="false" title="Toggle sidebar" />
        </div>
        <div className="flex items-center gap-1">
          <Button
            data-tauri-drag-region="false"
            variant="ghost"
            size="icon-sm"
            aria-label="Back"
            disabled={!canGoBack}
            onClick={appCommands.goBack}
            title="Back"
          >
            <ArrowLeftIcon />
          </Button>
          <Button
            data-tauri-drag-region="false"
            variant="ghost"
            size="icon-sm"
            aria-label="Forward"
            disabled={!canGoForward}
            onClick={appCommands.goForward}
            title="Forward"
          >
            <ArrowRightIcon />
          </Button>
        </div>

      </div>
      <Button
        data-tauri-drag-region="false"
        variant="outline"
        size="sm"
        className="mx-auto min-w-0 w-full max-w-80 flex-1 justify-start"
        aria-label="Search campaign"
        title={`Search campaign (${isMacOS ? "⌘K" : "Ctrl+K"})`}
        onClick={() => appCommands.openCommandPalette()}
      >
        <SearchIcon data-icon="inline-start" />
        <span className="min-w-0 truncate">Search campaign…</span>
        <Kbd className="ml-auto shrink-0">{isMacOS ? "⌘ K" : "Ctrl K"}</Kbd>
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
      <CommandPalette />
    </header>
  );
}
