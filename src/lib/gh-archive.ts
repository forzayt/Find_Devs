// GitHub Archive (https://www.gharchive.org) publishes every public GitHub
// event as hourly NDJSON dumps on data.gharchive.org. Records use the exact
// same schema as the REST events feed, so the UI can consume them unchanged —
// and no GitHub API token or shared quota is ever involved.

export type ArchiveEvent = {
  id: string;
  type: string;
  actor: { login: string; avatar_url: string };
  repo: { name: string };
  payload: Record<string, unknown>;
  created_at: string;
};

const ARCHIVE_BASE = "https://data.gharchive.org";
const ARCHIVE_HOURS_BACK = 4;
const ARCHIVE_LIMIT = 100;

const HOUR_MS = 60 * 60 * 1000;
const HOUR_TIMEOUT_MS = 12_000;
const TOTAL_TIMEOUT_MS = 25_000;
const MAX_DECOMPRESSED_BYTES = 96 * 1024 * 1024;
const CACHE_MS = 5 * 60 * 1000;

const SUPPORTED_EVENT_TYPES = new Set([
  "PushEvent",
  "CreateEvent",
  "PullRequestEvent",
  "ReleaseEvent",
  "IssuesEvent",
]);

type ArchiveCache = {
  label: string;
  storedAt: number;
  events: ArchiveEvent[];
};

let cache: ArchiveCache | undefined;

function hourLabel(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    String(date.getUTCHours()),
  ].join("-");
}

function timeoutSignal(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function isArchiveEvent(value: unknown): value is ArchiveEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ArchiveEvent>;
  return (
    typeof event.type === "string" &&
    SUPPORTED_EVENT_TYPES.has(event.type) &&
    typeof event.created_at === "string" &&
    typeof event.repo?.name === "string" &&
    typeof event.actor?.login === "string" &&
    typeof event.id === "string"
  );
}

// Keep only the newest events. Dumps are written in chronological order, so a
// bounded rolling window is enough and keeps memory flat for the whole file.
function pushEvent(events: ArchiveEvent[], event: ArchiveEvent, limit: number) {
  events.push(event);
  if (events.length > limit) events.shift();
}

async function readHour(
  label: string,
  limit: number,
  signal?: AbortSignal,
): Promise<ArchiveEvent[] | undefined> {
  let response: Response;
  try {
    response = await fetch(`${ARCHIVE_BASE}/${label}.json.gz`, {
      headers: { accept: "application/gzip" },
      cache: "no-store",
      signal: timeoutSignal(HOUR_TIMEOUT_MS, signal),
    });
  } catch {
    return undefined;
  }

  if (!response.ok || !response.body) return undefined;

  const events: ArchiveEvent[] = [];
  const reader = response.body.pipeThrough(new DecompressionStream("gzip")).getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let consumed = 0;

  const consumeLines = (chunk: string) => {
    const lines = chunk.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (isArchiveEvent(parsed)) pushEvent(events, parsed, limit);
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      consumed += value.byteLength;
      consumeLines(decoder.decode(value, { stream: true }));
      if (consumed >= MAX_DECOMPRESSED_BYTES || signal?.aborted) {
        await reader.cancel();
        break;
      }
    }
    if (!signal?.aborted) {
      pending += decoder.decode();
      consumeLines(`${pending}\n`);
    }
  } catch {
    // A truncated or corrupt dump is no worse than no feed at all.
    if (!events.length) return undefined;
  }

  return events.length ? events : undefined;
}

export type ArchiveFeed = { label: string; events: ArchiveEvent[] };

export async function loadArchiveFeed(
  limit = ARCHIVE_LIMIT,
  signal?: AbortSignal,
): Promise<ArchiveFeed | undefined> {
  const wanted = Math.min(Math.max(limit, 1), ARCHIVE_LIMIT);

  if (cache && Date.now() - cache.storedAt < CACHE_MS) {
    return { label: cache.label, events: cache.events.slice(0, wanted) };
  }

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  // The current hour is still being written, so start one hour back.
  for (let hoursAgo = 1; hoursAgo <= ARCHIVE_HOURS_BACK; hoursAgo += 1) {
    if (Date.now() >= deadline || signal?.aborted) break;

    const label = hourLabel(new Date(Date.now() - hoursAgo * HOUR_MS));
    const events = await readHour(label, wanted, signal);
    if (events?.length) {
      events.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      cache = { label, storedAt: Date.now(), events };
      return { label, events };
    }
  }

  return undefined;
}

export function archiveEtag(feed: ArchiveFeed): string {
  return `"gharchive-${feed.label}-${feed.events[0]?.id ?? "empty"}"`;
}
