import { useEffect, useRef, useState } from "react";
import { AppSidebar } from "@/components/campaign/app-sidebar";
import { Workspaces, type WorkspaceHandle } from "@/components/campaign/workspaces";
import { Topbar } from "@/components/campaign/topbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./App.css";
import "dockview-react/dist/styles/dockview.css";

function App() {
  const [section, setSection] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const workspaces = useRef<WorkspaceHandle>(null);
  const openCharacter = (name: string) => workspaces.current?.openCharacter(name);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      setIsDark(preference.matches);
      document.documentElement.classList.toggle("dark", preference.matches);
    };
    syncTheme();
    preference.addEventListener("change", syncTheme);
    return () => preference.removeEventListener("change", syncTheme);
  }, []);

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
      <SidebarProvider className="h-svh flex-col overflow-hidden">
        <Topbar
          isCommandPaletteOpen={isCommandPaletteOpen}
          onCommandPaletteOpenChange={setIsCommandPaletteOpen}
          onCreateWorkspace={() => workspaces.current?.createWorkspace()}
          onOpenCharacter={openCharacter}
        />
        <div className="flex min-h-0 flex-1">
          <AppSidebar section={section} onSelectSection={setSection} onOpenCharacter={openCharacter} />
          <main aria-label="Campaign workspace" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Workspaces ref={workspaces} isDark={isDark} onSearch={() => setIsCommandPaletteOpen(true)} />
          </main>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default App;
