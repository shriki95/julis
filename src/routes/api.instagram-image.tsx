import { createFileRoute } from "@tanstack/react-router";

function isAllowedInstagramHost(hostname: string) {
  return hostname.includes("cdninstagram.com") || hostname.includes("fbcdn.net");
}

export const Route = createFileRoute("/api/instagram-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const sourceUrl = requestUrl.searchParams.get("url");

        if (!sourceUrl) {
          return new Response("Missing url", { status: 400 });
        }

        let parsedUrl: URL;
        try {
          parsedUrl = new URL(sourceUrl);
        } catch {
          return new Response("Invalid url", { status: 400 });
        }

        if (parsedUrl.protocol !== "https:" || !isAllowedInstagramHost(parsedUrl.hostname)) {
          return new Response("Blocked host", { status: 400 });
        }

        const upstream = await fetch(parsedUrl.toString(), {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          },
        });

        if (!upstream.ok || !upstream.body) {
          return new Response("Image fetch failed", { status: 502 });
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
          },
        });
      },
    },
  },
});
