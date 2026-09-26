import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowLeftIcon, ArrowRightIcon, PlayIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function Topbar() {
  const isMacOS = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
      data-macos={isMacOS && !isFullscreen ? "true" : undefined}
      className="app-topbar grid h-11 shrink-0 grid-cols-[1fr_minmax(0,20rem)_1fr] items-center gap-3 border-b px-3"
    >
      <div data-tauri-drag-region className="flex h-full items-center">
        <div className="macos-traffic-light-space" aria-hidden="true" data-tauri-drag-region />
        <div className="sidebar-trigger-slot flex h-full w-12 shrink-0 items-center justify-center">
          <SidebarTrigger title="Toggle sidebar" />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back"
            aria-disabled="true"
            title="Back — coming soon"
          >
            <ArrowLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Forward"
            aria-disabled="true"
            title="Forward — coming soon"
          >
            <ArrowRightIcon />
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start bg-muted/50 text-muted-foreground hover:text-foreground"
        aria-disabled="true"
        title="Search — coming soon"
      >
        <SearchIcon data-icon="inline-start" />
        <span className="truncate">Search campaign…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">⌘ K</Kbd>
      </Button>
      <div data-tauri-drag-region className="flex h-full items-center justify-end">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Play presentation"
          aria-disabled="true"
          title="Play presentation — coming soon"
        >
          <PlayIcon className="size-3" />
        </Button>
      </div>
    </header>
  );
}
