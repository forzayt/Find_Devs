import { createFileRoute } from "@tanstack/react-router";

import { validLogin } from "@/lib/dev-stats";
import { loadDevStats } from "@/lib/github-dev-stats";

// Serves the hover-card data for a single developer. GitHub allows 60
// unauthenticated calls an hour, so the loader caches each login for ten
// minutes and de-duplicates concurrent hovers.
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
