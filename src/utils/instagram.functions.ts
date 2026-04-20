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

async function resolveInstagramImage(
  candidateUrl: string,
): Promise<{ src?: string; postUrl?: string } | null> {
  try {
    const redirectRes = await fetch(candidateUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const redirectedPostUrl = redirectRes.headers.get("location") || candidateUrl;
    const postRes = await fetch(redirectedPostUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!postRes.ok) return null;

    const html = await postRes.text();
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
    const urlMatch = html.match(/<meta property="og:url" content="([^"]+)"/i);
    const src = imageMatch?.[1];
    const postUrl = urlMatch?.[1] || redirectedPostUrl;

    if (!src || /profile_pic/i.test(src)) return null;
    return { src, postUrl };
  } catch {
    return null;
  }
}

export const fetchInstagramImages = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScrapeResult> => {
    try {
      // site: search returns only julis.social posts (no fuzzy matches like "julius"/"jules")
      const data = await firecrawlSearch(`site:instagram.com/${HANDLE}`, 30);
      const images = data?.data?.images ?? [];
      const candidates = images
        .map((img: { imageUrl?: string; imageWidth?: number; imageHeight?: number }) => ({
          candidateUrl: img?.imageUrl,
          width: Number(img?.imageWidth) || 1080,
          height: Number(img?.imageHeight) || 1080,
        }))
        .filter((img: { candidateUrl?: string; width: number; height: number }) => {
          return Boolean(img.candidateUrl) && /lookaside\.(instagram|fbsbx)\.com/.test(img.candidateUrl || "");
        })
        .slice(0, 12);

      const resolved = await Promise.all(
        candidates.map(async (img: { candidateUrl?: string; width: number; height: number }) => {
          const result = await resolveInstagramImage(img.candidateUrl!);
          if (!result?.src || !result.postUrl) return null;

          return {
            src: result.src,
            postUrl: result.postUrl,
            width: img.width,
            height: img.height,
          } satisfies ImageResult;
        }),
      );

      const seen = new Set<string>();
      const filtered = resolved.filter((img): img is ImageResult => {
        if (!img || !img.postUrl.includes(HANDLE)) return false;
        const dedupeKey = img.src.split("?")[0];
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      });

      return { images: filtered.slice(0, 20) };
    } catch (error) {
      console.error("Instagram fetch failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return { images: [], error: message };
    }
  },
);
