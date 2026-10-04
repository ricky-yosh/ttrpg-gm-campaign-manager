import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

type PresentationStatus = "stopped" | "live" | "paused";

export function PlayerPresentationWindow() {
  const [status, setStatus] = useState<PresentationStatus>("stopped");

  useEffect(() => {
    let disposed = false;
    let unlistenStatus: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    const currentWindow = getCurrentWebviewWindow();

    void Promise.all([
      listen<PresentationStatus>("presentation-state-changed", ({ payload }) => setStatus(payload)),
      currentWindow.onCloseRequested(async () => { await emit("presentation-player-closed"); }),
    ]).then(([statusUnlisten, closeUnlisten]) => {
      if (disposed) {
        statusUnlisten();
        closeUnlisten();
      } else {
        unlistenStatus = statusUnlisten;
        unlistenClose = closeUnlisten;
        // Ask the GM window for current state after the status listener is ready.
        void emit("presentation-player-ready");
      }
    });

    return () => {
      disposed = true;
      unlistenStatus?.();
      unlistenClose?.();
    };
  }, []);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-8 text-foreground">
      <section className="flex w-full max-w-5xl flex-col items-center justify-center gap-4 text-center" aria-live="polite">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Player presentation</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {status === "live" ? "Presentation is live" : status === "paused" ? "Presentation paused" : "Ready for the next scene"}
        </h1>
        <p className="max-w-lg text-muted-foreground">
          {status === "live"
            ? "Player-facing content will appear here."
            : status === "paused"
              ? "The current player view is being held while the GM prepares."
              : "This read-only display is waiting for the GM to start presenting."}
        </p>
      </section>
    </main>
  );
}
