import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchConfig, findMirror } from "../src/api/data/config";
import { getDocument } from "../src/api/data/document";
import { CONFIGURATION_URL, LIBGEN_USER_AGENT } from "../src/settings";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("configuration data", () => {
  it("normalizes the remote configuration response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        latest_version: "4.0.0",
        mirrors: [{ src: "https://mirror.example/", type: "libgen-plus" }],
        download_mirrors: [
          { src: "https://spa.example/", type: "libgen-spa" },
          { src: "https://other.example/", type: "unknown" },
        ],
      })
    );
    const signal = new AbortController().signal;

    await expect(fetchConfig(signal)).resolves.toEqual({
      mirrors: [{ src: "https://mirror.example/", type: "libgen-plus" }],
      downloadMirrors: [{ src: "https://spa.example/", type: "libgen-spa" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(CONFIGURATION_URL, { signal });
  });

  it("wraps configuration transport errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(fetchConfig(new AbortController().signal)).rejects.toThrow(
      "Error occurred while fetching configuration."
    );
  });

  it("skips a mirror that answers with an HTTP error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }))
      .mockResolvedValueOnce(new Response("ok"));
    const mirrors = [
      { src: "https://down.example/", type: "libgen-plus" as const },
      { src: "https://up.example/", type: "libgen-plus" as const },
    ];

    await expect(
      findMirror(mirrors, () => {}, { attemptCount: 1, delayMs: 0, timeoutMs: 100 })
    ).resolves.toEqual(mirrors[1]);
  });

  it("selects the first reachable mirror and reports failed mirrors", async () => {
    const onMirrorFail = vi.fn(() => {});
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response("ok"));
    const mirrors = [
      { src: "https://offline.example/", type: "libgen-plus" as const },
      { src: "https://online.example/", type: "libgen-plus" as const },
    ];

    await expect(
      findMirror(mirrors, onMirrorFail, { attemptCount: 1, delayMs: 0, timeoutMs: 100 })
    ).resolves.toEqual(mirrors[1]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://offline.example/", {
      headers: { "User-Agent": LIBGEN_USER_AGENT },
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://online.example/", {
      headers: { "User-Agent": LIBGEN_USER_AGENT },
      signal: expect.any(AbortSignal),
    });
    expect(onMirrorFail).toHaveBeenCalledWith("https://offline.example/");
  });
});

describe("document data", () => {
  it("fetches HTML with the application user agent and returns a queryable document", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('<main><h1 id="title">Example Book</h1></main>'));

    const url = "https://mirror.example/book";
    const signal = new AbortController().signal;
    const result = await getDocument(url, signal);

    expect(fetchMock).toHaveBeenCalledWith(url, {
      headers: { "User-Agent": LIBGEN_USER_AGENT },
      signal,
    });
    expect(result.querySelector("#title")?.textContent).toBe("Example Book");
  });

  it("wraps document transport errors with the requested URL", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(
      getDocument("https://mirror.example/book", new AbortController().signal)
    ).rejects.toThrow("Error occurred while fetching document of https://mirror.example/book");
  });

  it("treats an HTTP error page as a failure, not as an empty page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>Service Unavailable</html>", { status: 503 })
    );

    await expect(
      getDocument("https://mirror.example/index.php", new AbortController().signal)
    ).rejects.toThrow("Error occurred while fetching document");
  });
});
