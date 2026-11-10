import { createFileRoute } from "@tanstack/react-router";

import { loadTrendingRepositories } from "@/lib/github-trending";

export const Route = createFileRoute("/api/trending")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const repositories = await loadTrendingRepositories(request.signal);
          return Response.json(repositories, {
            headers: {
              "cache-control": "public, max-age=86400, stale-while-revalidate=3600",
            },
          });
        } catch (error) {
          console.error("Unable to load GitHub Trending", error);
          return Response.json(
            { message: "GitHub Trending is unavailable right now." },
            { status: 502 },
          );
        }
      },
    },
  },
});
