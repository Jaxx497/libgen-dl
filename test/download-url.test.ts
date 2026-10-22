import { afterEach, describe, expect, it, vi } from "vitest";
import { findDownloadUrl, md5Of } from "../src/api/data/download-url";

const MD5 = "0123456789abcdef0123456789abcdef";
const libgen = (host: string) => ({ src: `https://${host}/`, type: "libgen-plus" as const });
const spa = { src: "https://spa.example/", type: "libgen-spa" as const };
const signal = () => new AbortController().signal;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("findDownloadUrl", () => {
  it("falls over from a dead libgen mirror to the next, current mirror first", async () => {
    const requested: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.startsWith("https://dead.example/")) {
        return new Response("down", { status: 503 });
      }
      return new Response(
        '<table id="main"><tr><td>x</td><td><a href="/get.php?md5=1">GET</a></td></tr></table>'
      );
    });

    const url = await findDownloadUrl(
      MD5,
      { mirror: libgen("dead.example"), mirrors: [libgen("ok.example")], downloadMirrors: [] },
      signal()
    );

    expect(url).toBe("https://ok.example/get.php?md5=1");
    expect(requested[0]).toContain("https://dead.example/ads.php");
  });

  it("uses an SPA download mirror when every libgen mirror fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/download/links-by-id") {
        return Response.json({
          isError: false,
          result: { links: ["https://cdn.example/x?l=tok"] },
        });
      }
      if (url.pathname === "/api/decrypt" && init?.method === "POST") {
        return Response.json({ downloadLink: "/file/book.epub" });
      }
      return new Response("down", { status: 500 });
    });

    const url = await findDownloadUrl(
      MD5,
      { mirrors: [libgen("dead.example")], downloadMirrors: [spa] },
      signal()
    );

    expect(url).toBe("https://cdn.example/file/book.epub");
  });

  it("names every source in the error when none can serve the book", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("down", { status: 503 }));

    await expect(
      findDownloadUrl(MD5, { mirrors: [libgen("a.example")], downloadMirrors: [spa] }, signal())
    ).rejects.toThrow(/a\.example.*spa\.example/);
  });
});

describe("md5Of", () => {
  it("reads the md5 from an entry's mirror link, or passes an md5 through", () => {
    expect(md5Of(`/ads.php?md5=${MD5}`)).toBe(MD5);
    expect(md5Of(MD5)).toBe(MD5);
  });
});
