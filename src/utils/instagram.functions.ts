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

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firecrawl/v2";

async function firecrawlSearch(query: string, limit: number) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY is not configured");

  // Prefer gateway if available, fall back to direct API
  const useGateway = Boolean(lovableKey);
  const url = useGateway ? `${GATEWAY_URL}/search` : "https://api.firecrawl.dev/v2/search";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (useGateway) {
    headers["Authorization"] = `Bearer ${lovableKey}`;
    headers["X-Connection-Api-Key"] = firecrawlKey;
  } else {
    headers["Authorization"] = `Bearer ${firecrawlKey}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
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
      // Use quoted handle search — returns Instagram SEO preview images for the account's posts
      const data = await firecrawlSearch(`"${HANDLE}" instagram`, 30);
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
