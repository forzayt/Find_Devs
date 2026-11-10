import { createFileRoute } from "@tanstack/react-router";

import { loadTrendingDevelopers } from "@/lib/github-trending-developers";

export const Route = createFileRoute("/api/trending-developers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const developers = await loadTrendingDevelopers(request.signal);
          return Response.json(developers, {
            headers: {
              "cache-control": "public, max-age=86400, stale-while-revalidate=3600",
            },
          });
        } catch (error) {
          console.error("Unable to load GitHub Trending Developers", error);
          return Response.json(
            { message: "GitHub Trending Developers is unavailable right now." },
            { status: 502 },
          );
        }
      },
    },
  },
});
