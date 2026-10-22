import { Entry } from "../models/entry";
import { clearText } from "../../utilities";

export class LibgenPlusAdapter {
  baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  parseEntries(document: Document): Entry[] {
    const entries: Entry[] = [];
    const containerTable = document.querySelector<HTMLTableElement>("#tablelibgen > tbody");

    // no table: no results
    if (!containerTable) {
      return [];
    }

    const entryElements = containerTable.children;

    for (const element of entryElements) {
      const authors = clearText(element.children[1]?.textContent || "")
        .split(";")
        .map((author) => author.trim())
        .join(", ");
      const titleSectionContent = [...element.children[0].children]
        .filter((child) => child.nodeName !== "NOBR")
        .map((element) => element.textContent?.trim())
        .filter(Boolean)
        .join(" / ");
      const title = clearText(titleSectionContent || "");
      const publisher = clearText(element.children[2]?.textContent || "");
      const year = clearText(element.children[3]?.textContent || "");
      const pages = clearText(element.children[5]?.textContent || "");
      const language = clearText(element.children[4]?.textContent || "");
      const size = clearText(element.children[6]?.textContent || "");
      const extension = clearText(element.children[7]?.textContent || "");
      // The cell can hold file links or other hosts before the libgen page; the page (carrying
      // the md5) is what a download starts from.
      const hrefs = [...(element.children[8]?.getElementsByTagName("a") ?? [])].map(
        (anchor) => anchor.getAttribute("href") || ""
      );
      const mirror = hrefs.find((href) => this.isLibgenPageLink(href)) ?? hrefs[0] ?? "";
      // The file's md5 is stable across re-parses (the download state is keyed by it).
      const id = /md5=([\da-f]{32})/i.exec(mirror)?.[1] ?? mirror;
      entries.push({
        id,
        authors,
        title,
        publisher,
        year,
        pages,
        language,
        size,
        extension,
        mirror,
      });
    }

    return entries;
  }

  private isLibgenPageLink(href: string): boolean {
    const url = URL.parse(href, this.baseURL);
    return url?.host === new URL(this.baseURL).host && Boolean(url.searchParams.get("md5"));
  }

  getPageURL(pathname: string): string {
    const url = new URL(pathname, this.baseURL);
    return url.toString();
  }

  getSearchURL(query: string, pageNumber: number, pageSize: number): string {
    const url = new URL("/index.php", this.baseURL);
    // libgen indexes ISBNs without hyphens, so "978-1-119-29349-1" finds nothing
    let term = query;
    const bare = query.replaceAll(/[-\s]/g, "");
    if (/^(\d{9}[\dX]|\d{13})$/i.test(bare)) {
      term = bare;
    }
    url.searchParams.set("req", term);
    url.searchParams.set("page", pageNumber.toString());
    url.searchParams.set("res", pageSize.toString());
    return url.toString();
  }

  getDetailPageURL(md5: string): string {
    const url = new URL("/ads.php", this.baseURL);
    url.searchParams.set("md5", md5);
    return url.toString();
  }

  getMainDownloadURLFromDocument(document: Document): string | undefined {
    const downloadLinkElement = document.querySelector(
      "#main > tr:first-child > td:nth-child(2) > a"
    );

    if (!downloadLinkElement) {
      return undefined;
    }

    const href = downloadLinkElement.getAttribute("href");
    return this.getPageURL(href || "");
  }

  detectConnectionError(document: Document): string | undefined {
    const alertElement = document.querySelector(".alert-danger");
    if (alertElement) {
      return alertElement.textContent?.trim() || "Unknown connection error";
    }
    return undefined;
  }
}
