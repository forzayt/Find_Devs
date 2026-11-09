import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Box,
  CircleDot,
  Code2,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Radio,
  RefreshCw,
  Rocket,
  Star,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type GithubEvent = {
  id: string;
  type: string;
  actor: { login: string; avatar_url: string };
  repo: { name: string };
  payload: Record<string, unknown>;
  created_at: string;
};

type RepoDetails = { language?: string | null; stargazers_count?: number };
type FeedFilter = "All" | "Pushes" | "Repositories" | "Pull Requests" | "Releases";

const FILTERS: { label: FeedFilter; icon: typeof Activity }[] = [
  { label: "All", icon: Activity },
  { label: "Pushes", icon: GitCommitHorizontal },
  { label: "Repositories", icon: Box },
  { label: "Pull Requests", icon: GitPullRequest },
  { label: "Releases", icon: Rocket },
];
const REFRESH_FALLBACK_MS = 90_000;
const SUPPORTED_EVENTS = new Set([
  "PushEvent",
  "CreateEvent",
  "PullRequestEvent",
  "ReleaseEvent",
  "IssuesEvent",
]);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FindDevs — See what developers are building" },
      {
        name: "description",
        content: "A live window into what developers are building across GitHub.",
      },
      { property: "og:title", content: "FindDevs — See what developers are building" },
      {
        property: "og:description",
        content: "A live window into what developers are building across GitHub.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FindDevs,
});

function FindDevs() {
  const [events, setEvents] = useState<GithubEvent[]>([]);
  const [repoDetails, setRepoDetails] = useState<Record<string, RepoDetails>>({});
  const [commitMessages, setCommitMessages] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FeedFilter>("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const etagRef = useRef("");
  const detailsRef = useRef(new Set<string>());
  const commitsRef = useRef(new Set<string>());

  const refresh = useCallback(async (signal: AbortSignal) => {
    setRefreshing(true);
    setError("");
    let pollMs = REFRESH_FALLBACK_MS;
    try {
      const headers = new Headers();
      if (etagRef.current) headers.set("If-None-Match", etagRef.current);
      const response = await fetch("https://api.github.com/events?per_page=100", {
        headers,
        cache: "no-store",
        signal,
      });
      const pollHeader = Number(response.headers.get("X-Poll-Interval"));
      if (Number.isFinite(pollHeader) && pollHeader > 0) {
        pollMs = Math.max(REFRESH_FALLBACK_MS, pollHeader * 1000);
      }

      if (response.status === 304) {
        setLastUpdated(new Date());
        return pollMs;
      }

      if (!response.ok) {
        const remaining = response.headers.get("X-RateLimit-Remaining");
        const reset = Number(response.headers.get("X-RateLimit-Reset"));
        if (response.status === 403 && remaining === "0" && reset > 0) {
          pollMs = Math.max(pollMs, reset * 1000 - Date.now() + 1000);
          throw new Error("GitHub's public feed has reached its shared hourly limit.");
        }
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          if (Number.isFinite(retryAfter) && retryAfter > 0) pollMs = Math.max(pollMs, retryAfter * 1000);
          throw new Error("GitHub is asking us to pause before checking again.");
        }
        throw new Error(`GitHub couldn't load the activity feed (${response.status}).`);
      }

      const nextEtag = response.headers.get("ETag");
      if (nextEtag) etagRef.current = nextEtag;
      const body: unknown = await response.json();
      const nextEvents = Array.isArray(body)
        ? (body as GithubEvent[]).filter((event) => SUPPORTED_EVENTS.has(event.type))
        : [];
      setEvents(nextEvents);
      setLastUpdated(new Date());
      setLoading(false);

      // Enrich a small number of real feed items once per session, so the public
      // activity endpoint remains the only repeatedly-polled request.
      for (const event of nextEvents) {
        if (signal.aborted) break;
        if (detailsRef.current.size < 3 && !detailsRef.current.has(event.repo.name)) {
          detailsRef.current.add(event.repo.name);
          try {
            const repoResponse = await fetch(
              `https://api.github.com/repos/${event.repo.name.split("/").map(encodeURIComponent).join("/")}`,
              { cache: "no-store", signal },
            );
            if (repoResponse.ok) {
              const details = (await repoResponse.json()) as RepoDetails;
              setRepoDetails((current) => ({ ...current, [event.repo.name]: details }));
            }
          } catch {
            // The activity card remains complete without optional repo metadata.
          }
        }

        const head = typeof event.payload.head === "string" ? event.payload.head : "";
        const commitKey = `${event.repo.name}@${head}`;
        if (event.type === "PushEvent" && head && commitsRef.current.size < 3 && !commitsRef.current.has(commitKey)) {
          commitsRef.current.add(commitKey);
          try {
            const commitResponse = await fetch(
              `https://api.github.com/repos/${event.repo.name.split("/").map(encodeURIComponent).join("/")}/commits/${encodeURIComponent(head)}`,
              { cache: "no-store", signal },
            );
            if (commitResponse.ok) {
              const commit = (await commitResponse.json()) as { commit?: { message?: string } };
              if (commit.commit?.message) {
                setCommitMessages((current) => ({ ...current, [commitKey]: commit.commit?.message ?? "" }));
              }
            }
          } catch {
            // Fall back to the branch and abbreviated commit ID from the event.
          }
        }
        if (detailsRef.current.size >= 3 && commitsRef.current.size >= 3) break;
      }
      return pollMs;
    } catch (caught) {
      if (!signal.aborted) {
        setError(caught instanceof Error ? caught.message : "Something interrupted the feed.");
        setLoading(false);
      }
      return pollMs;
    } finally {
      if (!signal.aborted) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const schedule = async () => {
      if (document.visibilityState === "hidden") {
        timer = setTimeout(schedule, REFRESH_FALLBACK_MS);
        return;
      }
      const delay = await refresh(controller.signal);
      if (disposed || controller.signal.aborted) return;
      const next = new Date(Date.now() + delay);
      setNextRefreshAt(next);
      timer = setTimeout(schedule, delay);
    };
    void schedule();
    return () => {
      disposed = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [refresh, refreshKey]);

  const visibleEvents = useMemo(
    () => events.filter((event) => matchesFilter(event, filter)),
    [events, filter],
  );
  const developers = useMemo(() => {
    const seen = new Set<string>();
    return events.filter((event) => {
      if (seen.has(event.actor.login)) return false;
      seen.add(event.actor.login);
      return true;
    }).slice(0, 5);
  }, [events]);
  const trendingRepos = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) counts.set(event.repo.name, (counts.get(event.repo.name) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [events]);
  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [repo, details] of Object.entries(repoDetails)) {
      if (details.language) counts.set(details.language, (counts.get(details.language) ?? 0) + (events.filter((event) => event.repo.name === repo).length || 1));
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [events, repoDetails]);

  const handleRefresh = () => {
    setRefreshKey((key) => key + 1);
    setLoading(events.length === 0);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-[1500px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
          <a className="flex min-w-0 items-center gap-3" href="/" aria-label="FindDevs home">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Code2 className="size-5" />
            </span>
            <span className="text-lg font-bold tracking-normal">Find<span className="text-primary">Devs</span></span>
            <span className="hidden border-l border-border pl-3 text-xs text-muted-foreground sm:inline">developer activity, live</span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-xs font-medium text-muted-foreground sm:flex">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative size-2 rounded-full bg-primary" /></span>
              PUBLIC NETWORK
            </span>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} aria-label="Refresh activity">
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <a href="https://github.com" target="_blank" rel="noreferrer" aria-label="Visit GitHub" className="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <GitBranch className="size-4" />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-0 px-4 sm:px-6 lg:grid-cols-[210px_minmax(0,1fr)_280px] lg:gap-7 lg:px-8">
        <aside className="border-b border-border py-4 lg:sticky lg:top-[68px] lg:h-[calc(100vh-68px)] lg:border-b-0 lg:py-7">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1">
            <p className="hidden px-3 pb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground lg:block">YOUR FEED</p>
            {FILTERS.map(({ label, icon: Icon }) => (
              <Button key={label} variant={filter === label ? "secondary" : "ghost"} className="h-9 shrink-0 justify-start gap-3 px-3 lg:w-full" onClick={() => setFilter(label)} aria-pressed={filter === label}>
                <Icon className="size-4" />
                <span>{label === "All" ? "All activity" : label}</span>
                {label === "All" && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
              </Button>
            ))}
          </div>
          <div className="mt-7 hidden border-t border-border pt-5 lg:block">
            <p className="px-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground">ON FINDDEVS</p>
            <div className="mt-3 flex items-start gap-3 px-3 text-xs leading-5 text-muted-foreground">
              <Radio className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>Open feed. Real work. Straight from GitHub.</p>
            </div>
            <p className="mt-5 px-3 text-[11px] leading-5 text-muted-foreground">Activity can arrive with a delay from GitHub’s public feed.</p>
          </div>
        </aside>

        <section className="min-w-0 py-6 lg:py-8" aria-label="GitHub activity feed">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-primary"><span className="size-1.5 rounded-full bg-primary" /> LIVE FROM GITHUB</div>
              <h1 className="text-2xl font-semibold tracking-normal sm:text-[28px]">The dev feed</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">A pulse on what the community is shipping.</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{events.length ? `${events.length} recent activities` : "Public activity"}</p>
              <p className="mt-1">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Connecting to GitHub…"}</p>
            </div>
          </div>

          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Filter activity">
            {FILTERS.map(({ label }) => (
              <Button key={label} variant="ghost" role="tab" aria-selected={filter === label} onClick={() => setFilter(label)} className={`h-10 shrink-0 rounded-none px-3 text-xs ${filter === label ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}>
                {label}
              </Button>
            ))}
          </div>

          {error && (
            <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <p className="text-muted-foreground">{error} {events.length > 0 ? "Showing the latest activity we could load." : ""}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh}>Try again</Button>
            </div>
          )}

          {loading ? (
            <div className="space-y-3" aria-label="Loading activity" aria-busy="true">
              {[0, 1, 2].map((item) => <FeedSkeleton key={item} />)}
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center border border-dashed border-border px-6 text-center">
              <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Activity className="size-5" /></span>
              <h2 className="font-medium">{error ? "The feed is taking a break" : events.length ? "Quiet on this channel" : "No public activity yet"}</h2>
              <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{error ? "GitHub’s public feed may be temporarily unavailable. Try again shortly." : events.length ? "Try another filter to see what developers are up to." : "New activity will appear here as it arrives from GitHub."}</p>
              {events.length > 0 && <Button variant="outline" size="sm" className="mt-4" onClick={() => setFilter("All")}>View all activity</Button>}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleEvents.map((event) => <ActivityCard key={event.id} event={event} commitMessage={commitMessages[`${event.repo.name}@${String(event.payload.head ?? "")}`]} repoDetails={repoDetails[event.repo.name]} />)}
            </div>
          )}
          <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
            <span>Public events provided by GitHub</span>
            <span>{nextRefreshAt ? `Next check after ${nextRefreshAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Waiting for first update"}</span>
          </div>
        </section>

        <aside className="hidden min-w-0 space-y-7 py-8 lg:block">
          <section aria-labelledby="trending-title">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="trending-title" className="text-sm font-semibold">Trending repositories</h2><ArrowUpRight className="size-4 text-muted-foreground" />
            </div>
            {trendingRepos.length ? <ol className="space-y-1">{trendingRepos.map(([name, count], index) => <li key={name} className="flex items-start gap-3 py-2">
              <span className="pt-0.5 font-mono text-xs text-muted-foreground">0{index + 1}</span>
              <div className="min-w-0 flex-1"><a href={repoUrl(name)} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium hover:text-primary">{name}</a><p className="mt-1 text-[11px] text-muted-foreground">{repoDetails[name]?.language ?? "Repository"}{repoDetails[name]?.language ? " · " : ""}{count} recent {count === 1 ? "event" : "events"}</p></div>
              <span className="flex items-center gap-1 pt-0.5 text-[11px] text-muted-foreground"><Star className="size-3" />{repoDetails[name]?.stargazers_count?.toLocaleString() ?? "—"}</span>
            </li>)}</ol> : <SidebarEmpty>Repos appear as they’re mentioned in the feed.</SidebarEmpty>}
          </section>

          <section className="border-t border-border pt-6" aria-labelledby="developers-title">
            <div className="mb-3 flex items-center justify-between"><h2 id="developers-title" className="text-sm font-semibold">Around the community</h2><Users className="size-4 text-muted-foreground" /></div>
            {developers.length ? <ul className="space-y-3">{developers.map((event) => <li key={event.actor.login} className="flex items-center gap-2.5">
              <Avatar className="size-8"><AvatarImage src={event.actor.avatar_url} alt="" /><AvatarFallback>{event.actor.login.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
              <div className="min-w-0"><a href={`https://github.com/${encodeURIComponent(event.actor.login)}`} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium hover:text-primary">{event.actor.login}</a><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{event.repo.name}</p></div>
            </li>)}</ul> : <SidebarEmpty>Developers will show up with new activity.</SidebarEmpty>}
          </section>

          <section className="border-t border-border pt-6" aria-labelledby="languages-title">
            <div className="mb-4 flex items-center justify-between"><h2 id="languages-title" className="text-sm font-semibold">Languages in the mix</h2><Code2 className="size-4 text-muted-foreground" /></div>
            {languages.length ? <ul className="space-y-3">{languages.map(([language, count], index) => <li key={language}>
              <div className="mb-1.5 flex items-center justify-between text-xs"><span>{language}</span><span className="text-muted-foreground">{count} {count === 1 ? "repo" : "repos"}</span></div>
              <div className="h-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full language-meter language-meter-${index}`} /></div>
            </li>)}</ul> : <SidebarEmpty>Languages appear when repository details are available.</SidebarEmpty>}
          </section>

          <div className="border-t border-border pt-5 text-[11px] leading-5 text-muted-foreground">
            <a href="https://docs.github.com/en/rest/activity/events" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">About GitHub events <ArrowUpRight className="size-3" /></a>
            <p className="mt-2">Updates follow GitHub’s polling interval and availability.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function matchesFilter(event: GithubEvent, filter: FeedFilter) {
  if (filter === "All") return true;
  if (filter === "Pushes") return event.type === "PushEvent";
  if (filter === "Repositories") return event.type === "CreateEvent";
  if (filter === "Pull Requests") return event.type === "PullRequestEvent";
  return event.type === "ReleaseEvent";
}

function eventUrl(event: GithubEvent) {
  const payload = event.payload;
  const pull = payload.pull_request as { html_url?: string } | undefined;
  const issue = payload.issue as { html_url?: string } | undefined;
  const release = payload.release as { html_url?: string } | undefined;
  if (event.type === "PullRequestEvent" && pull?.html_url) return pull.html_url;
  if (event.type === "IssuesEvent" && issue?.html_url) return issue.html_url;
  if (event.type === "ReleaseEvent" && release?.html_url) return release.html_url;
  if (event.type === "PushEvent" && typeof payload.head === "string") return `${repoUrl(event.repo.name)}/commit/${encodeURIComponent(payload.head)}`;
  return repoUrl(event.repo.name);
}

function repoUrl(name: string) {
  return `https://github.com/${name.split("/").map(encodeURIComponent).join("/")}`;
}

function eventCopy(event: GithubEvent) {
  const payload = event.payload;
  if (event.type === "PushEvent") {
    const ref = typeof payload.ref === "string" ? payload.ref.replace("refs/heads/", "") : "a branch";
    return { verb: "pushed to", title: ref, icon: GitCommitHorizontal, kind: "push" };
  }
  if (event.type === "CreateEvent") {
    const refType = typeof payload.ref_type === "string" ? payload.ref_type : "repository";
    const name = typeof payload.ref === "string" ? payload.ref : event.repo.name;
    return { verb: "created a", title: refType === "repository" ? "new repository" : `${refType} ${name}`, icon: Box, kind: "create" };
  }
  if (event.type === "PullRequestEvent") {
    const pull = payload.pull_request as { title?: string; number?: number } | undefined;
    const action = typeof payload.action === "string" ? payload.action : "updated";
    return { verb: `${action} a pull request in`, title: pull?.title ?? "Pull request", icon: GitPullRequest, kind: "pull" };
  }
  if (event.type === "ReleaseEvent") {
    const release = payload.release as { name?: string; tag_name?: string } | undefined;
    return { verb: "published a release in", title: release?.name || release?.tag_name || "New release", icon: Rocket, kind: "release" };
  }
  const issue = payload.issue as { title?: string } | undefined;
  const action = typeof payload.action === "string" ? payload.action : "updated";
  return { verb: `${action} an issue in`, title: issue?.title ?? "Issue", icon: CircleDot, kind: "issue" };
}

function ActivityCard({ event, commitMessage, repoDetails }: { event: GithubEvent; commitMessage?: string; repoDetails?: RepoDetails }) {
  const copy = eventCopy(event);
  const Icon = copy.icon;
  const branch = typeof event.payload.ref === "string" ? event.payload.ref.replace("refs/heads/", "") : "";
  const head = typeof event.payload.head === "string" ? event.payload.head : "";
  const cleanMessage = commitMessage?.split("\n")[0];
  const time = new Date(event.created_at);
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-ring/60">
      <div className="flex items-start gap-3.5 p-4 sm:p-5">
        <a href={`https://github.com/${encodeURIComponent(event.actor.login)}`} target="_blank" rel="noreferrer" aria-label={`${event.actor.login} on GitHub`} className="mt-0.5 shrink-0">
          <Avatar className="size-9"><AvatarImage src={event.actor.avatar_url} alt="" /><AvatarFallback>{event.actor.login.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[13px] leading-5">
            <a href={`https://github.com/${encodeURIComponent(event.actor.login)}`} target="_blank" rel="noreferrer" className="font-semibold hover:text-primary">{event.actor.login}</a>
            <span className="text-muted-foreground">{copy.verb}</span>
            <a href={repoUrl(event.repo.name)} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{event.repo.name}</a>
            <time className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground" dateTime={event.created_at} title={time.toLocaleString()}>{relativeTime(time)}</time>
          </div>
          <a href={eventUrl(event)} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-medium leading-5 hover:text-primary">{copy.title}</a>
          {event.type === "PushEvent" && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{cleanMessage ?? (head ? `Commit ${head.slice(0, 7)}${branch ? ` · ${branch}` : ""}` : branch ? `Updates to ${branch}` : "Pushed new changes")}</p>}
          {event.type === "PullRequestEvent" && typeof event.payload.action === "string" && <p className="mt-2 text-xs text-muted-foreground">{event.payload.action === "opened" ? "A new contribution is ready for review." : "Pull request activity"}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[10px] font-medium activity-kind activity-kind-${copy.kind}`}><Icon className="size-3" />{kindLabel(copy.kind)}</span>
            {repoDetails?.language && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />{repoDetails.language}</span>}
            {event.type === "PushEvent" && head && <span className="font-mono text-[10px] text-muted-foreground">{head.slice(0, 7)}</span>}
            <a href={eventUrl(event)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary">View on GitHub <ArrowUpRight className="size-3" /></a>
          </div>
        </div>
      </div>
    </article>
  );
}

function kindLabel(kind: string) {
  if (kind === "push") return "PUSH";
  if (kind === "create") return "REPOSITORY";
  if (kind === "pull") return "PULL REQUEST";
  if (kind === "release") return "RELEASE";
  return "ISSUE";
}

function relativeTime(date: Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function FeedSkeleton() {
  return <div className="flex animate-pulse gap-3.5 rounded-lg border border-border bg-card p-5" aria-hidden="true">
    <div className="size-9 shrink-0 rounded-full bg-muted" />
    <div className="flex-1 space-y-3"><div className="h-3 w-3/4 rounded bg-muted" /><div className="h-3 w-1/2 rounded bg-muted" /><div className="h-3 w-2/3 rounded bg-muted" /></div>
  </div>;
}

function SidebarEmpty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-xs leading-5 text-muted-foreground">{children}</p>;
}