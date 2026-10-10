import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PlayerPresentationWindow } from "./components/campaign/player-presentation-window";
import { installNativeMenu } from "@/lib/native-menu";

const isPlayerWindow = new URLSearchParams(window.location.search).get("window") === "player";
if (!isPlayerWindow) {
  void installNativeMenu().catch((error: unknown) => console.error("Could not install native application menu", error));
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPlayerWindow
      ? <PlayerPresentationWindow />
      : <App />}
  </React.StrictMode>,
);
