export interface ShowcaseProject {
  /** Display name for the project. */
  name: string;
  /** GitHub repository in owner/name form. */
  repo: string;
  /** One-line pitch shown under the name in the left rail. */
  description: string;
}

/** Hand-picked projects shown in the left rail. Keep this list short: the
 * sidebar only has room for a few entries. */
export const showcaseProjects: ShowcaseProject[] = [
  {
    name: "FindDevs",
    repo: "forzayt/Find_Devs",
    description: "Real GitHub activity, pulled straight from the public archive.",
  },
  {
    name: "TanStack Router",
    repo: "TanStack/router",
    description: "Type-safe routing and data loading for React apps.",
  },
  {
    name: "shadcn/ui",
    repo: "shadcn-ui/ui",
    description: "Accessible components you copy into your own codebase.",
  },
];

export function showcaseProjectUrl(project: ShowcaseProject) {
  return `https://github.com/${project.repo}`;
}

const submissionParams = new URLSearchParams({
  title: "Project submission: ",
  body: [
    "**Project name:**",
    "",
    "**Repository URL:**",
    "",
    "**What it does:**",
    "",
    "**Why it belongs in the showcase:**",
    "",
  ].join("\n"),
});

/** Pre-filled issue so submissions land in the repo without extra backend. */
export const projectSubmissionUrl = `https://github.com/forzayt/Find_Devs/issues/new?${submissionParams.toString()}`;
