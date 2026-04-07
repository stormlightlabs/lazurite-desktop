export type DownloadResult = { path: string; bytes: number };

export type DownloadProgress = {
  url: string;
  path: string;
  downloadedBytes: number;
  downloadedSegments: number;
  totalSegments: number;
  complete: boolean;
};
