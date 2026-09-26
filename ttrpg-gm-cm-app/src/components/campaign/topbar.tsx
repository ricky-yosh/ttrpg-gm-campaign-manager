import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PlayIcon, SearchIcon } from "lucide-react";
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
      className="app-topbar grid h-11 shrink-0 grid-cols-[1fr_minmax(0,24rem)_1fr] items-center gap-3 border-b px-3"
    >
      <div data-tauri-drag-region className="flex h-full items-center">
        <div className="macos-traffic-light-space" aria-hidden="true" data-tauri-drag-region />
        <div className="sidebar-trigger-slot flex h-full w-12 shrink-0 items-center justify-center">
          <SidebarTrigger title="Toggle sidebar" />
        </div>
      </div>
      <Button variant="outline" className="w-full justify-start" aria-disabled="true" title="Search — coming soon">
        <SearchIcon data-icon="inline-start" />
        <span className="truncate">Search campaign…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">⌘ K</Kbd>
      </Button>
      <div data-tauri-drag-region className="flex h-full items-center justify-end">
        <Button size="icon" aria-label="Play presentation" aria-disabled="true" title="Play presentation — coming soon">
          <PlayIcon data-icon="inline-start" />
        </Button>
      </div>
    </header>
  );
}
