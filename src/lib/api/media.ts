import { invoke } from "@tauri-apps/api/core";

export type DownloadResult = { path: string; bytes: number };

export type DownloadProgress = {
  url: string;
  path: string;
  downloadedBytes: number;
  downloadedSegments: number;
  totalSegments: number;
  complete: boolean;
};

export function getDownloadDirectory() {
  return invoke<string>("get_download_directory");
}

export function setDownloadDirectory(path: string) {
  return invoke("set_download_directory", { path });
}

export function downloadImage(url: string, filename?: string | null) {
  return invoke<DownloadResult>("download_image", { filename: filename ?? null, url });
}

export function downloadVideo(url: string, filename?: string | null) {
  return invoke<DownloadResult>("download_video", { filename: filename ?? null, url });
}
