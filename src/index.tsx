/* @refresh reload */
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as logger from "@tauri-apps/plugin-log";
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
    logger.debug("Failed to get window label");
  }
}
