import { CONFIGURATION_URL } from "../../settings";
import { attempt } from "../../utilities";
import type { AttemptOptions } from "../../utilities";
import { fetchLibgen } from "./request";

export type MirrorType = "libgen-plus" | "libgen-spa";

export interface Mirror {
  src: string;
  type: MirrorType;
}

export interface Config {
  mirrors: Mirror[];
  // SPA mirrors that only serve downloads (tried after every libgen mirror)
  downloadMirrors: Mirror[];
}

export async function fetchConfig(signal: AbortSignal): Promise<Config> {
  try {
    const response = await fetch(CONFIGURATION_URL, { signal });
    const json = await response.json();
    const config = json as Record<string, unknown>;

    return {
      mirrors: (config["mirrors"] as Mirror[]) || [],
      downloadMirrors: ((config["download_mirrors"] as Mirror[]) || []).filter(
        (mirror) => mirror.type === "libgen-spa" && URL.canParse(mirror.src)
      ),
    };
  } catch {
    throw new Error("Error occurred while fetching configuration.");
  }
}

export async function findMirror(
  mirrors: Mirror[],
  onMirrorFail: (failedMirror: string) => void,
  attemptOptions?: AttemptOptions
): Promise<Mirror | undefined> {
  for (const mirror of mirrors) {
    const response = await attempt((signal) => fetchLibgen(mirror.src, signal), attemptOptions);
    if (response) {
      return mirror;
    }

    onMirrorFail(mirror.src);
  }
  return undefined;
}
