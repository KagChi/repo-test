import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Default upstream notes API base URL. */
export const DEFAULT_API_BASE_URL = "http://localhost:3001";

/**
 * Directories that may contain the browser bundle.
 *
 * When running from `src` (`bun run start`, `bun --watch`) the bundle lives in
 * `../dist/client`; when running the bundled `dist/index.js` it lives next to it
 * in `./client`.
 */
const DEFAULT_ASSETS_DIRS = [
  new URL("../dist/client/", import.meta.url),
  new URL("./client/", import.meta.url),
];

/** Directory containing static HTML/CSS served as-is. */
const DEFAULT_STATIC_DIR = new URL("./client/", import.meta.url);

export interface WebAppOptions {
  /** Upstream API base URL. Defaults to `API_BASE_URL` or {@link DEFAULT_API_BASE_URL}. */
  apiBaseUrl?: string;
  /** Directory containing `app.js`. Defaults to `dist/client`. */
  assetsDir?: string | URL;
  /** Directory containing `index.html` and `styles.css`. Defaults to `src/client`. */
  staticDir?: string | URL;
  /** Upstream fetch implementation, injectable for tests. Defaults to global `fetch`. */
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export interface WebApp {
  /** Handles a single request without opening a listener. */
  fetch(request: Request): Promise<Response>;
  /** Resolves the configured upstream API base URL. */
  readonly apiBaseUrl: string;
}

const HTML_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/html; charset=utf-8",
};

const CSS_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/css; charset=utf-8",
};

const JS_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/javascript; charset=utf-8",
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** Resolves the API base URL from `API_BASE_URL`, falling back to the default. */
export function resolveApiBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.API_BASE_URL?.trim();
  return raw !== undefined && raw.length > 0 ? raw.replace(/\/+$/, "") : DEFAULT_API_BASE_URL;
}

function textResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function resolveDirectory(directory: string | URL): URL {
  if (directory instanceof URL) {
    return directory;
  }

  const resolved = resolve(directory);
  return pathToFileURL(resolved.endsWith("/") ? resolved : `${resolved}/`);
}

function isPathInside(base: URL, candidate: URL): boolean {
  return candidate.href.startsWith(base.href);
}

async function serveFile(
  request: Request,
  baseDirectory: URL,
  relativePath: string,
  headers: Record<string, string>,
): Promise<Response | null> {
  let fileUrl: URL;
  try {
    fileUrl = new URL(relativePath, baseDirectory);
  } catch {
    return null;
  }

  if (!isPathInside(baseDirectory, fileUrl)) {
    return null;
  }

  const file = Bun.file(fileUrl);
  if (!(await file.exists())) {
    return null;
  }

  const body = request.method === "HEAD" ? null : await file.arrayBuffer();
  return new Response(body, { status: 200, headers });
}

/** Tries each directory in order and returns the first file that exists. */
async function serveFromDirectories(
  request: Request,
  directories: URL[],
  relativePath: string,
  headers: Record<string, string>,
): Promise<Response | null> {
  for (const directory of directories) {
    const response = await serveFile(request, directory, relativePath, headers);
    if (response !== null) {
      return response;
    }
  }
  return null;
}

/**
 * Forwards a browser request to the notes API.
 *
 * Method, request body, status, and all other end-to-end headers (including
 * `X-Cache`) are preserved. Hop-by-hop headers are dropped.
 */
async function proxyToApi(
  request: Request,
  apiBaseUrl: string,
  fetchImpl: NonNullable<WebAppOptions["fetch"]>,
): Promise<Response> {
  const incoming = new URL(request.url);
  const target = `${apiBaseUrl}${incoming.pathname}${incoming.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== null;

  let upstream: Response;
  try {
    upstream = await fetchImpl(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
  } catch (error) {
    console.error("Failed to reach the notes API", error);
    return errorResponse(502, "The notes API is unavailable. Please try again.");
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    responseHeaders.delete(header);
  }
  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

/**
 * Builds the web app's request handler.
 *
 * This never starts a listener: `src/index.ts` owns `Bun.serve`, while tests can
 * call {@link WebApp.fetch} directly. `/api/*` requests are proxied to the notes
 * API, `/` serves the notes page, and the compiled browser bundle is served from
 * `dist/client`.
 */
export function createWebApp(options: WebAppOptions = {}): WebApp {
  const apiBaseUrl = (options.apiBaseUrl ?? resolveApiBaseUrl()).replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const assetsDirs =
    options.assetsDir === undefined ? DEFAULT_ASSETS_DIRS : [resolveDirectory(options.assetsDir)];
  const staticDir = resolveDirectory(options.staticDir ?? DEFAULT_STATIC_DIR);

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return proxyToApi(request, apiBaseUrl, fetchImpl);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return textResponse(405, "Method not allowed", { Allow: "GET, HEAD" });
    }

    if (pathname === "/" || pathname === "/index.html") {
      const page = await serveFile(request, staticDir, "index.html", HTML_HEADERS);
      return page ?? textResponse(500, "The notes page is missing from the web app.");
    }

    if (pathname === "/styles.css") {
      const styles = await serveFile(request, staticDir, "styles.css", CSS_HEADERS);
      return styles ?? textResponse(500, "The stylesheet is missing from the web app.");
    }

    if (pathname === "/app.js" || pathname === "/app.js.map") {
      const asset = await serveFromDirectories(request, assetsDirs, pathname.slice(1), JS_HEADERS);
      return (
        asset ??
        textResponse(503, "The browser bundle is not built yet. Run `bun run build:client`.")
      );
    }

    return textResponse(404, "Not found");
  }

  return {
    apiBaseUrl,
    async fetch(request) {
      try {
        return await handle(request);
      } catch (error) {
        console.error("Unhandled web error", error);
        return textResponse(500, "Something went wrong while serving the notes app.");
      }
    },
  };
}
