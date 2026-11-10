import { createFileRoute } from "@tanstack/react-router";

import { loadRepositoryStarCounts } from "@/lib/github-star-counts";
import { loadTrendingDailyStars } from "@/lib/github-trending-live";

export const Route = createFileRoute("/api/repository-stars")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const names = (new URL(request.url).searchParams.get("repos") ?? "")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean);

        if (!names.length) {
          return Response.json(
            { message: "At least one repository is required." },
            { status: 400 },
          );
        }

        const [totalStars, dailyStars] = await Promise.all([
          loadRepositoryStarCounts(names, request.signal),
          loadTrendingDailyStars(request.signal).catch(() => ({}) as Record<string, number>),
        ]);
        if (!Object.keys(totalStars).length && !Object.keys(dailyStars).length) {
          return Response.json(
            { message: "Repository star counts are temporarily unavailable." },
            { status: 502 },
          );
        }

        const counts = Object.fromEntries(
          names.map((name) => [
            name,
            {
              totalStars: totalStars[name],
              starsToday: dailyStars[name],
            },
          ]),
        );

        return Response.json(counts, {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
