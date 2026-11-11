// Server-side GitHub API access with a graceful fallback when the shared
// unauthenticated quota is exhausted. Requests first go out directly (with
// GITHUB_TOKEN when available), then through public URL forwarders and the
// free proxy pool published by TheSpeedX. Credentials are never sent to a
// proxy, because only public repository data is requested here.

const GITHUB_API = "https://api.github.com";

// A 401 means a bad token, 403 an exhausted shared quota, 429 an explicit
// back-off. All three are worth retrying from another IP.
const RETRY_STATUS = new Set([401, 403, 429]);

const DIRECT_TIMEOUT_MS = 8_000;
const FALLBACK_TIMEOUT_MS = 8_000;

// TheSpeedX keeps a fresh list of free HTTP proxies, updated daily.
const PROXY_LIST_URL = "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt";
const PROXY_CACHE_MS = 10 * 60 * 1000;
const PROXY_ATTEMPTS = 20;

// Public URL-forwarding proxies work on every runtime, including the deployed
// Cloudflare Worker. They are raced against the raw proxy pool below.
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
  if (!response.ok && response.status !== 304) {
    throw new Error(`Proxy responded with ${response.status}.`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== 304 && !contentType.includes("json")) {
    throw new Error("Proxy returned a non-JSON response.");
  }
  return response;
}

export type GithubApiOptions = {
  signal?: AbortSignal | undefined;
  headers?: HeadersInit | undefined;
};

/**
 * Fetch a resource from api.github.com. Returns the upstream response even
 * when it is rate-limited, so callers can decide how to degrade.
 */
export async function fetchGithubApi(
  path: string,
  options: GithubApiOptions = {},
): Promise<Response> {
  const target = new URL(`${GITHUB_API}/${path.replace(/^\/+/, "")}`);

  const baseHeaders = new Headers({
    accept: "application/vnd.github+json",
    "user-agent": "FindDevs/1.0 (+https://github.com/forzayt/Find_Devs)",
    "x-github-api-version": "2022-11-28",
  });
  new Headers(options.headers).forEach((value, key) => baseHeaders.set(key, value));

  const directHeaders = new Headers(baseHeaders);
  const token = githubToken();
  if (token) directHeaders.set("authorization", `Bearer ${token}`);

  let direct: Response | undefined;
  try {
    direct = await fetchWithTimeout(
      target,
      { headers: directHeaders, cache: "no-store" },
      DIRECT_TIMEOUT_MS,
      options.signal,
    );
  } catch {
    direct = undefined;
  }

  if (direct && !RETRY_STATUS.has(direct.status)) return direct;

  // Fallbacks never receive the token: free proxies and public URL forwarders
  // are untrusted, and only public repository data is requested.
  const proxyHeaders = new Headers(baseHeaders);
  const attempts: Array<() => Promise<Response>> = URL_PROXIES.map(
    (buildUrl) => () =>
      fetchWithTimeout(
        buildUrl(target.toString()),
        { headers: proxyHeaders, cache: "no-store" },
        FALLBACK_TIMEOUT_MS,
        options.signal,
      ),
  );

  const proxies = await loadHttpProxies();
  for (const proxy of proxies.slice(0, PROXY_ATTEMPTS)) {
    attempts.push(() =>
      fetchViaRawProxy(target.toString(), proxyHeaders, proxy, options.signal),
    );
  }

  if (attempts.length > 0) {
    try {
      return await Promise.any(attempts.map((attempt) => attempt().then(usable)));
    } catch {
      // Every fallback failed; fall through to the direct response.
    }
  }

  if (direct) return direct;
  throw new Error("GitHub is unreachable right now.");
}
