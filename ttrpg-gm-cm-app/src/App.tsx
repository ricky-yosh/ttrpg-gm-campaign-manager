import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/campaign/app-sidebar";
import { Topbar } from "@/components/campaign/topbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import "./App.css";

function App() {
  const [section, setSection] = useState("Overview");

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => document.documentElement.classList.toggle("dark", preference.matches);
    syncTheme();
    preference.addEventListener("change", syncTheme);
    return () => preference.removeEventListener("change", syncTheme);
  }, []);

  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh flex-col overflow-hidden">
        <Topbar />
        <div className="flex min-h-0 flex-1">
          <AppSidebar section={section} onSelect={setSection} />
          <main aria-label={`${section} workspace`} className="flex min-w-0 flex-1 flex-col overflow-auto">
            <div className="flex h-12 shrink-0 items-center border-b px-6">
              <h1 className="text-sm font-medium">{section}</h1>
            </div>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Your workspace</EmptyTitle>
                <EmptyDescription>A place for your campaign to take shape.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </main>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default App;
