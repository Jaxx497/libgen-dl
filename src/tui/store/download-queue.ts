import type { GetState, SetState } from "./index";
import { Entry } from "../../api/models/entry";
import { DownloadStatus } from "../../download-status";
import { findDownloadUrl, md5Of } from "../../api/data/download-url";
import { saveFromUrl } from "../../api/data/download";
import { DOWNLOAD_CONNECT_TIMEOUT_MS } from "../../settings";

export interface IDownloadProgress {
  filename: string;
  total: number;
  progress: number | undefined;
  status: DownloadStatus;
  error?: string;
}

export interface IDownloadQueueState {
  downloadQueue: Entry[];
  inDownloadQueueEntryIds: string[];
  downloadProgressMap: Record<string, IDownloadProgress>;
  // every Entry downloaded this session, in the order shown in the Downloads panel
  downloads: Entry[];
  isQueueActive: boolean;

  pushDownloadQueue: (entry: Entry) => void;
  consumeDownloadQueue: () => Entry | undefined;
  removeEntryIdFromDownloadQueue: (entryId: string) => void;
  iterateQueue: () => Promise<void>;
  updateCurrentDownloadProgress: (
    entryId: string,
    downloadProgress: Partial<IDownloadProgress>
  ) => void;
  addDownloadProgress: (entryId: string, bytes: number) => void;
  stopDownload: (entryId: string) => void;
  clearFinishedDownloads: () => void;
}

export const initialDownloadQueueState = {
  downloadQueue: [],
  inDownloadQueueEntryIds: [],
  downloadProgressMap: {},
  downloads: [],
  isQueueActive: false,
};

// The running download's stop handle. One at a time: the queue is serial.
let activeDownload: { id: string; controller: AbortController } | undefined;

export const createDownloadQueueStateSlice = (set: SetState, get: GetState) => ({
  ...initialDownloadQueueState,

  pushDownloadQueue: (entry: Entry) => {
    const store = get();

    if (store.inDownloadQueueEntryIds.includes(entry.id)) {
      return;
    }

    set({
      downloadQueue: [...store.downloadQueue, entry],
      inDownloadQueueEntryIds: [...store.inDownloadQueueEntryIds, entry.id],
      downloads: [...store.downloads.filter((download) => download.id !== entry.id), entry],
    });

    store.updateCurrentDownloadProgress(entry.id, {
      filename: "",
      progress: 0,
      total: 0,
      status: DownloadStatus.IN_QUEUE,
    });

    if (store.isQueueActive) {
      return;
    }

    store.iterateQueue();
  },

  consumeDownloadQueue: () => {
    const store = get();

    if (store.downloadQueue.length === 0) {
      return;
    }

    const entry = store.downloadQueue[0];

    set({
      downloadQueue: store.downloadQueue.slice(1),
    });

    return entry;
  },

  removeEntryIdFromDownloadQueue: (entryId: string) => {
    const store = get();
    set({
      inDownloadQueueEntryIds: store.inDownloadQueueEntryIds.filter((id) => id !== entryId),
    });
  },

  iterateQueue: async () => {
    const store = get();

    set({ isQueueActive: true });

    for (;;) {
      const entry = store.consumeDownloadQueue();
      if (!entry) {
        break;
      }

      const controller = new AbortController();
      activeDownload = { id: entry.id, controller };
      let timedOut = false;
      let connectTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        store.updateCurrentDownloadProgress(entry.id, {
          status: DownloadStatus.CONNECTING_TO_LIBGEN,
        });

        // read per download: the mirror may have been switched meanwhile
        const downloadUrl = await findDownloadUrl(md5Of(entry.mirror), get(), controller.signal);

        // only the file connection is timed: the lookup tries each mirror under its own timeout
        connectTimeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, DOWNLOAD_CONNECT_TIMEOUT_MS);
        store.updateCurrentDownloadProgress(entry.id, {
          status: DownloadStatus.DOWNLOADING,
        });

        await saveFromUrl({
          url: downloadUrl,
          directory: get().userConfig.downloadDir,
          filename: `${entry.title}.${entry.extension}`,
          onStart: (filename, total) => {
            store.updateCurrentDownloadProgress(entry.id, { filename, progress: 0, total });
          },
          onProgress: (bytes) => {
            clearTimeout(connectTimeout);
            store.addDownloadProgress(entry.id, bytes);
          },
          signal: controller.signal,
        });

        store.updateCurrentDownloadProgress(entry.id, {
          status: DownloadStatus.DOWNLOADED,
        });
      } catch (error) {
        if (controller.signal.aborted && !timedOut) {
          // stopped by the user: back to a plain result, as if it was never queued
          forget(set, entry.id);
          continue;
        }
        let message = (error as Error).message;
        if (timedOut) {
          message = `Nothing received within ${DOWNLOAD_CONNECT_TIMEOUT_MS / 1000} seconds`;
        }
        store.setWarningMessage(message);
        store.updateCurrentDownloadProgress(entry.id, {
          status: DownloadStatus.FAILED,
          error: message,
        });
      } finally {
        clearTimeout(connectTimeout);
        activeDownload = undefined;
        store.removeEntryIdFromDownloadQueue(entry.id);
      }
    }

    set({ isQueueActive: false });
  },

  updateCurrentDownloadProgress: (
    entryId: string,
    downloadProgress: Partial<IDownloadProgress>
  ) => {
    set((previous) => ({
      downloadProgressMap: {
        ...previous.downloadProgressMap,
        [entryId]: { ...previous.downloadProgressMap[entryId], ...downloadProgress },
      },
    }));
  },

  addDownloadProgress: (entryId: string, bytes: number) => {
    set((previous) => {
      const current = previous.downloadProgressMap[entryId];
      return {
        downloadProgressMap: {
          ...previous.downloadProgressMap,
          [entryId]: { ...current, progress: (current?.progress || 0) + bytes },
        },
      };
    });
  },

  // Stops the running download, or drops a waiting one.
  stopDownload: (entryId: string) => {
    if (activeDownload?.id === entryId) {
      activeDownload.controller.abort();
      return;
    }

    const store = get();
    if (!store.downloadQueue.some((entry) => entry.id === entryId)) {
      return;
    }
    set({
      downloadQueue: store.downloadQueue.filter((entry) => entry.id !== entryId),
      inDownloadQueueEntryIds: store.inDownloadQueueEntryIds.filter((id) => id !== entryId),
    });
    forget(set, entryId);
  },

  // Drops finished and failed downloads from the panel; the results table keeps its ✓ / ✗.
  clearFinishedDownloads: () => {
    const store = get();
    set({
      downloads: store.downloads.filter((entry) =>
        store.inDownloadQueueEntryIds.includes(entry.id)
      ),
    });
  },
});

const forget = (set: SetState, entryId: string) => {
  set((previous) => {
    const downloadProgressMap = { ...previous.downloadProgressMap };
    delete downloadProgressMap[entryId];
    return {
      downloadProgressMap,
      downloads: previous.downloads.filter((entry) => entry.id !== entryId),
    };
  });
};
