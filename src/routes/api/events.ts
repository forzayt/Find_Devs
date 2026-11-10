import { createFileRoute } from "@tanstack/react-router";

import { archiveEtag, loadArchiveFeed } from "@/lib/gh-archive";

// The feed is served entirely from GitHub Archive's hourly dumps, so the app
// never calls the official GitHub API (and never shares its hourly quota).
export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requested = Number(new URL(request.url).searchParams.get("per_page") ?? "100");
        const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 100;

        const feed = await loadArchiveFeed(limit, request.signal);
        if (!feed) {
          return Response.json(
            { message: "GitHub Archive is unreachable right now." },
            { status: 502 },
          );
        }

        const etag = archiveEtag(feed);
        const headers = new Headers({
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-poll-interval": "180",
          etag,
        });

        if (request.headers.get("if-none-match") === etag) {
          return new Response(null, { status: 304, headers });
        }

        return new Response(JSON.stringify(feed.events), { status: 200, headers });
      },
    },
  },
});
