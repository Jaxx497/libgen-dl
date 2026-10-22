import type { GetState, SetState } from "./index";
import { Config, fetchConfig, findMirror, Mirror } from "../../api/data/config";
import Label from "../../labels";
import { attempt } from "../../utilities";
import { LibgenPlusAdapter } from "../../api/adapters/libgen-plus-adapter";
import { getDocument } from "../../api/data/document";
import { FALLBACK_MIRRORS, SEARCH_PAGE_SIZE } from "../../settings";
import { MirrorCheckStatus } from "./app";
import { defaultConfig, type UserConfig } from "../../user-config";

export interface IConfigState extends Config {
  mirrorAdapter: LibgenPlusAdapter | undefined;
  mirror: Mirror | undefined;
  userConfig: UserConfig;
  filter: string[];
  setUserConfig: (userConfig: UserConfig) => void;
  setFilter: (filter: string[]) => void;
  fetchConfig: () => Promise<void>;
  switchMirror: (
    onMirrorStatus: (mirror: string, status: MirrorCheckStatus) => void
  ) => Promise<boolean>;
}

export const initialConfigState: Omit<
  IConfigState,
  "fetchConfig" | "switchMirror" | "setUserConfig" | "setFilter"
> = {
  mirrorAdapter: undefined,
  mirrors: [],
  downloadMirrors: [],
  mirror: undefined,
  userConfig: defaultConfig(),
  filter: [],
};

export const createConfigStateSlice = (set: SetState, get: GetState) => ({
  ...initialConfigState,

  setUserConfig: (userConfig: UserConfig) => set({ userConfig, filter: userConfig.extensions }),
  setFilter: (filter: string[]) => set({ filter }),

  fetchConfig: async () => {
    const store = get();

    store.setIsLoading(true);
    store.setLoaderMessage(Label.FETCHING_CONFIG);

    const config = await attempt(fetchConfig);

    // The user's preferred mirror goes first, and still works if the remote list is unreachable.
    const preferred = store.userConfig.mirror;
    let remote = config?.mirrors ?? [];
    if (remote.length === 0) {
      remote = FALLBACK_MIRRORS;
    }
    const mirrors: Mirror[] = remote.filter(
      // libgen-plus is the only mirror type libgen-dl can parse
      (mirror) => mirror.type === "libgen-plus" && mirror.src !== preferred
    );
    if (preferred) {
      mirrors.unshift({ src: preferred, type: "libgen-plus" });
    }

    // Find an available mirror
    store.setLoaderMessage(Label.FINDING_MIRROR);
    // Mirrors are alternatives: one short try each, not the default five (a dead one would cost a minute).
    const mirror = await findMirror(
      mirrors,
      (failedMirror: string) => {
        store.setLoaderMessage(
          `${Label.COULDNT_REACH_TO_MIRROR}, ${failedMirror}. ${Label.FINDING_MIRROR}`
        );
      },
      { attemptCount: 1, timeoutMs: 5000 }
    );
    store.setIsLoading(false);

    if (!mirror) {
      store.setErrorMessage("Couldn't reach LibGen. Check your internet connection.");
      return;
    }

    const mirrorAdapter = new LibgenPlusAdapter(mirror.src);

    set({
      mirrors,
      downloadMirrors: config?.downloadMirrors ?? [],
      mirror,
      mirrorAdapter,
    });
  },

  switchMirror: async (
    onMirrorStatus: (mirror: string, status: MirrorCheckStatus) => void
  ): Promise<boolean> => {
    const store = get();
    const currentMirrorSource = store.mirror?.src;
    const otherMirrors = store.mirrors.filter((m) => m.src !== currentMirrorSource);

    if (otherMirrors.length === 0) {
      return false;
    }

    for (const mirror of otherMirrors) {
      onMirrorStatus(mirror.src, "checking");

      try {
        const adapter = new LibgenPlusAdapter(mirror.src);
        const testURL = adapter.getSearchURL("test", 1, SEARCH_PAGE_SIZE);
        const result = await attempt((signal) => getDocument(testURL, signal));
        if (!result) {
          onMirrorStatus(mirror.src, "failed");
          continue;
        }
        const connectionError = adapter.detectConnectionError(result);

        if (connectionError) {
          onMirrorStatus(mirror.src, "failed");
          continue;
        }

        // Mirror works — switch to it
        onMirrorStatus(mirror.src, "ok");
        set({ mirror, mirrorAdapter: adapter });
        get().resetEntryCacheMap();
        return true;
      } catch {
        onMirrorStatus(mirror.src, "failed");
      }
    }

    return false;
  },
});
