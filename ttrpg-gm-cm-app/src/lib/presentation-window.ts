import { emit } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export type PresentationStatus = "stopped" | "live" | "paused";

export async function openPlayerPresentationWindow() {
  if (!isTauri()) return;

  const existingWindow = await WebviewWindow.getByLabel("player");
  if (existingWindow) {
    await existingWindow.show();
    await existingWindow.setFocus();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const playerWindow = new WebviewWindow("player", {
      url: "/?window=player",
      title: "Player Presentation",
      width: 1280,
      height: 800,
      center: true,
      decorations: true,
    });

    playerWindow.once("tauri://created", () => resolve());
    playerWindow.once<string>("tauri://error", (event) => reject(new Error(event.payload)));
  });
}

export async function closePlayerPresentationWindow() {
  if (!isTauri()) return;
  const playerWindow = await WebviewWindow.getByLabel("player");
  await playerWindow?.destroy();
}

export async function publishPresentationStatus(status: PresentationStatus) {
  if (isTauri()) await emit("presentation-state-changed", status);
}
