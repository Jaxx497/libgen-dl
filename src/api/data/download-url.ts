import { LibgenPlusAdapter } from "../adapters/libgen-plus-adapter";
import { attempt } from "../../utilities";
import type { Mirror } from "./config";
import { getDocument } from "./document";
import { fetchLibgen } from "./request";

// One try per source, the next source is the retry. Keep (sources x timeout) under
// DOWNLOAD_CONNECT_TIMEOUT_MS.
const SOURCE_ATTEMPTS = { attemptCount: 1, timeoutMs: 6000 };
const SPA_LINK_TOKEN_PARAMETER = "l";

async function fromLibgen(mirror: Mirror, md5: string, signal: AbortSignal): Promise<string> {
  const adapter = new LibgenPlusAdapter(mirror.src);
  const page = await getDocument(adapter.getDetailPageURL(md5), signal);
  const url = adapter.getMainDownloadURLFromDocument(page);
  if (!url) {
    throw new Error(adapter.detectConnectionError(page) ?? "no download link on the page");
  }
  return url;
}

// libgen.pw / libgen.me / ...: an API lists encrypted links, a second call decrypts one.
async function fromSpa(mirror: Mirror, md5: string, signal: AbortSignal): Promise<string> {
  const listURL = new URL("/api/download/links-by-id", mirror.src);
  listURL.searchParams.set("id", md5);
  const response = await fetchLibgen(listURL, signal);
  const list = await response.json();
  const links: string[] = list.result?.links ?? [];
  if (list.isError || links.length === 0) {
    throw new Error("not in this mirror's catalogue");
  }

  let lastError = new Error("no usable download link");
  for (const link of links) {
    try {
      const token = new URL(link).searchParams.get(SPA_LINK_TOKEN_PARAMETER);
      if (!token) {
        continue;
      }
      const decryptURL = new URL("/api/decrypt", link);
      decryptURL.searchParams.set(SPA_LINK_TOKEN_PARAMETER, token);
      const reply = await fetchLibgen(decryptURL, signal, { method: "POST" });
      const decrypted = await reply.json();
      return new URL(decrypted.downloadLink, link).toString();
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError;
}

// The direct file URL for `md5`: every libgen mirror in order, then the SPA download mirrors.
// Throws one error naming what each source said.
export async function findDownloadUrl(
  md5: string,
  state: { mirror?: Mirror; mirrors: Mirror[]; downloadMirrors: Mirror[] },
  signal: AbortSignal
): Promise<string> {
  // the mirror the user is on goes first
  const mirrors = state.mirrors.filter((mirror) => mirror.src !== state.mirror?.src);
  if (state.mirror) {
    mirrors.unshift(state.mirror);
  }
  const { downloadMirrors } = state;
  const failures: string[] = [];
  const sources = [
    ...mirrors.map((mirror) => ({ mirror, find: fromLibgen })),
    ...downloadMirrors.map((mirror) => ({ mirror, find: fromSpa })),
  ];
  for (const { mirror, find } of sources) {
    let lastError: unknown;
    const url = await attempt(
      async (attemptSignal) => {
        try {
          return await find(mirror, md5, attemptSignal);
        } catch (error) {
          lastError = error;
          throw error;
        }
      },
      { ...SOURCE_ATTEMPTS, signal }
    );
    if (url) {
      return url;
    }
    if (signal.aborted) {
      throw new Error("Stopped");
    }
    failures.push(
      `${new URL(mirror.src).host}: ${(lastError as Error | undefined)?.message ?? "timed out"}`
    );
  }
  throw new Error(`No mirror could serve ${md5} (${failures.join("; ")})`);
}

// The md5 in an Entry's mirror link (or the string itself when it's already one).
export function md5Of(link: string): string {
  return (
    URL.parse(link, "http://x")?.searchParams.get("md5") ?? /[\da-f]{32}/i.exec(link)?.[0] ?? link
  );
}
