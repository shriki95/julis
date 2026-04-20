import { createServerFn } from "@tanstack/react-start";

const INSTAGRAM_URL = "https://www.instagram.com/julis.social/";

type ScrapeResult = {
  images: string[];
  error?: string;
};

export const fetchInstagramImages = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScrapeResult> => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return { images: [], error: "FIRECRAWL_API_KEY is not configured" };
    }

    try {
      const { default: Firecrawl } = await import("@mendable/firecrawl-js");
      const firecrawl = new Firecrawl({ apiKey });

      const result = await firecrawl.scrape(INSTAGRAM_URL, {
        formats: ["html", "links"],
        onlyMainContent: false,
        waitFor: 3000,
      });

      const html: string =
        (result as { html?: string }).html ??
        (result as { data?: { html?: string } }).data?.html ??
        "";
      const links: string[] =
        (result as { links?: string[] }).links ??
        (result as { data?: { links?: string[] } }).data?.links ??
        [];

      const imageSet = new Set<string>();

      // Extract from <img src="..."> and srcset
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
      let match: RegExpExecArray | null;
      while ((match = imgRegex.exec(html)) !== null) {
        imageSet.add(match[1]);
      }

      // Also catch srcset URLs
      const srcsetRegex = /srcset=["']([^"']+)["']/gi;
      while ((match = srcsetRegex.exec(html)) !== null) {
        const parts = match[1].split(",");
        for (const part of parts) {
          const url = part.trim().split(/\s+/)[0];
          if (url) imageSet.add(url);
        }
      }

      // Extract from JSON-embedded URLs in HTML (Instagram embeds image URLs in scripts)
      const jsonImgRegex = /https?:\/\/[^"'s)]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'s)]*)?/gi;
      while ((match = jsonImgRegex.exec(html)) !== null) {
        imageSet.add(match[0]);
      }

      // Add image-like links
      for (const link of links) {
        if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(link)) {
          imageSet.add(link);
        }
      }

      // Filter: keep only Instagram CDN images, exclude profile pic placeholders/sprites
      const filtered = Array.from(imageSet).filter((url) => {
        if (!/^https?:\/\//.test(url)) return false;
        // Exclude tiny icons, sprites, and emojis
        if (/static\.cdninstagram\.com.*\/(rsrc|sprite|emoji)/i.test(url)) return false;
        if (/\/s150x150\//.test(url)) return false; // tiny avatars
        // Prefer cdninstagram or fbcdn image hosts
        return /cdninstagram\.com|fbcdn\.net/i.test(url);
      });

      // Dedupe by base path (ignore query params that vary)
      const dedupedMap = new Map<string, string>();
      for (const url of filtered) {
        const key = url.split("?")[0];
        if (!dedupedMap.has(key)) dedupedMap.set(key, url);
      }

      const images = Array.from(dedupedMap.values()).slice(0, 24);

      return { images };
    } catch (error) {
      console.error("Firecrawl scrape failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return { images: [], error: message };
    }
  },
);
