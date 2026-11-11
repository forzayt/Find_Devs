import { GitCommitHorizontal, Star } from "lucide-react";
import { useState, type ReactElement, type ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useDevStats } from "@/hooks/use-dev-stats";
import type { DevStats } from "@/lib/dev-stats";
import { relativeTime } from "@/lib/relative-time";

type DevStatsHoverCardProps = {
  login: string;
  avatarUrl?: string | undefined;
  children: ReactNode;
  align?: "start" | "center" | "end";
};

/**
 * Provides the developer summary for every `DevStatsTrigger` inside it, so the
 * avatar and the username can share one card. Data comes from ungh.cc and is
 * fetched on first open.
 */
export function DevStatsHoverCard({
  login,
  avatarUrl,
  children,
  align = "start",
}: DevStatsHoverCardProps) {
  const [open, setOpen] = useState(false);
  const { stats, loading } = useDevStats(login, open);

  return (
    <HoverCard openDelay={250} closeDelay={200} onOpenChange={setOpen}>
      {children}
      <HoverCardContent
        align={align}
        sideOffset={8}
        className="w-[19rem] rounded-xl border-border bg-popover p-0 text-popover-foreground"
      >
        {stats ? (
          <DevStatsBody stats={stats} avatarUrl={avatarUrl} />
        ) : (
          <DevStatsSkeleton login={login} avatarUrl={avatarUrl} loading={loading} />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

/** Marks one element (avatar, username, …) as an opener for the surrounding card. */
export function DevStatsTrigger({ children }: { children: ReactElement }) {
  return <HoverCardTrigger asChild>{children}</HoverCardTrigger>;
}

function DevStatsBody({ stats, avatarUrl }: { stats: DevStats; avatarUrl?: string | undefined }) {
  const image = stats.avatarUrl ?? avatarUrl;

  return (
    <div className="space-y-3.5 p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-10">
          <AvatarImage src={image} alt="" />
          <AvatarFallback>{stats.login.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-5">{stats.name || stats.login}</p>
          <p className="truncate text-[11px] text-muted-foreground">@{stats.login}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {stats.publicRepos.toLocaleString()} repos · {stats.totalStars.toLocaleString()} stars
            {stats.twitter ? ` · @${stats.twitter}` : ""}
          </p>
        </div>
      </div>

      {stats.latestPush && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <GitCommitHorizontal className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            Last push {relativeTime(new Date(stats.latestPush.at))} to{" "}
            <span className="font-medium text-foreground/80">{stats.latestPush.repository}</span>
          </p>
        </div>
      )}

      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Top repositories
        </p>
        {stats.topRepositories.length ? (
          <ul className="mt-1.5 space-y-1.5">
            {stats.topRepositories.map((repository) => (
              <li key={repository.url} className="flex items-center gap-2 text-[11px]">
                <a
                  href={repository.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate font-medium hover:text-primary"
                  title={repository.description}
                >
                  {repository.name}
                </a>
                {repository.pushedAt && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {relativeTime(new Date(repository.pushedAt))}
                  </span>
                )}
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground"
                  title={`${repository.stars.toLocaleString()} stars`}
                >
                  <Star className="size-3 fill-current text-amber-500" strokeWidth={1.5} />
                  {repository.stars.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[11px] text-muted-foreground">No public repositories yet.</p>
        )}
      </div>

      <a
        href={`https://github.com/${encodeURIComponent(stats.login)}`}
        target="_blank"
        rel="noreferrer"
        className="block border-t border-border pt-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        View @{stats.login} on GitHub
      </a>
    </div>
  );
}

function DevStatsSkeleton({
  login,
  avatarUrl,
  loading,
}: {
  login: string;
  avatarUrl?: string | undefined;
  loading: boolean;
}) {
  if (!loading) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-sm font-semibold">@{login}</p>
        <p className="text-[11px] leading-5 text-muted-foreground">
          Stats are unavailable right now.
        </p>
        <a
          href={`https://github.com/${encodeURIComponent(login)}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          View on GitHub
        </a>
      </div>
    );
  }

  return (
    <div className="animate-pulse space-y-3.5 p-4" aria-busy="true" aria-label={`Loading @${login}`}>
      <div className="flex items-center gap-3">
        <Avatar className="size-10">
          <AvatarImage src={avatarUrl} alt="" />
          <AvatarFallback>{login.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-2.5 w-16 rounded bg-muted" />
        </div>
      </div>
      <div className="h-10 rounded-lg bg-muted" />
      <div className="space-y-1.5">
        <div className="h-2.5 w-24 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-4/5 rounded bg-muted" />
      </div>
    </div>
  );
}
