import { createServerFn } from "@tanstack/react-start";

const HANDLE = "julis.social";

type ImageResult = {
  src: string;
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

  // Firecrawl connector does NOT use the gateway — call API directly
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firecrawlKey}`,
    },
    body: JSON.stringify({
      query,
      limit,
      sources: ["images"],
    }),
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
      // site: search returns only julis.social posts (no fuzzy matches like "julius"/"jules")
      const data = await firecrawlSearch(`site:instagram.com/${HANDLE}`, 30);
      const images = data?.data?.images ?? [];

      const filtered: ImageResult[] = [];
      const seen = new Set<string>();

      for (const img of images) {
        const src: string | undefined = img?.imageUrl;
        const postUrl: string | undefined = img?.url;
        if (!src || !postUrl) continue;

        // Only keep Instagram lookaside SEO crawler images (these are public)
        if (!/lookaside\.(instagram|fbsbx)\.com/.test(src)) continue;

        // Skip profile pics
        if (/profile_pic/.test(src)) continue;

        // Strongly prefer images that came from a julis.social post — but accept others too
        // because Google may attach the same media to related URLs
        const dedupeKey = src.split("?").slice(-1)[0] || src;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        filtered.push({
          src,
          postUrl,
          width: Number(img?.imageWidth) || 1080,
          height: Number(img?.imageHeight) || 1080,
        });
      }

      // Prioritize julis.social posts, then others
      filtered.sort((a, b) => {
        const aIsJulis = a.postUrl.includes(HANDLE) ? 0 : 1;
        const bIsJulis = b.postUrl.includes(HANDLE) ? 0 : 1;
        return aIsJulis - bIsJulis;
      });

      return { images: filtered.slice(0, 20) };
    } catch (error) {
      console.error("Instagram fetch failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return { images: [], error: message };
    }
  },
);
