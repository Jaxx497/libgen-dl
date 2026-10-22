import fs from "node:fs";
import { findDownloadUrl } from "../api/data/download-url";
import renderTUI from "../tui/index";
import { LAYOUT_KEY } from "../tui/layouts/keys";
import { useBoundStore } from "../tui/store/index";
import { applyFlags, loadUserConfig } from "../user-config";
import { SEARCH_MIN_CHAR } from "../settings";

// CLI modes need a mirror before they start (the interactive app shows its own error screen).
const connect = async (): Promise<boolean> => {
  await useBoundStore.getState().fetchConfig();
  const { mirrorAdapter, errorMessage } = useBoundStore.getState();
  if (!mirrorAdapter) {
    console.error(errorMessage ?? "Couldn't reach a mirror");
    process.exitCode = 1;
  }
  return Boolean(mirrorAdapter);
};

const downloadInCLI = (md5List: string[]) => {
  renderTUI({
    startInCLIMode: true,
    doNotFetchConfigInitially: true,
    initialLayout: LAYOUT_KEY.BULK_DOWNLOAD_LAYOUT,
  });
  useBoundStore.getState().startBulkDownloadInCLI(md5List);
};

export const operate = async (flags: Record<string, unknown>) => {
  const { config, warnings } = loadUserConfig();
  useBoundStore.getState().setUserConfig(
    applyFlags(config, {
      ext: flags.ext as string | undefined,
      language: flags.language as string | undefined,
      output: flags.output as string,
    })
  );
  if (warnings.length > 0) {
    // console for -u (no UI), the warning line for everything else
    console.error(warnings.join("\n"));
    useBoundStore.getState().setWarningMessage(warnings.join(" · "));
  }

  if (flags.search) {
    const query = flags.search as string;
    if (query.length < SEARCH_MIN_CHAR) {
      console.error(`Query must be at least ${SEARCH_MIN_CHAR} characters long`);
      process.exitCode = 1;
      return;
    }
    if (!(await connect())) {
      return;
    }

    const store = useBoundStore.getState();
    store.setSearchValue(query);
    renderTUI({
      startInCLIMode: false,
      doNotFetchConfigInitially: true,
    });
    store.handleSearchSubmit();
    return;
  }

  if (flags.bulk) {
    let data: string;
    try {
      data = await fs.promises.readFile(flags.bulk as string, "utf8");
    } catch {
      console.error(`Couldn't read ${flags.bulk as string}`);
      process.exitCode = 1;
      return;
    }
    // trim: lists saved on Windows end lines with \r
    const md5List = data
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (await connect()) {
      downloadInCLI(md5List);
    }
    return;
  }

  if (flags.download) {
    if (await connect()) {
      downloadInCLI([flags.download as string]);
    }
    return;
  }

  if (flags.url) {
    const md5 = flags.url as string;

    console.log("Fetching config...");
    if (!(await connect())) {
      return;
    }
    const store = useBoundStore.getState();

    console.log("Finding download url...");
    const downloadUrl = await findDownloadUrl(md5, store, new AbortController().signal).catch(
      (error: Error) => {
        console.error(error.message);
      }
    );
    if (!downloadUrl) {
      process.exitCode = 1;
      return;
    }

    console.log("Here is the direct download link:");
    console.log(downloadUrl);
    return;
  }

  renderTUI({
    startInCLIMode: false,
    doNotFetchConfigInitially: false,
  });
};
