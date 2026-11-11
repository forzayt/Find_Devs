import { createFileRoute } from "@tanstack/react-router";

import { validLogin } from "@/lib/dev-stats";
import { loadDevStats } from "@/lib/github-dev-stats";

// Serves the hover-card data for a single developer. Every request goes to the
// official REST API on api.github.com (never the proxy fallbacks), so the card
// only ever shows GitHub's own profile data. GitHub allows 60 unauthenticated
// calls an hour per IP, so the loader caches each login for ten minutes,
// de-duplicates concurrent hovers, and honours GITHUB_TOKEN when present.
export const Route = createFileRoute("/api/dev-stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const login = (new URL(request.url).searchParams.get("login") ?? "").trim();

        if (!login || !validLogin(login)) {
          return Response.json({ message: "A valid GitHub login is required." }, { status: 400 });
        }

        const stats = await loadDevStats(login);
        if (!stats) {
          return Response.json(
            { message: "Developer stats are temporarily unavailable." },
            { status: 502 },
          );
        }

        return Response.json(stats, {
          headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" },
        });
      },
    },
  },
});
