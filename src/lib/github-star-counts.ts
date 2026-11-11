import { loadUnghStars } from "@/lib/ungh";

function validRepositoryName(name: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name);
}

/** Star counts for a handful of repositories, via ungh.cc's cached API. */
export async function loadRepositoryStarCounts(names: string[], signal?: AbortSignal) {
  const repositories = [...new Set(names.filter(validRepositoryName))].slice(0, 4);
  if (!repositories.length) return {};

  const result = await loadUnghStars(repositories, signal);
  return result?.stars ?? {};
}
