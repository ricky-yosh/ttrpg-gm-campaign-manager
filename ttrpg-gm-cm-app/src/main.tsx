import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PlayerPresentationWindow } from "./components/campaign/player-presentation-window";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get("window") === "player"
      ? <PlayerPresentationWindow />
      : <App />}
  </React.StrictMode>,
);
