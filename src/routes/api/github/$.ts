import { createFileRoute } from "@tanstack/react-router";

const GITHUB_API = "https://api.github.com";

// Only the endpoints the feed actually uses may be proxied. This keeps the
// route from becoming an open relay to the GitHub API.
const ALLOWED_PATH = /^(?:events|repos\/[^/]+\/[^/]+(?:\/commits\/[^/]+)?)$/;

// Forward only the headers the client relies on. In particular, never copy
// content-encoding/content-length: fetch already decoded the upstream body.
const FORWARDED_HEADERS = [
  "content-type",
  "etag",
  "x-poll-interval",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "retry-after",
];

// A 401 means a bad token, 403 an exhausted shared quota, 429 an explicit
// back-off. All three are worth retrying from another IP.
const RETRY_STATUS = new Set([401, 403, 429]);

const DIRECT_TIMEOUT_MS = 8_000;
const FALLBACK_TIMEOUT_MS = 8_000;

// TheSpeedX keeps a fresh list of free HTTP proxies, updated daily.
const PROXY_LIST_URL = "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt";
const PROXY_CACHE_MS = 10 * 60 * 1000;
const PROXY_ATTEMPTS = 20;

// Public URL-forwarding proxies work on every runtime (including Cloudflare
// Workers). They are raced against the raw proxies below.
const URL_PROXIES: Array<(target: string) => string> = [
  (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
];

type NodeProxyRuntime = {
  ProxyAgent: new (uri: string) => unknown;
  fetch: (input: string | URL, init: Record<string, unknown>) => Promise<Response>;
};

let proxyCache: { loadedAt: number; proxies: string[] } | undefined;

function githubToken(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.["GITHUB_TOKEN"] ?? env?.["GITHUB_API_TOKEN"];
}

function withTimeout(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit,
  ms: number,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(url, { ...init, signal: withTimeout(ms, signal) });
}

function forward(response: Response): Response {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function loadHttpProxies(): Promise<string[]> {
  if (proxyCache && Date.now() - proxyCache.loadedAt < PROXY_CACHE_MS) {
    return proxyCache.proxies;
  }

  try {
    const response = await fetchWithTimeout(PROXY_LIST_URL, { cache: "no-store" }, DIRECT_TIMEOUT_MS);
    if (!response.ok) return proxyCache?.proxies ?? [];

    const proxies = (await response.text())
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(line));

    for (let i = proxies.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = proxies[i]!;
      proxies[i] = proxies[j]!;
      proxies[j] = swap;
    }

    proxyCache = { loadedAt: Date.now(), proxies };
    return proxies;
  } catch {
    return proxyCache?.proxies ?? [];
  }
}

async function loadNodeProxyRuntime(): Promise<NodeProxyRuntime | undefined> {
  try {
    // createRequire keeps this out of the bundler's module graph, so the
    // deployed Cloudflare Worker never tries to include Node's networking
    // stack. In the Worker, this simply throws and is ignored.
    const { createRequire } = await import("node:module");
    const require = createRequire(`${process.cwd()}/`);
    return require("undici") as NodeProxyRuntime;
  } catch {
    return undefined;
  }
}

async function fetchViaRawProxy(
  target: string,
  headers: Headers,
  proxy: string,
  signal?: AbortSignal,
): Promise<Response> {
  const runtime = await loadNodeProxyRuntime();
  if (!runtime) throw new Error("Raw proxies are unavailable in this runtime.");
  return runtime.fetch(target, {
    headers: Object.fromEntries(headers.entries()),
    dispatcher: new runtime.ProxyAgent(`http://${proxy}`),
    signal: withTimeout(FALLBACK_TIMEOUT_MS, signal),
  });
}

function usable(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok && response.status !== 304) {
    throw new Error(`Proxy responded with ${response.status}.`);
  }
  if (response.status !== 304 && !contentType.includes("json")) {
    throw new Error("Proxy returned a non-JSON response.");
  }
  return response;
}

export const Route = createFileRoute("/api/github/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const path = (params._splat ?? "").replace(/^\/+/, "");
        if (!ALLOWED_PATH.test(path)) {
          return Response.json({ message: "Unknown GitHub endpoint." }, { status: 404 });
        }

        const target = new URL(`${GITHUB_API}/${path}`);
        new URL(request.url).searchParams.forEach((value, key) => {
          target.searchParams.set(key, value);
        });

        const baseHeaders = new Headers({
          accept: "application/vnd.github+json",
          "user-agent": "FindDevs",
          "x-github-api-version": "2022-11-28",
        });
        const etag = request.headers.get("if-none-match");
        if (etag) baseHeaders.set("if-none-match", etag);

        const directHeaders = new Headers(baseHeaders);
        const token = githubToken();
        if (token) directHeaders.set("authorization", `Bearer ${token}`);

        let direct: Response | undefined;
        try {
          direct = await fetchWithTimeout(
            target,
            { headers: directHeaders, cache: "no-store" },
            DIRECT_TIMEOUT_MS,
            request.signal,
          );
        } catch {
          direct = undefined;
        }

        if (direct && !RETRY_STATUS.has(direct.status)) {
          return forward(direct);
        }

        // Fallbacks never receive the token: free proxies and public URL
        // forwarders are untrusted, and the feed only needs public data.
        const proxyHeaders = new Headers(baseHeaders);
        const attempts: Array<() => Promise<Response>> = URL_PROXIES.map(
          (buildUrl) => () =>
            fetchWithTimeout(
              buildUrl(target.toString()),
              { headers: proxyHeaders, cache: "no-store" },
              FALLBACK_TIMEOUT_MS,
              request.signal,
            ),
        );

        const proxies = await loadHttpProxies();
        for (const proxy of proxies.slice(0, PROXY_ATTEMPTS)) {
          attempts.push(() => fetchViaRawProxy(target.toString(), proxyHeaders, proxy, request.signal));
        }

        if (attempts.length > 0) {
          const raced = attempts.map((attempt) => attempt().then(usable));
          try {
            return forward(await Promise.any(raced));
          } catch {
            // Every fallback failed; fall through to the direct response.
          }
        }

        if (direct) return forward(direct);
        return Response.json({ message: "GitHub is unreachable right now." }, { status: 502 });
      },
    },
  },
});
