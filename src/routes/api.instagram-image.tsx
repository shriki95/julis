import { createFileRoute } from "@tanstack/react-router";

function isInstagramPostUrl(url: URL) {
  return url.hostname.endsWith("instagram.com") && /^\/(p|reel)\//.test(url.pathname);
}

const COMMON_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const IMAGE_HEADERS: HeadersInit = {
  ...COMMON_HEADERS,
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  Referer: "https://www.instagram.com/",
};

export const Route = createFileRoute("/api/instagram-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const post = requestUrl.searchParams.get("post");

        if (!post) {
          return new Response("Missing post", { status: 400 });
        }

        let postUrl: URL;
        try {
          postUrl = new URL(post);
        } catch {
          return new Response("Invalid url", { status: 400 });
        }

        if (postUrl.protocol !== "https:" || !isInstagramPostUrl(postUrl)) {
          return new Response("Blocked host", { status: 400 });
        }

        // Step 1: fetch the post HTML and extract the *current* og:image URL
        let imageUrl: string | null = null;
        try {
          const postRes = await fetch(postUrl.toString(), { headers: COMMON_HEADERS });
          if (!postRes.ok) {
            return new Response(`Post fetch failed: ${postRes.status}`, { status: 502 });
          }
          const html = await postRes.text();
          const match = html.match(/<meta property="og:image" content="([^"]+)"/i);
          imageUrl = match?.[1] ? match[1].replace(/&amp;/g, "&") : null;
        } catch (e) {
          return new Response(`Post fetch error: ${(e as Error).message}`, { status: 502 });
        }

        if (!imageUrl) {
          return new Response("No og:image found", { status: 404 });
        }

        // Step 2: stream the image (URLs expire fast — fetch immediately)
        let imageRes: Response;
        try {
          imageRes = await fetch(imageUrl, { headers: IMAGE_HEADERS });
        } catch (e) {
          return new Response(`Image fetch error: ${(e as Error).message}`, { status: 502 });
        }

        if (!imageRes.ok || !imageRes.body) {
          return new Response(`Image fetch failed: ${imageRes.status}`, { status: 502 });
        }

        return new Response(imageRes.body, {
          status: 200,
          headers: {
            "Content-Type": imageRes.headers.get("content-type") || "image/jpeg",
            "Cache-Control": "public, max-age=600",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
