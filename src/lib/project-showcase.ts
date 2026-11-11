import projectsFile from "@/projects.json";

/** Fields a project entry may define in `src/projects.json`. Only `url` is
 * required: anything missing is filled from the GitHub API. */
export interface ShowcaseProjectInput {
  url: string;
  name?: string;
  description?: string;
  language?: string;
  framework?: string;
  database?: string;
  host?: string;
  status?: string;
}

/** Metadata resolved from GitHub for a project URL. */
export interface ShowcaseProjectMeta {
  name: string | undefined;
  description: string | undefined;
  language: string | undefined;
  framework: string | undefined;
  database: string | undefined;
  host: string | undefined;
  status: string | undefined;
}

/** JSON entry merged with whatever the API could resolve. */
export type ShowcaseProject = {
  url: string;
  name: string;
  description: string | undefined;
  language: string | undefined;
  framework: string | undefined;
  database: string | undefined;
  host: string | undefined;
  status: string | undefined;
};

/** Source of truth for the showcase: edit `src/projects.json`. */
export const showcaseProjects: ShowcaseProjectInput[] = projectsFile.projects;

/** "https://github.com/owner/repo[/...]" -> "owner/repo". */
export function repoFromProjectUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)github\.com$/i.test(parsed.hostname)) return undefined;
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !repo) return undefined;
    return `${owner}/${repo.replace(/\.git$/i, "")}`;
  } catch {
    return undefined;
  }
}

export function showcaseProjectUrl(project: ShowcaseProjectInput) {
  return project.url;
}

/** Used until the API answers, so the card always has a readable title. */
export function showcaseProjectFallbackName(project: ShowcaseProjectInput) {
  const repo = repoFromProjectUrl(project.url);
  if (repo) return repo.split("/")[1] ?? repo;
  try {
    return new URL(project.url).hostname.replace(/^www\./i, "");
  } catch {
    return project.url;
  }
}

/** Tech-stack line: language, framework, database and host that are known. */
export function showcaseProjectStack(project: Partial<ShowcaseProjectMeta>) {
  return [project.language, project.framework, project.database, project.host].filter(
    (item): item is string => Boolean(item),
  );
}

const submissionParams = new URLSearchParams({
  title: "Project submission: ",
  body: [
    "**Repository URL:**",
    "",
    "",
    "**Why should it be in the showcase?** (optional)",
    "",
    "",
    "<!--",
    "Name, description, language, framework, database and host are filled",
    "automatically from the GitHub API, so the URL is all that is required.",
    "-->",
    "",
  ].join("\n"),
});

/** Pre-filled issue so submissions land in the repo without extra backend. */
export const projectSubmissionUrl = `https://github.com/forzayt/Find_Devs/issues/new?${submissionParams.toString()}`;
