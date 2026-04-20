import { createFileRoute } from "@tanstack/react-router";

const BROWSER_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua": '"Chromium";v="121", "Not A(Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const IMAGE_HEADERS: HeadersInit = {
  ...BROWSER_HEADERS,
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  Referer: "https://www.instagram.com/",
};

export const Route = createFileRoute("/api/instagram-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const mediaId = requestUrl.searchParams.get("mediaId");

        if (!mediaId || !/^\d+$/.test(mediaId)) {
          return new Response("Missing or invalid mediaId", { status: 400 });
        }

        // Step 1: ask Instagram for the SEO crawler page (returns 302 to /p/<shortcode>)
        const lookasideUrl = `https://lookaside.instagram.com/seo/google_widget/crawler/?media_id=${mediaId}`;
        let postUrl: string | null = null;
        try {
          const redirectRes = await fetch(lookasideUrl, {
            method: "GET",
            redirect: "manual",
            headers: BROWSER_HEADERS,
          });
          postUrl = redirectRes.headers.get("location");
        } catch (e) {
          return new Response(`Lookaside error: ${(e as Error).message}`, { status: 502 });
        }

        if (!postUrl) {
          return new Response("No post redirect", { status: 502 });
        }
        if (!postUrl.startsWith("http")) postUrl = `https://www.instagram.com${postUrl}`;

        // Step 2: fetch the post page and extract og:image
        let html: string;
        try {
          const postRes = await fetch(postUrl, { headers: BROWSER_HEADERS });
          if (!postRes.ok) {
            return new Response(`Post fetch failed: ${postRes.status}`, { status: 502 });
          }
          html = await postRes.text();
        } catch (e) {
          return new Response(`Post fetch error: ${(e as Error).message}`, { status: 502 });
        }

        const match = html.match(/<meta property="og:image" content="([^"]+)"/i);
        const imageUrl = match?.[1] ? match[1].replace(/&amp;/g, "&") : null;
        if (!imageUrl) {
          // Helpful debugging: snippet of the HTML so we can see what IG returned
          const snippet = html.slice(0, 400).replace(/\s+/g, " ");
          return new Response(`No og:image. Snippet: ${snippet}`, { status: 404 });
        }

        // Step 3: fetch the image bytes immediately (CDN URL expires fast)
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
