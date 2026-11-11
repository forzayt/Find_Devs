import type { ShowcaseProjectMeta } from "@/lib/project-showcase";

export type GithubRepositoryPayload = {
  name?: string;
  full_name?: string;
  description?: string | null;
  language?: string | null;
  homepage?: string | null;
  archived?: boolean;
  topics?: string[];
};

/** First match wins, so put more specific frameworks before generic ones. */
const FRAMEWORKS: Array<[RegExp, string]> = [
  [/\bnext(?:\.?js)?\b/i, "Next.js"],
  [/\bnuxt(?:\.?js)?\b/i, "Nuxt"],
  [/\bastro\b/i, "Astro"],
  [/\bsvelte(?:kit)?\b/i, "Svelte"],
  [/\bvue(?:\.?js)?\b/i, "Vue"],
  [/\bangular\b/i, "Angular"],
  [/\bremix\b/i, "Remix"],
  [/\bdjango\b/i, "Django"],
  [/\bflask\b/i, "Flask"],
  [/\bfastapi\b/i, "FastAPI"],
  [/\brails\b/i, "Rails"],
  [/\blaravel\b/i, "Laravel"],
  [/\bspring\b/i, "Spring"],
  [/\bexpress(?:\.?js)?\b/i, "Express"],
  [/\breact\b/i, "React"],
];

const DATABASES: Array<[RegExp, string]> = [
  [/\bmongo(?:db)?\b/i, "MongoDB"],
  [/\bpostgres(?:ql)?\b/i, "PostgreSQL"],
  [/\bmysql\b/i, "MySQL"],
  [/\bsqlite\b/i, "SQLite"],
  [/\bredis\b/i, "Redis"],
  [/\bsupabase\b/i, "Supabase"],
  [/\bfirebase\b/i, "Firebase"],
  [/\bdynamodb\b/i, "DynamoDB"],
];

const HOSTS: Array<[string, string]> = [
  ["vercel.app", "Vercel"],
  ["netlify.app", "Netlify"],
  ["herokuapp.com", "Heroku"],
  ["github.io", "GitHub Pages"],
  ["pages.dev", "Cloudflare Pages"],
  ["onrender.com", "Render"],
  ["render.com", "Render"],
  ["fly.dev", "Fly.io"],
  ["railway.app", "Railway"],
];

function firstMatch(patterns: Array<[RegExp, string]>, text: string) {
  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) return label;
  }
  return undefined;
}

function hostFromHomepage(homepage: string | null | undefined) {
  if (!homepage) return undefined;
  try {
    const hostname = new URL(homepage).hostname.toLowerCase();
    for (const [suffix, label] of HOSTS) {
      if (hostname === suffix || hostname.endsWith(`.${suffix}`)) return label;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Best-effort metadata for a showcase card. GitHub exposes name, description
 * and language directly; framework/database/host are inferred from topics,
 * the description and the homepage domain, so explicit values in
 * `projects.json` should win over these.
 */
export function deriveProjectMeta(repository: GithubRepositoryPayload): ShowcaseProjectMeta {
  const topics = repository.topics ?? [];
  const text = [topics.join(" "), repository.description ?? "", repository.homepage ?? ""].join(" ");

  return {
    name: repository.name ?? repository.full_name?.split("/")[1] ?? undefined,
    description: repository.description?.trim() || undefined,
    language: repository.language ?? undefined,
    framework: firstMatch(FRAMEWORKS, text),
    database: firstMatch(DATABASES, text),
    host: hostFromHomepage(repository.homepage),
    status: repository.archived ? "Archived" : "Active",
  };
}
