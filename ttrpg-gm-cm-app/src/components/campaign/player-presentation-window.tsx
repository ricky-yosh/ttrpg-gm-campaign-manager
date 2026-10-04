import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { NpcPlayerCard } from "@/components/campaign/npc-player-card";
import type { PlayerPresentationContent } from "@/lib/presentation-window";

type PresentationStatus = "stopped" | "live" | "paused";

export function PlayerPresentationWindow() {
  const [status, setStatus] = useState<PresentationStatus>("stopped");
  const [content, setContent] = useState<PlayerPresentationContent>(null);
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unlistenStatus: (() => void) | undefined;
    let unlistenContent: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    const currentWindow = getCurrentWebviewWindow();

    void Promise.all([
      listen<PresentationStatus>("presentation-state-changed", ({ payload }) => setStatus(payload)),
      listen<PlayerPresentationContent>("presentation-content-changed", ({ payload }) => setContent(payload)),
      currentWindow.onCloseRequested((event) => {
        event.preventDefault();
        setCloseConfirmationOpen(true);
      }),
    ]).then(([statusUnlisten, contentUnlisten, closeUnlisten]) => {
      if (disposed) {
        statusUnlisten();
        contentUnlisten();
        closeUnlisten();
      } else {
        unlistenStatus = statusUnlisten;
        unlistenContent = contentUnlisten;
        unlistenClose = closeUnlisten;
        // Ask the GM window for current state after the status listener is ready.
        void emit("presentation-player-ready");
      }
    });

    return () => {
      disposed = true;
      unlistenStatus?.();
      unlistenContent?.();
      unlistenClose?.();
    };
  }, []);

  const stopAndClose = async () => {
    try {
      await emit("presentation-player-close-confirmed");
      setCloseConfirmationOpen(false);
    } catch (error) {
      console.error("Could not request closing the player presentation window", error);
    }
  };

  return (
    <>
      <main className="flex min-h-svh items-center justify-center overflow-auto bg-background p-8 text-foreground">
        {status !== "stopped" && content ? (
          <div className="w-full" aria-live="polite">
            <NpcPlayerCard content={content} />
          </div>
        ) : (
          <section className="flex w-full max-w-5xl flex-col items-center justify-center gap-4 text-center" aria-live="polite">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Player presentation</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {status === "live" ? "Presentation is live" : status === "paused" ? "Presentation paused" : "Ready for the next scene"}
            </h1>
            <p className="max-w-lg text-muted-foreground">
              {status === "live"
                ? "Choose an NPC in Presenter mode to display their portrait and player description."
                : status === "paused"
                  ? "The current player view is being held while the GM prepares."
                  : "This read-only display is waiting for the GM to start presenting."}
            </p>
          </section>
        )}
      </main>
      <Dialog
        open={closeConfirmationOpen}
        onOpenChange={(open) => {
          setCloseConfirmationOpen(open);
        }}
      >
        <DialogPopup>
          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-2">
              <DialogTitle>Stop the presentation and close this window?</DialogTitle>
              <DialogDescription>
                This will close the player display and stop the presentation in the GM app.
              </DialogDescription>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCloseConfirmationOpen(false)}>Keep presenting</Button>
              <Button variant="destructive" onClick={() => void stopAndClose()}>Stop and close</Button>
            </div>
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}
