import { createFileRoute } from "@tanstack/react-router";

import { fetchGithubApi } from "@/lib/github-api";
import { deriveProjectMeta, type GithubRepositoryPayload } from "@/lib/project-metadata";
import type { ShowcaseProjectMeta } from "@/lib/project-showcase";

const MAX_REPOS = 20;

function validRepositoryName(name: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name);
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

        const entries = await Promise.all(
          repos.map(async (repo) => {
            try {
              const response = await fetchGithubApi(`repos/${repo}`, { signal: request.signal });
              if (!response.ok) return [repo, undefined] as const;
              const payload = (await response.json()) as GithubRepositoryPayload;
              return [repo, deriveProjectMeta(payload)] as const;
            } catch {
              return [repo, undefined] as const;
            }
          }),
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
          headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" },
        });
      },
    },
  },
});
