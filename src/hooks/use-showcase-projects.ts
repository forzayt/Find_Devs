import { useEffect, useMemo, useState } from "react";

import {
  repoFromProjectUrl,
  showcaseProjectFallbackName,
  showcaseProjects,
  type ShowcaseProject,
  type ShowcaseProjectMeta,
} from "@/lib/project-showcase";

/**
 * Showcase entries from `projects.json` merged with GitHub metadata. The JSON
 * value always wins, so any field can be overridden by hand. `loading` stays
 * true until the first API response so the page can show skeleton cards.
 */
export function useShowcaseProjects(): { projects: ShowcaseProject[]; loading: boolean } {
  const [meta, setMeta] = useState<Record<string, ShowcaseProjectMeta>>({});
  const [loading, setLoading] = useState(true);

  const repos = useMemo(
    () =>
      showcaseProjects
        .map((project) => repoFromProjectUrl(project.url))
        .filter((repo): repo is string => Boolean(repo)),
    [],
  );
  const query = repos.join(",");

  useEffect(() => {
    if (!query) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();

    fetch(`/api/project-meta?repos=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : {}))
      .then((data: Record<string, ShowcaseProjectMeta>) => setMeta(data))
      .catch(() => {
        // The cards fall back to names derived from the project URLs.
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query]);

  const projects = useMemo(
    () =>
      showcaseProjects.map((project) => {
        const repo = repoFromProjectUrl(project.url);
        const fetched = repo ? meta[repo] : undefined;

        return {
          url: project.url,
          name: project.name ?? fetched?.name ?? showcaseProjectFallbackName(project),
          description: project.description ?? fetched?.description,
          language: project.language ?? fetched?.language,
          framework: project.framework ?? fetched?.framework,
          database: project.database ?? fetched?.database,
          host: project.host ?? fetched?.host,
          status: project.status ?? fetched?.status,
        };
      }),
    [meta],
  );

  return { projects, loading };
}
