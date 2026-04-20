import { createServerFn } from "@tanstack/react-start";

const HANDLE = "julis.social";

type ImageResult = {
  postUrl: string;
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
        if (!/lookaside\.(instagram|fbsbx)\.com/.test(candidateUrl)) continue;
        if (/profile_pic/i.test(candidateUrl)) continue;

        // Follow the SEO crawler URL to find the underlying post URL
        let postUrl: string | null = null;
        try {
          const redirectRes = await fetch(candidateUrl, {
            method: "GET",
            redirect: "manual",
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          postUrl = redirectRes.headers.get("location");
        } catch {
          continue;
        }

        if (!postUrl || !/instagram\.com\/(p|reel)\//.test(postUrl)) continue;

        const dedupeKey = postUrl.split("?")[0];
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        results.push({
          postUrl,
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
