import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { leaveCampaign, listenForCampaignOpens, saveCampaign, setUnsavedChoiceHandler, updateCampaign, useCampaign, type LeaveIntent, type UnsavedChoice } from "@/lib/campaign-data";
import { useEffect, useRef, useState } from "react";
import { AppSidebar } from "@/components/campaign/app-sidebar";
import { SettingsPanel, type AppearanceMode } from "@/components/campaign/settings-panel";
import { Workspaces, type NavigationState, type WorkspaceHandle } from "@/components/campaign/workspaces";
import { Topbar } from "@/components/campaign/topbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./App.css";
import "dockview-react/dist/styles/dockview.css";

const APPEARANCE_STORAGE_KEY = "ttrpg-gm-cm-appearance";

function readAppearance(): AppearanceMode {
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Continue with the system preference when local storage is unavailable.
  }
  return "system";
}

function App() {
  const { campaign, generation, revision, savedRevision, path, isLeaving } = useCampaign();
  const section = campaign.section;
  const setSection = (section: string | null) => updateCampaign({ section });
  const [npcOpen, setNpcOpen] = useState(false);
  const [leaveIntent, setLeaveIntent] = useState<LeaveIntent | null>(null);
  const choiceResolver = useRef<((choice: UnsavedChoice) => void) | null>(null);
  const resolveChoice = (choice: UnsavedChoice) => {
    choiceResolver.current?.(choice);
    choiceResolver.current = null;
    setLeaveIntent(null);
  };
  useEffect(() => {
    const stop = setUnsavedChoiceHandler((intent) => new Promise((resolve) => {
      choiceResolver.current = resolve;
      setLeaveIntent(intent);
    }));
    return () => { stop(); choiceResolver.current?.("cancel"); choiceResolver.current = null; };
  }, []);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void listenForCampaignOpens().then((unlisten) => {
      if (disposed) unlisten();
      else stop = unlisten;
    });
    return () => { disposed = true; stop?.(); };
  }, []);
  useEffect(() => {
    if (isLeaving || !path || revision === savedRevision) return;
    const timeout = window.setTimeout(() => { void saveCampaign(false); }, 750);
    return () => window.clearTimeout(timeout);
  }, [path, revision, savedRevision, isLeaving]);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    let closing = false;
    const currentWindow = getCurrentWindow();
    void currentWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      if (closing) return;
      closing = true;
      await leaveCampaign("close", () => currentWindow.destroy());
      closing = false;
    }).then((unlisten) => { if (disposed) unlisten(); else stop = unlisten; });
    return () => { disposed = true; stop?.(); };
  }, []);
  const [appearance, setAppearance] = useState<AppearanceMode>(readAppearance);
  const [isDark, setIsDark] = useState(() => appearance === "dark" || (appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [navigation, setNavigation] = useState<NavigationState>({ canGoBack: false, canGoForward: false });
  const workspaces = useRef<WorkspaceHandle>(null);
  const openCharacter = (name: string) => workspaces.current?.openCharacter(name);
  const openMap = () => workspaces.current?.openMap();

  useEffect(() => {
    const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      const dark = appearance === "system" ? systemPreference.matches : appearance === "dark";
      setIsDark(dark);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    syncTheme();
    systemPreference.addEventListener("change", syncTheme);
    return () => systemPreference.removeEventListener("change", syncTheme);
  }, [appearance]);

  const updateAppearance = (nextAppearance: AppearanceMode) => {
    setAppearance(nextAppearance);
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, nextAppearance);
    } catch {
      // The current session still follows the selected appearance.
    }
  };

  useEffect(() => {
    const handleCloseTabShortcut = (event: KeyboardEvent) => {
      const isMacOS = /Mac|iPhone|iPad/.test(navigator.platform);
      const hasPrimaryModifier = isMacOS ? event.metaKey : event.ctrlKey;
      if (!hasPrimaryModifier || event.altKey || event.shiftKey || event.key.toLowerCase() !== "w") return;

      event.preventDefault();
      event.stopPropagation();
      workspaces.current?.closeActiveTab();
    };

    document.addEventListener("keydown", handleCloseTabShortcut, true);
    return () => document.removeEventListener("keydown", handleCloseTabShortcut, true);
  }, []);

  useEffect(() => {
    const clearTabDragging = () => {
      delete document.documentElement.dataset.tabDragging;
    };
    const startTabDragging = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element) || !event.target.closest(".campaign-dockview .dv-tab")) return;
      document.documentElement.dataset.tabDragging = "true";
    };

    document.addEventListener("pointerdown", startTabDragging, true);
    window.addEventListener("pointerup", clearTabDragging, true);
    window.addEventListener("pointercancel", clearTabDragging, true);
    window.addEventListener("blur", clearTabDragging);
    return () => {
      document.removeEventListener("pointerdown", startTabDragging, true);
      window.removeEventListener("pointerup", clearTabDragging, true);
      window.removeEventListener("pointercancel", clearTabDragging, true);
      window.removeEventListener("blur", clearTabDragging);
      clearTabDragging();
    };
  }, []);

  return (
    <TooltipProvider>
      <SidebarProvider key={generation} defaultOpen={campaign.sidebar.open} inert={isLeaving} className="h-svh flex-col overflow-hidden">
        <Topbar
          canGoBack={navigation.canGoBack}
          canGoForward={navigation.canGoForward}
          onGoBack={() => workspaces.current?.goBack()}
          onGoForward={() => workspaces.current?.goForward()}
          isCommandPaletteOpen={isCommandPaletteOpen}
          onCommandPaletteOpenChange={setIsCommandPaletteOpen}
          onCreateWorkspace={() => workspaces.current?.createWorkspace()}
          onOpenCharacter={openCharacter}
          onOpenSettings={() => setSection("Settings")}
          onOpenMap={openMap}
          onCloseActiveTab={() => workspaces.current?.closeActiveTab()}
          npcOpen={npcOpen}
          onNpcOpenChange={setNpcOpen}
        />
        <div className="flex min-h-0 flex-1">
          <AppSidebar onCreateNpc={() => setNpcOpen(true)} section={section} onSelectSection={setSection} onOpenCharacter={openCharacter} onOpenMap={openMap} />
          <main aria-label="Campaign workspace" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {section === "Settings" && (
              <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                <SettingsPanel appearance={appearance} onAppearanceChange={updateAppearance} />
              </div>
            )}
            <div className="absolute inset-0 flex" aria-hidden={section === "Settings"} inert={section === "Settings"}>
              <Workspaces key={generation} ref={workspaces} isDark={isDark} onSearch={() => setIsCommandPaletteOpen(true)} onNavigationChange={setNavigation} />
            </div>
          </main>
        </div>
      </SidebarProvider>
      <Dialog open={leaveIntent !== null} onOpenChange={(open) => { if (!open) resolveChoice("cancel"); }}>
        <DialogPopup>
          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-2">
              <DialogTitle>Save {campaign.name} before {leaveIntent === "close" ? "closing" : "switching campaigns"}?</DialogTitle>
              <DialogDescription>
                {path ? "Changes since the last save will be lost if you don’t save. Previously saved data will remain on disk."
                  : "This campaign has not been saved. If you don’t save, it will be discarded without creating a campaign file."}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => resolveChoice("cancel")}>Cancel</Button>
              <Button variant="outline" onClick={() => resolveChoice("discard")}>
                {leaveIntent === "close" ? "Close without saving" : "Don’t save"}
              </Button>
              <Button onClick={() => resolveChoice("save")}>{leaveIntent === "close" ? "Save and close" : "Save and continue"}</Button>
            </div>
          </div>
        </DialogPopup>
      </Dialog>
    </TooltipProvider>
  );
}

export default App;
