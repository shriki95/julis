import { createServerFn } from "@tanstack/react-start";

const HANDLE = "julis.social";

type ImageResult = {
  mediaId: string;
  width: number;
  height: number;
};

type ScrapeResult = {
  images: ImageResult[];
  error?: string;
};

async function firecrawlSearch(query: string, limit: number) {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY is not configured");

  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firecrawlKey}`,
    },
    body: JSON.stringify({ query, limit, sources: ["images"] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl search failed [${res.status}]: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const fetchInstagramImages = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScrapeResult> => {
    try {
      const data = await firecrawlSearch(`site:instagram.com/${HANDLE}`, 30);
      const images = data?.data?.images ?? [];

      const seen = new Set<string>();
      const results: ImageResult[] = [];

      for (const img of images) {
        const candidateUrl: string | undefined = img?.imageUrl;
        if (!candidateUrl) continue;
        if (!/lookaside\.instagram\.com\/seo\/google_widget\/crawler/.test(candidateUrl)) continue;

        const m = candidateUrl.match(/media_id=(\d+)/);
        const mediaId = m?.[1];
        if (!mediaId) continue;
        if (seen.has(mediaId)) continue;
        seen.add(mediaId);

        results.push({
          mediaId,
          width: Number(img?.imageWidth) || 1080,
          height: Number(img?.imageHeight) || 1080,
        });
      }

      return { images: results.slice(0, 16) };
    } catch (error) {
      console.error("Instagram fetch failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return { images: [], error: message };
    }
  },
);
