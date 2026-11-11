import { createFileRoute } from "@tanstack/react-router";

import { fetchGithubApi } from "@/lib/github-api";
import { deriveProjectMeta, type GithubRepositoryPayload } from "@/lib/project-metadata";
import type { ShowcaseProjectMeta } from "@/lib/project-showcase";

const MAX_REPOS = 20;
// Dev reloads and repeated mounts hammer this endpoint, so cache each repo
// briefly and reuse the last good value when GitHub is unreachable.
const CACHE_TTL_MS = 60_000;

type CachedMeta = { meta: ShowcaseProjectMeta; expiresAt: number };

const metaCache = new Map<string, CachedMeta>();

function validRepositoryName(name: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name);
}

async function loadMeta(repo: string): Promise<ShowcaseProjectMeta | undefined> {
  const cached = metaCache.get(repo);
  if (cached && cached.expiresAt > Date.now()) return cached.meta;

  try {
    // Intentionally no request.signal: the client aborts on every navigation
    // and HMR reload, and forwarding that turns into "Error: aborted" failures.
    const response = await fetchGithubApi(`repos/${repo}`);
    if (!response.ok) return cached?.meta;

    const payload = (await response.json()) as GithubRepositoryPayload;
    const meta = deriveProjectMeta(payload);
    metaCache.set(repo, { meta, expiresAt: Date.now() + CACHE_TTL_MS });
    return meta;
  } catch {
    return cached?.meta;
  }
}

export const Route = createFileRoute("/api/project-meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const repos = [
          ...new Set(
            (new URL(request.url).searchParams.get("repos") ?? "")
              .split(",")
              .map((name) => name.trim())
              .filter((name) => validRepositoryName(name)),
          ),
        ].slice(0, MAX_REPOS);

        if (!repos.length) {
          return Response.json(
            { message: "At least one repository is required." },
            { status: 400 },
          );
        }

        try {
          const entries = await Promise.all(
            repos.map(async (repo) => [repo, await loadMeta(repo)] as const),
          );

          const meta = Object.fromEntries(
            entries.filter((entry): entry is readonly [string, ShowcaseProjectMeta] =>
              Boolean(entry[1]),
            ),
          ) as Record<string, ShowcaseProjectMeta>;

          if (!Object.keys(meta).length) {
            return Response.json(
              { message: "Project metadata is temporarily unavailable." },
              { status: 502 },
            );
          }

          return Response.json(meta, {
            headers: { "cache-control": "public, max-age=60, stale-while-revalidate=3600" },
          });
        } catch {
          return Response.json(
            { message: "Project metadata is temporarily unavailable." },
            { status: 502 },
          );
        }
      },
    },
  },
});
