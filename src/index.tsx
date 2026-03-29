/* @refresh reload */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { render } from "solid-js/web";
import App from "./App";

applyInitialRoute();

render(() => <App />, document.getElementById("root") as HTMLElement);

function applyInitialRoute() {
  try {
    if (getCurrentWindow().label === "composer") {
      globalThis.history.replaceState(null, "", "#/composer");
    }
  } catch {
    // Non-Tauri environments do not expose a window label.
  }
}
