import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWebApp, DEFAULT_API_BASE_URL, resolveApiBaseUrl, type WebApp } from "./server";

interface UpstreamCall {
  url: string;
  init: RequestInit | undefined;
}

type FetchImpl = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const NOTE = {
  id: "note-1",
  title: "Groceries",
  content: "Milk and eggs",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

describe("notes web app", () => {
  let directory: string;
  let staticDir: string;
  let assetsDir: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "notes-web-"));
    staticDir = join(directory, "client");
    assetsDir = join(directory, "assets");

    mkdirSync(staticDir, { recursive: true });
    mkdirSync(assetsDir, { recursive: true });

    writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>Notes</title>");
    writeFileSync(join(staticDir, "styles.css"), ":root { color-scheme: light dark; }");
    writeFileSync(join(assetsDir, "app.js"), "console.log('notes');");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function createApp(fetchImpl?: FetchImpl) {
    return createWebApp({
      apiBaseUrl: "http://api.example:3999",
      staticDir,
      assetsDir,
      fetch: fetchImpl,
    });
  }

  test("resolves the API base URL from the environment", () => {
    expect(resolveApiBaseUrl({})).toBe(DEFAULT_API_BASE_URL);
    expect(resolveApiBaseUrl({ API_BASE_URL: " http://api.test:4000/// " })).toBe(
      "http://api.test:4000",
    );
  });

  test("serves the notes page, stylesheet, and browser bundle", async () => {
    const app = createApp();

    const page = await app.fetch(new Request("http://web.test/"));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("<title>Notes</title>");

    const styles = await app.fetch(new Request("http://web.test/styles.css"));
    expect(styles.status).toBe(200);
    expect(styles.headers.get("content-type")).toContain("text/css");
    expect(await styles.text()).toContain("color-scheme");

    const bundle = await app.fetch(new Request("http://web.test/app.js"));
    expect(bundle.status).toBe(200);
    expect(bundle.headers.get("content-type")).toContain("text/javascript");
    expect(await bundle.text()).toContain("console.log");
  });

  test("answers HEAD requests with the same headers and no body", async () => {
    const app = createApp();

    const response = await app.fetch(new Request("http://web.test/", { method: "HEAD" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toBe("");
  });

  test("rejects unsupported methods for static assets", async () => {
    const app = createApp();

    const response = await app.fetch(new Request("http://web.test/", { method: "POST" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });

  test("returns 404 for unknown paths and a helpful 503 for a missing bundle", async () => {
    const app = createWebApp({ staticDir, assetsDir: join(directory, "missing") });

    const missing = await app.fetch(new Request("http://web.test/nope"));
    expect(missing.status).toBe(404);

    const bundle = await app.fetch(new Request("http://web.test/app.js"));
    expect(bundle.status).toBe(503);
    expect(await bundle.text()).toContain("build:client");
  });

  test("proxies GET requests, preserving the path, query, status, and X-Cache", async () => {
    const calls: UpstreamCall[] = [];
    const app = createApp(async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ data: [NOTE] }, 200, { "X-Cache": "HIT" });
    });

    const response = await app.fetch(
      new Request("http://web.test/api/notes?tag=shopping", {
        headers: { Accept: "application/json" },
      }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://api.example:3999/api/notes?tag=shopping");
    expect(calls[0]?.init?.method).toBe("GET");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-cache")).toBe("HIT");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ data: [NOTE] });
  });

  test("proxies POST bodies and content types without opening a listener", async () => {
    let receivedBody = "";
    let receivedInit: RequestInit | undefined;

    const app = createApp(async (_input, init) => {
      receivedInit = init;
      receivedBody = await new Response(init?.body).text();
      return jsonResponse({ data: NOTE }, 201, { "X-Cache": "MISS" });
    });

    const response = await app.fetch(
      new Request("http://web.test/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Groceries", content: "Milk and eggs" }),
      }),
    );

    expect(receivedInit?.method).toBe("POST");
    expect(new Headers(receivedInit?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(receivedBody)).toEqual({ title: "Groceries", content: "Milk and eggs" });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-cache")).toBe("MISS");
    expect(await response.json()).toEqual({ data: NOTE });
  });

  test("proxies DELETE requests and preserves an empty 204 response", async () => {
    let receivedMethod: string | undefined;
    const app = createApp(async (_input, init) => {
      receivedMethod = init?.method;
      return new Response(null, { status: 204, headers: { "X-Cache": "MISS" } });
    });

    const response = await app.fetch(
      new Request("http://web.test/api/notes/note%2F1", { method: "DELETE" }),
    );

    expect(receivedMethod).toBe("DELETE");
    expect(response.status).toBe(204);
    expect(response.headers.get("x-cache")).toBe("MISS");
    expect(await response.text()).toBe("");
  });

  test("forwards API error statuses and messages", async () => {
    const app = createApp(async () => jsonResponse({ error: "title is required" }, 400));

    const response = await app.fetch(
      new Request("http://web.test/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "no title" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "title is required" });
  });

  test("returns a 502 JSON error when the API cannot be reached", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    const app = createApp(async () => {
      throw new Error("connection refused");
    });

    try {
      const response = await app.fetch(new Request("http://web.test/api/notes"));

      expect(response.status).toBe(502);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(((await response.json()) as { error: string }).error).toContain("unavailable");
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  test("marks proxied responses as non-cacheable when the API does not say otherwise", async () => {
    const app = createApp(async () => jsonResponse({ data: [] }, 200, { "X-Cache": "MISS" }));

    const response = await app.fetch(new Request("http://web.test/api/notes"));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("web app API base URL", () => {
  test("exposes the resolved base URL for startup logging", () => {
    const app: WebApp = createWebApp({ apiBaseUrl: "http://api.local:3001/" });

    expect(app.apiBaseUrl).toBe("http://api.local:3001");
  });
});
