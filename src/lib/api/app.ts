import type { AppBootstrap } from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

export function getAppBootstrap() {
  return invoke<AppBootstrap>("get_app_bootstrap");
}

export function login(handle: string) {
  return invoke("login", { handle });
}

export function logout(did: string) {
  return invoke("logout", { did });
}

export function switchAccount(did: string) {
  return invoke("switch_account", { did });
}
