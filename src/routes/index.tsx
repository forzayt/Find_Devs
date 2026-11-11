import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowDownLeft,
  ArrowUp,
  ArrowUpRight,
  Box,
  CircleDot,
  Code2,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  Maximize2,
  Minimize2,
  Pause,
  Rocket,
  Star,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DevStatsHoverCard, DevStatsTrigger } from "@/components/dev-stats-card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { TrendingDeveloper } from "@/lib/github-trending-developers";
import type { TrendingRepository } from "@/lib/github-trending";
import {
  projectSubmissionUrl,
  showcaseProjectStack,
  showcaseProjectUrl,
} from "@/lib/project-showcase";
import { useShowcaseProjects } from "@/hooks/use-showcase-projects";

type GithubEvent = {
  id: string;
  type: string;
  actor: { login: string; avatar_url: string };
  repo: { name: string };
  payload: Record<string, unknown>;
  created_at: string;
};

const REFRESH_FALLBACK_MS = 180_000;
const PAGE_TITLE = "FindDevs — See what developers are building";
const INACTIVE_PAGE_TITLE = "get a life <3";
const REVEAL_INTERVAL_MS = 1_000;
const MAX_VISIBLE_EVENTS = 120;
const MIN_VISIBLE_FEED_ROWS = 3;
const FEED_ENDPOINT = "/api/events?per_page=500";
const TRENDING_ENDPOINT = "/api/trending?schema=2";
const TRENDING_CACHE_KEY = "finddevs:github-trending:v4";
const TRENDING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEVELOPERS_ENDPOINT = "/api/trending-developers";
const DEVELOPERS_CACHE_KEY = "finddevs:github-trending-developers:v1";
const STAR_POLL_INTERVAL_MS = 60_000;
const SUPPORTED_EVENTS = new Set([
  "PushEvent",
  "CreateEvent",
  "PullRequestEvent",
  "ReleaseEvent",
  "IssuesEvent",
]);
function shuffled<T>(items: readonly T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      {
        name: "description",
        content: "A window into what developers are building across GitHub.",
      },
      { property: "og:title", content: "FindDevs — See what developers are building" },
      {
        property: "og:description",
        content: "A window into what developers are building across GitHub.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FindDevs,
});

function FindDevs() {
  const [events, setEvents] = useState<GithubEvent[]>([]);
  const [fetchedEvents, setFetchedEvents] = useState<GithubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [paused, setPaused] = useState(false);
  const [trendingRepos, setTrendingRepos] = useState<TrendingRepository[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [developers, setDevelopers] = useState<TrendingDeveloper[]>([]);
  const [developersLoading, setDevelopersLoading] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showShowcase, setShowShowcase] = useState(false);
  const etagRef = useRef("");
  const pausedRef = useRef(false);
  const interactionPausedRef = useRef(false);
  const queueRef = useRef<GithubEvent[]>([]);
  const poolRef = useRef<GithubEvent[]>([]);
  const seenRef = useRef(new Set<string>());

  const refresh = useCallback(async (signal: AbortSignal) => {
    setError("");
    let pollMs = REFRESH_FALLBACK_MS;
    try {
      const headers = new Headers();
      if (etagRef.current) headers.set("If-None-Match", etagRef.current);
      const response = await fetch(FEED_ENDPOINT, {
        headers,
        cache: "no-store",
        signal,
      });
      const pollHeader = Number(response.headers.get("X-Poll-Interval"));
      if (Number.isFinite(pollHeader) && pollHeader > 0) {
        pollMs = Math.max(REFRESH_FALLBACK_MS, pollHeader * 1000);
      }

      if (response.status === 304) {
        return pollMs;
      }

      if (!response.ok) {
        throw new Error(`GitHub Archive couldn't load the activity feed (${response.status}).`);
      }

      const nextEtag = response.headers.get("ETag");
      if (nextEtag) etagRef.current = nextEtag;
      const body: unknown = await response.json();
      const nextEvents = Array.isArray(body)
        ? (body as GithubEvent[]).filter((event) => SUPPORTED_EVENTS.has(event.type))
        : [];

      // Shuffle each fetched batch so reloading the feed does not replay the
      // same activity in the same order.
      const incoming = shuffled(nextEvents);
      if (incoming.length) {
        poolRef.current = incoming;
        setFetchedEvents(nextEvents);
      }

      const fresh = incoming.filter((event) => !seenRef.current.has(event.id));
      for (const event of fresh) seenRef.current.add(event.id);
      if (fresh.length) {
        queueRef.current.push(...fresh);
      }
      if (!nextEvents.length) setLoading(false);
      return pollMs;
    } catch (caught) {
      if (!signal.aborted) {
        setError(caught instanceof Error ? caught.message : "Something interrupted the feed.");
        setLoading(false);
      }
      return pollMs;
    }
  }, []);

  useEffect(() => {
    const updateScrollTopVisibility = () => setShowScrollTop(window.scrollY > 480);
    updateScrollTopVisibility();
    window.addEventListener("scroll", updateScrollTopVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollTopVisibility);
  }, []);

  useEffect(() => {
    const updateFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    updateFullscreenState();
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useEffect(() => {
    const pauseForInactiveTab = () => {
      pausedRef.current = true;
      setPaused(true);
      document.title = INACTIVE_PAGE_TITLE;
    };
    const restoreActiveTab = () => {
      if (document.visibilityState === "hidden") return;
      document.title = PAGE_TITLE;
      pausedRef.current = interactionPausedRef.current;
      setPaused(interactionPausedRef.current);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") pauseForInactiveTab();
      else restoreActiveTab();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", pauseForInactiveTab);
    window.addEventListener("focus", restoreActiveTab);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", pauseForInactiveTab);
      window.removeEventListener("focus", restoreActiveTab);
      document.title = PAGE_TITLE;
    };
  }, []);

  const trendingRepoNames = useMemo(
    () =>
      trendingRepos
        .slice(0, 4)
        .map((repository) => repository.name)
        .join(","),
    [trendingRepos],
  );

  useEffect(() => {
    if (!trendingRepoNames) return;

    const controller = new AbortController();
    const refreshStarCounts = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(
          `/api/repository-stars?repos=${encodeURIComponent(trendingRepoNames)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) return;
        const counts = (await response.json()) as Record<
          string,
          { totalStars?: number; starsToday?: number }
        >;
        setTrendingRepos((current) =>
          current.map((repository) => {
            const nextCounts = counts[repository.name];
            if (!nextCounts) return repository;
            const totalStars = Number.isFinite(nextCounts.totalStars)
              ? Number(nextCounts.totalStars)
              : repository.totalStars;
            const starsToday = Number.isFinite(nextCounts.starsToday)
              ? Number(nextCounts.starsToday)
              : repository.starsToday;
            return totalStars !== repository.totalStars || starsToday !== repository.starsToday
              ? { ...repository, totalStars, starsToday }
              : repository;
          }),
        );
      } catch (error) {
        if (!controller.signal.aborted) console.error("Unable to refresh star counts", error);
      }
    };

    void refreshStarCounts();
    const timer = setInterval(refreshStarCounts, STAR_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [trendingRepoNames]);

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
      timer = setTimeout(schedule, delay);
    };
    void schedule();
    return () => {
      disposed = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [refresh, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    const loadTrending = async () => {
      try {
        const stored = localStorage.getItem(TRENDING_CACHE_KEY);
        if (stored) {
          const cached = JSON.parse(stored) as {
            expiresAt?: number;
            repositories?: TrendingRepository[];
          };
          if (
            cached.expiresAt &&
            cached.expiresAt > Date.now() &&
            Array.isArray(cached.repositories)
          ) {
            setTrendingRepos(cached.repositories);
            return;
          }
        }

        const response = await fetch(TRENDING_ENDPOINT, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Trending repositories could not load (${response.status}).`);
        }
        const repositories = ((await response.json()) as TrendingRepository[]).map(
          (repository) => ({
            ...repository,
            starsToday: Number(repository.starsToday) || 0,
            totalStars: Number(repository.totalStars) || 0,
          }),
        );
        setTrendingRepos(repositories);
        localStorage.setItem(
          TRENDING_CACHE_KEY,
          JSON.stringify({
            expiresAt: Date.now() + TRENDING_CACHE_TTL_MS,
            repositories,
          }),
        );
      } catch (error) {
        if (!controller.signal.aborted) console.error(error);
      } finally {
        if (!controller.signal.aborted) setTrendingLoading(false);
      }
    };

    void loadTrending();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadDevelopers = async () => {
      try {
        const stored = localStorage.getItem(DEVELOPERS_CACHE_KEY);
        if (stored) {
          const cached = JSON.parse(stored) as {
            expiresAt?: number;
            developers?: TrendingDeveloper[];
          };
          if (
            cached.expiresAt &&
            cached.expiresAt > Date.now() &&
            Array.isArray(cached.developers)
          ) {
            setDevelopers(cached.developers);
            return;
          }
        }

        const response = await fetch(DEVELOPERS_ENDPOINT, { signal: controller.signal });
        if (!response.ok)
          throw new Error(`Trending developers could not load (${response.status}).`);
        const nextDevelopers = (await response.json()) as TrendingDeveloper[];
        setDevelopers(nextDevelopers);
        localStorage.setItem(
          DEVELOPERS_CACHE_KEY,
          JSON.stringify({
            expiresAt: Date.now() + TRENDING_CACHE_TTL_MS,
            developers: nextDevelopers,
          }),
        );
      } catch (error) {
        if (!controller.signal.aborted) console.error(error);
      } finally {
        if (!controller.signal.aborted) setDevelopersLoading(false);
      }
    };

    void loadDevelopers();
    return () => controller.abort();
  }, []);

  // GitHub Archive only publishes once an hour, so the feed is replayed at a
  // human pace: one queued event every second, plus a clock tick that keeps
  // relative timestamps moving. When the batch runs out, it loops from the
  // start so the feed never goes quiet.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (pausedRef.current) return;
      let next = queueRef.current.shift();
      let restart = false;

      if (!next && poolRef.current.length) {
        queueRef.current = shuffled(poolRef.current);
        next = queueRef.current.shift();
        restart = true;
      }

      if (next) {
        const nextEvent = next;
        setEvents((current) => {
          const merged = restart ? [nextEvent] : [nextEvent, ...current];
          return merged.slice(0, MAX_VISIBLE_EVENTS);
        });
        setLoading(false);
      }
    }, REVEAL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const pendingSkeletons = Math.max(
    0,
    Math.min(MIN_VISIBLE_FEED_ROWS, fetchedEvents.length) - events.length,
  );

  const handleRefresh = () => {
    setRefreshKey((key) => key + 1);
    setLoading(events.length === 0);
  };

  const pauseStream = () => {
    interactionPausedRef.current = true;
    pausedRef.current = true;
    setPaused(true);
  };

  const resumeStream = () => {
    interactionPausedRef.current = false;
    if (document.visibilityState === "hidden" || !document.hasFocus()) return;
    pausedRef.current = false;
    setPaused(false);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 bg-background/95 py-2 backdrop-blur">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-[52px] items-center justify-between gap-5 rounded-2xl border border-border px-4 sm:px-5">
            <a className="flex min-w-0 items-center gap-3" href="/" aria-label="FindDevs home">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Code2 className="size-5" />
              </span>
              <span className="text-lg font-bold tracking-normal">
                Find<span className="text-primary">Devs</span>
              </span>
              <span className="hidden border-l border-border pl-3 text-xs text-muted-foreground sm:inline">
                Tracking the heartbeat of GitHub & see what's devs are cooking.
              </span>
            </a>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                onClick={async () => {
                  try {
                    if (document.fullscreenElement) await document.exitFullscreen();
                    else await document.documentElement.requestFullscreen();
                  } catch (error) {
                    console.error("Fullscreen mode is unavailable", error);
                  }
                }}
                className="relative flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-[0.96]"
              >
                <Maximize2
                  className={`absolute size-4 transition-[opacity,scale,filter] duration-150 [transition-timing-function:cubic-bezier(0.2,0,0,1)] ${
                    isFullscreen
                      ? "scale-[0.25] opacity-0 blur-[4px]"
                      : "scale-100 opacity-100 blur-0"
                  }`}
                  strokeWidth={1.5}
                />
                <Minimize2
                  className={`absolute size-4 transition-[opacity,scale,filter] duration-150 [transition-timing-function:cubic-bezier(0.2,0,0,1)] ${
                    isFullscreen
                      ? "scale-100 opacity-100 blur-0"
                      : "scale-[0.25] opacity-0 blur-[4px]"
                  }`}
                  strokeWidth={1.5}
                />
              </button>
              <a
                href="https://github.com/forzayt/Find_Devs"
                target="_blank"
                rel="noreferrer"
                aria-label="Fork FindDevs on GitHub"
                className="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <GitFork className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-0 px-4 sm:px-6 lg:grid-cols-[210px_minmax(0,1fr)_280px] lg:gap-7 lg:px-8">
        <aside className="border-b border-border py-4 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-68px)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:border-b-0 lg:py-7">
          <div className="hidden lg:block">
            {/* Project showcase hidden for now.
            <section className="px-3" aria-labelledby="showcase-title">
              <h2 id="showcase-title" className="text-sm font-semibold">
                Project showcase
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Submitting projects is easy! Making it alive is hard!
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowShowcase((value) => !value);
                  window.scrollTo({ top: 0 });
                }}
                aria-pressed={showShowcase}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background transition-[color,background-color,transform] duration-150 hover:bg-foreground/85 active:scale-[0.96]"
              >
                {showShowcase ? "Back to feed" : "Open showcase"}
                <ArrowUpRight
                  className={`size-3.5 transition-transform ${showShowcase ? "rotate-180" : ""}`}
                  strokeWidth={2}
                />
              </button>
            </section>
            */}
          </div>
        </aside>

        <section
          className={`min-w-0 py-6 lg:py-8 ${showShowcase ? "hidden" : ""}`}
          aria-label="GitHub activity feed"
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal sm:text-[28px]">
                The dev feed
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {" "}
                Keep rolling your eyes, maybe you'll find a brain back there.
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
            >
              <p className="text-muted-foreground">
                {error} {events.length > 0 ? "Showing the latest activity we could load." : ""}
              </p>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                Try again
              </Button>
            </div>
          )}

          {loading ? (
            <div className="space-y-3" aria-label="Loading activity" aria-busy="true">
              {[0, 1, 2].map((item) => (
                <FeedSkeleton key={item} />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center border border-dashed border-border px-6 text-center">
              <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Activity className="size-5" />
              </span>
              <h2 className="font-medium">
                {error
                  ? "The feed is taking a break"
                  : events.length
                    ? "Quiet on this channel"
                    : "No public activity yet"}
              </h2>
              <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
                {error
                  ? "GitHub Archive may be temporarily unavailable. Try again shortly."
                  : events.length
                    ? "New activity will show up as the archive streams."
                    : "New activity will appear here as the archive arrives."}
              </p>
            </div>
          ) : (
            <div
              className="space-y-3"
              aria-busy={pendingSkeletons > 0}
              onMouseEnter={pauseStream}
              onMouseLeave={resumeStream}
              onFocus={pauseStream}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  resumeStream();
                }
              }}
            >
              {events.map((event) => (
                <ActivityCard key={event.id} event={event} now={now} />
              ))}
              {Array.from({ length: pendingSkeletons }, (_, index) => (
                <FeedSkeleton key={`pending-${index}`} />
              ))}
            </div>
          )}
        </section>

        {showShowcase && <ProjectShowcase />}

        <aside className="hidden min-w-0 space-y-7 py-8 lg:sticky lg:top-[68px] lg:block lg:max-h-[calc(100vh-68px)] lg:self-start lg:overflow-y-auto lg:overscroll-contain">
          <section aria-labelledby="trending-title">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="trending-title" className="text-sm font-semibold">
                Trending repositories
              </h2>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </div>
            {trendingLoading ? (
              <div
                className="space-y-3"
                aria-label="Loading trending repositories"
                aria-busy="true"
              >
                {[0, 1, 2, 3].map((item) => (
                  <TrendingSkeleton key={item} />
                ))}
              </div>
            ) : trendingRepos.length ? (
              <ol className="space-y-1">
                {trendingRepos.slice(0, 4).map((repository, index) => (
                  <li key={repository.name} className="flex items-start gap-3 py-2">
                    <span className="pt-0.5 font-mono text-xs text-muted-foreground">
                      0{index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={repoUrl(repository.name)}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs font-medium hover:text-primary"
                      >
                        {repository.name}
                      </a>
                      <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="min-w-0 truncate">
                          <AnimatedNumber value={repository.starsToday} /> stars today
                          {repository.language ? ` · ${repository.language}` : ""}
                        </span>
                        {Number(repository.totalStars) > 0 && (
                          <span
                            className="ml-auto inline-flex shrink-0 items-center gap-1 text-foreground"
                            title={`${Number(repository.totalStars).toLocaleString()} total stars`}
                          >
                            <Star
                              className="size-3 fill-current text-amber-500"
                              strokeWidth={1.5}
                            />
                            <AnimatedNumber value={Number(repository.totalStars)} />
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <SidebarEmpty>GitHub Trending is unavailable right now.</SidebarEmpty>
            )}
          </section>

          <section className="border-t border-border pt-6" aria-labelledby="developers-title">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="developers-title" className="text-sm font-semibold">
                Around the community
              </h2>
              <Users className="size-4 text-muted-foreground" />
            </div>
            {developersLoading ? (
              <div className="space-y-3" aria-label="Loading trending developers" aria-busy="true">
                {[0, 1, 2, 3, 4].map((item) => (
                  <DeveloperSkeleton key={item} />
                ))}
              </div>
            ) : developers.length ? (
              <ul className="space-y-3">
                {developers.slice(0, 5).map((developer) => (
                  <li key={developer.login}>
                    <DevStatsHoverCard
                      login={developer.login}
                      avatarUrl={developer.avatarUrl}
                      align="end"
                    >
                      <div className="flex items-center gap-2.5">
                        <DevStatsTrigger>
                          <Avatar className="size-8">
                            <AvatarImage src={developer.avatarUrl} alt="" />
                            <AvatarFallback>
                              {developer.login.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </DevStatsTrigger>
                        <div className="min-w-0">
                          <DevStatsTrigger>
                            <a
                              href={`https://github.com/${encodeURIComponent(developer.login)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate text-xs font-medium hover:text-primary"
                            >
                              {developer.name || developer.login}
                            </a>
                          </DevStatsTrigger>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            @{developer.login}
                            {developer.popularRepository ? ` · ${developer.popularRepository}` : ""}
                          </p>
                        </div>
                      </div>
                    </DevStatsHoverCard>
                  </li>
                ))}
              </ul>
            ) : (
              <SidebarEmpty>GitHub Trending Developers is unavailable right now.</SidebarEmpty>
            )}
          </section>

          <section className="border-t border-border pt-6" aria-labelledby="contribute-title">
            <h2 id="contribute-title" className="text-sm font-semibold">
              Looking to contribute?
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Discover open-source projects that match your interests and skills.
            </p>
            <a
              href="https://findopensource.dev/explore"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background transition-[color,background-color,transform] duration-150 hover:bg-foreground/85 active:scale-[0.96]"
            >
              Find a project
              <ArrowUpRight className="size-3.5" strokeWidth={2} />
            </a>
          </section>
        </aside>
      </div>

      <div
        role="status"
        aria-live="polite"
        className={`fixed top-[84px] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background shadow-lg transition-[opacity,transform] duration-150 ease-out ${
          paused ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <Pause className="size-3.5" strokeWidth={1.5} />
        Feed paused
      </div>

      <button
        type="button"
        aria-label="Scroll to top"
        title="Scroll to top"
        tabIndex={showScrollTop ? 0 : -1}
        onClick={() => {
          const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        }}
        className={`fixed right-5 bottom-5 z-30 flex size-10 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-[opacity,transform] duration-150 ease-out active:scale-[0.96] sm:right-7 sm:bottom-7 ${
          showScrollTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <ArrowUp className="size-4" strokeWidth={2} />
      </button>
    </main>
  );
}

function eventUrl(event: GithubEvent) {
  const payload = event.payload;
  const pull = payload.pull_request as { html_url?: string; number?: number } | undefined;
  const issue = payload.issue as { html_url?: string; number?: number } | undefined;
  const release = payload.release as { html_url?: string; tag_name?: string } | undefined;
  if (event.type === "PullRequestEvent") {
    if (pull?.html_url) return pull.html_url;
    const pullNumber =
      typeof payload.number === "number"
        ? payload.number
        : typeof pull?.number === "number"
          ? pull.number
          : undefined;
    if (pullNumber) return `${repoUrl(event.repo.name)}/pull/${pullNumber}`;
  }
  if (event.type === "IssuesEvent") {
    if (issue?.html_url) return issue.html_url;
    const issueNumber =
      typeof payload.number === "number"
        ? payload.number
        : typeof issue?.number === "number"
          ? issue.number
          : undefined;
    if (issueNumber) return `${repoUrl(event.repo.name)}/issues/${issueNumber}`;
  }
  if (event.type === "ReleaseEvent") {
    if (release?.html_url) return release.html_url;
    if (release?.tag_name) {
      return `${repoUrl(event.repo.name)}/releases/tag/${encodeURIComponent(release.tag_name)}`;
    }
  }
  if (event.type === "PushEvent") {
    if (typeof payload.head === "string") {
      return `${repoUrl(event.repo.name)}/commit/${encodeURIComponent(payload.head)}`;
    }
    if (typeof payload.ref === "string") {
      const branch = payload.ref.replace("refs/heads/", "");
      return `${repoUrl(event.repo.name)}/tree/${encodeURIComponent(branch)}`;
    }
  }
  if (event.type === "CreateEvent" && typeof payload.ref === "string") {
    return `${repoUrl(event.repo.name)}/tree/${encodeURIComponent(payload.ref)}`;
  }
  return repoUrl(event.repo.name);
}

function repoUrl(name: string) {
  return `https://github.com/${name.split("/").map(encodeURIComponent).join("/")}`;
}

function eventCopy(event: GithubEvent) {
  const payload = event.payload;
  if (event.type === "PushEvent") {
    const ref =
      typeof payload.ref === "string" ? payload.ref.replace("refs/heads/", "") : "a branch";
    return { verb: "pushed to", title: ref, icon: GitCommitHorizontal, kind: "push" };
  }
  if (event.type === "CreateEvent") {
    const refType = typeof payload.ref_type === "string" ? payload.ref_type : "repository";
    const name = typeof payload.ref === "string" ? payload.ref : event.repo.name;
    return {
      verb: "created a",
      title: refType === "repository" ? "new repository" : `${refType} ${name}`,
      icon: Box,
      kind: "create",
    };
  }
  if (event.type === "PullRequestEvent") {
    const pull = payload.pull_request as { title?: string; number?: number } | undefined;
    const action = typeof payload.action === "string" ? payload.action : "updated";
    return {
      verb: `${action} a pull request in`,
      title: pull?.title ?? "Pull request",
      icon: GitPullRequest,
      kind: "pull",
    };
  }
  if (event.type === "ReleaseEvent") {
    const release = payload.release as { name?: string; tag_name?: string } | undefined;
    return {
      verb: "published a release in",
      title: release?.name || release?.tag_name || "New release",
      icon: Rocket,
      kind: "release",
    };
  }
  const issue = payload.issue as { title?: string } | undefined;
  const action = typeof payload.action === "string" ? payload.action : "updated";
  return {
    verb: `${action} an issue in`,
    title: issue?.title ?? "Issue",
    icon: CircleDot,
    kind: "issue",
  };
}

function ProjectShowcase() {
  const { projects, loading } = useShowcaseProjects();
  return (
    <section className="min-w-0 py-6 lg:py-8" aria-label="Project showcase">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal sm:text-[28px]">
            Project showcase
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Submitting projects is easy! Making it alive is hard!
          </p>
        </div>
        <a
          href={projectSubmissionUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background transition-[color,background-color,transform] duration-150 hover:bg-foreground/85 active:scale-[0.96]"
        >
          Submit your project
          <ArrowUpRight className="size-3.5" strokeWidth={2} />
        </a>
      </div>
      <ul className="space-y-3" aria-busy={loading} aria-label="Showcase projects">
        {loading
          ? [0, 1, 2].map((item) => <ShowcaseSkeleton key={item} />)
          : projects.map((project) => {
              const stack = showcaseProjectStack(project);
              return (
                <li key={project.url}>
                  <article className="overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-ring/60">
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <a
                          href={showcaseProjectUrl(project)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium hover:text-primary"
                        >
                          {project.name}
                        </a>
                        {project.status && (
                          <span className="rounded-sm bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {project.status}
                          </span>
                        )}
                      </div>
                      {project.description && (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {project.description}
                        </p>
                      )}
                      {stack.length > 0 && (
                        <p className="mt-3 text-[11px] text-muted-foreground">
                          {stack.join(" · ")}
                        </p>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
      </ul>
    </section>
  );
}

function ActivityCard({ event, now }: { event: GithubEvent; now: number }) {
  const copy = eventCopy(event);
  const Icon = copy.icon;
  const badgeLabel = kindLabel(copy.kind);
  const title = copy.title.trim();
  // Skip the title when it only repeats the badge label (e.g. "Pull request"
  // next to the PULL REQUEST badge) so the card shows it once.
  const showTitle = title.length > 0 && title.toLowerCase() !== badgeLabel.toLowerCase();
  const branch =
    typeof event.payload.ref === "string" ? event.payload.ref.replace("refs/heads/", "") : "";
  const head = typeof event.payload.head === "string" ? event.payload.head : "";
  const commits = Array.isArray(event.payload["commits"]) ? event.payload["commits"] : [];
  const firstCommit = commits[0] as { message?: string } | undefined;
  const cleanMessage = firstCommit?.message?.split("\n")[0];
  // The archive lags by an hour or more, so show a stable simulated age per
  // event (1 minute to 5 hours) instead of the stale archived timestamp.
  const time = useMemo(() => new Date(Date.now() - simulatedAgeMs(event.id)), [event.id]);
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-ring/60 animate-in fade-in slide-in-from-top-1 duration-300">
      <DevStatsHoverCard login={event.actor.login} avatarUrl={event.actor.avatar_url}>
        <div className="flex items-start gap-3.5 p-4 sm:p-5">
          <DevStatsTrigger>
            <a
              href={`https://github.com/${encodeURIComponent(event.actor.login)}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`${event.actor.login} on GitHub`}
              className="mt-0.5 shrink-0"
            >
              <Avatar className="size-9">
                <AvatarImage src={event.actor.avatar_url} alt="" />
                <AvatarFallback>{event.actor.login.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
            </a>
          </DevStatsTrigger>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[13px] leading-5">
              <DevStatsTrigger>
                <a
                  href={`https://github.com/${encodeURIComponent(event.actor.login)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold hover:text-primary"
                >
                  {event.actor.login}
                </a>
              </DevStatsTrigger>
              <span className="text-muted-foreground">{copy.verb}</span>
              <a
                href={repoUrl(event.repo.name)}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                {event.repo.name}
              </a>
              <time
                className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground"
                dateTime={time.toISOString()}
                title={time.toLocaleString()}
              >
                {relativeTime(time, now)}
              </time>
            </div>
            {showTitle && <p className="mt-2 text-sm font-medium leading-5">{copy.title}</p>}
            {event.type === "PushEvent" && (
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {cleanMessage ??
                  (head
                    ? `Commit ${head.slice(0, 7)}${branch ? ` · ${branch}` : ""}`
                    : branch
                      ? `Updates to ${branch}`
                      : "Pushed new changes")}
              </p>
            )}
            {event.type === "PullRequestEvent" && typeof event.payload.action === "string" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {event.payload.action === "opened"
                  ? "A new contribution is ready for review."
                  : "Pull request activity"}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <a
                href={eventUrl(event)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${badgeLabel.toLowerCase()}: ${copy.title}`}
                className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[10px] font-medium transition-[opacity,transform] hover:opacity-80 active:scale-[0.96] activity-kind activity-kind-${copy.kind}`}
              >
                <Icon className="size-3" />
                {badgeLabel}
              </a>
              {event.type === "PushEvent" && head && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {head.slice(0, 7)}
                </span>
              )}
            </div>
          </div>
        </div>
      </DevStatsHoverCard>
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

const MIN_SIMULATED_AGE_MS = 60 * 1000;
const MAX_SIMULATED_AGE_MS = 5 * 60 * 60 * 1000;

// Deterministic per-event age so a card keeps a stable relative time across
// re-renders and loop replays, while the feed as a whole looks recent.
function simulatedAgeMs(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const fraction = (hash >>> 0) / 4294967295;
  return MIN_SIMULATED_AGE_MS + fraction * (MAX_SIMULATED_AGE_MS - MIN_SIMULATED_AGE_MS);
}

function relativeTime(date: Date, nowMs = Date.now()) {
  const seconds = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function ShowcaseSkeleton() {
  return (
    <li
      className="animate-pulse overflow-hidden rounded-lg border border-border bg-card p-4 sm:p-5"
      aria-hidden="true"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="h-3.5 w-32 rounded bg-muted" />
        <div className="h-3 w-12 rounded bg-muted" />
      </div>
      <div className="mt-3 h-3 w-full rounded bg-muted" />
      <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
      <div className="mt-3.5 flex gap-3">
        <div className="h-2.5 w-12 rounded bg-muted" />
        <div className="h-2.5 w-16 rounded bg-muted" />
      </div>
    </li>
  );
}

function FeedSkeleton() {
  return (
    <div
      className="flex animate-pulse gap-3.5 rounded-lg border border-border bg-card p-5"
      aria-hidden="true"
    >
      <div className="size-9 shrink-0 rounded-full bg-muted" />
      <div className="flex-1 space-y-3">
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
      </div>
    </div>
  );
}

function TrendingSkeleton() {
  return (
    <div className="flex animate-pulse gap-3 py-1" aria-hidden="true">
      <div className="h-3 w-4 rounded bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-2.5 w-1/2 rounded bg-muted" />
      </div>
    </div>
  );
}

function DeveloperSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-2.5" aria-hidden="true">
      <div className="size-8 shrink-0 rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="h-2.5 w-3/4 rounded bg-muted" />
      </div>
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const displayedValueRef = useRef(value);

  useEffect(() => {
    const startValue = displayedValueRef.current;
    if (startValue === value) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      displayedValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    const duration = 600;
    const startedAt = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(startValue + (value - startValue) * eased);
      displayedValueRef.current = nextValue;
      setDisplayValue(nextValue);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="tabular-nums">{displayValue.toLocaleString()}</span>;
}

function SidebarEmpty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-xs leading-5 text-muted-foreground">{children}</p>;
}
