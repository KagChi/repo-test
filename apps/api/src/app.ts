import { TtlLruCache } from "@repo/shared-utils";
import type { Note } from "./notes";
import { validateNoteInput } from "./notes";
import { NotesStore } from "./store";

/** Default TTL applied to cached note reads (`CACHE_TTL_MS`). */
export const DEFAULT_CACHE_TTL_MS = 30_000;

/** Maximum number of note list/detail entries kept in memory. */
export const CACHE_CAPACITY = 512;

const LIST_CACHE_KEY = "notes:list";
const NOTE_CACHE_PREFIX = "notes:item:";

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "X-Cache",
  "Access-Control-Max-Age": "86400",
};

const JSON_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json; charset=utf-8",
};

/** Values stored in the read-through cache: the note list or a single note. */
export type CachedNoteValue = Note[] | Note;

/** A framework-agnostic request handler plus the resources backing it. */
export interface NotesApp {
  /** Handles a single request. Suitable for `Bun.serve({ fetch })`. */
  fetch(request: Request): Promise<Response>;
  /** The SQLite-backed store used by the handler. */
  readonly store: NotesStore;
  /** The TTL + LRU cache used for successful note reads. */
  readonly cache: TtlLruCache<string, CachedNoteValue>;
  /** Closes the underlying database connection. */
  close(): void;
}

export interface CreateAppOptions {
  /** Store to use. Defaults to one backed by `DB_PATH` (or the local default). */
  store?: NotesStore;
  /** Cache TTL in milliseconds. Defaults to `CACHE_TTL_MS` or 30 seconds. */
  cacheTtlMs?: number;
  /** Clock injected into the cache; defaults to `Date.now`. */
  now?: () => number;
}

/** Resolves the cache TTL from `CACHE_TTL_MS`, falling back to the default. */
export function resolveCacheTtlMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.CACHE_TTL_MS?.trim();
  if (raw === undefined || raw.length === 0) {
    return DEFAULT_CACHE_TTL_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_CACHE_TTL_MS;
  }

  return parsed;
}

function json(status: number, body: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, ...JSON_HEADERS, ...extraHeaders },
  });
}

function errorResponse(status: number, message: string, extraHeaders?: Record<string, string>) {
  return json(status, { error: message }, extraHeaders);
}

/** Normalizes a request path: strips trailing slashes, keeps `/` for the root. */
function normalizePathname(url: string): string {
  return new URL(url).pathname.replace(/\/+$/, "") || "/";
}

/**
 * Builds the notes API handler.
 *
 * This never starts a listener, so tests (and any other embedding) can call
 * {@link NotesApp.fetch} directly. `src/server.ts` is responsible for serving
 * the handler over HTTP.
 */
export function createApp(options: CreateAppOptions = {}): NotesApp {
  const store = options.store ?? new NotesStore();
  const cache = new TtlLruCache<string, CachedNoteValue>({
    capacity: CACHE_CAPACITY,
    ttlMs: options.cacheTtlMs ?? resolveCacheTtlMs(),
    now: options.now,
  });

  const noteCacheKey = (id: string) => `${NOTE_CACHE_PREFIX}${id}`;

  /** Drops the list entry and the detail entry for `id`. */
  function invalidate(id: string): void {
    cache.delete(LIST_CACHE_KEY);
    cache.delete(noteCacheKey(id));
  }

  function handleList(): Response {
    const cached = cache.get(LIST_CACHE_KEY);
    if (cached !== undefined) {
      return json(200, { data: cached }, { "X-Cache": "HIT" });
    }

    const notes = store.list();
    cache.set(LIST_CACHE_KEY, notes);
    return json(200, { data: notes }, { "X-Cache": "MISS" });
  }

  function handleDetail(id: string): Response {
    const key = noteCacheKey(id);
    const cached = cache.get(key);
    if (cached !== undefined) {
      return json(200, { data: cached }, { "X-Cache": "HIT" });
    }

    const note = store.get(id);
    if (note === undefined) {
      return errorResponse(404, "Note not found");
    }

    cache.set(key, note);
    return json(200, { data: note }, { "X-Cache": "MISS" });
  }

  async function handleCreate(request: Request): Promise<Response> {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return errorResponse(400, "Request body must be valid JSON");
    }

    const validation = validateNoteInput(payload);
    if (!validation.ok) {
      return errorResponse(400, validation.error);
    }

    const note = store.create(validation.value);
    invalidate(note.id);

    return json(201, { data: note });
  }

  function handleDelete(id: string): Response {
    const deleted = store.delete(id);
    invalidate(id);

    if (!deleted) {
      return errorResponse(404, "Note not found");
    }

    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  async function route(request: Request): Promise<Response> {
    const pathname = normalizePathname(request.url);

    if (pathname === "/health") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return errorResponse(405, "Method not allowed", { Allow: "GET, HEAD, OPTIONS" });
      }
      return json(200, { status: "ok" });
    }

    if (pathname === "/api/notes") {
      if (request.method === "GET") {
        return handleList();
      }
      if (request.method === "POST") {
        return handleCreate(request);
      }
      return errorResponse(405, "Method not allowed", { Allow: "GET, POST, OPTIONS" });
    }

    if (pathname.startsWith("/api/notes/")) {
      let id: string;
      try {
        id = decodeURIComponent(pathname.slice("/api/notes/".length));
      } catch {
        return errorResponse(400, "Malformed note id");
      }

      if (id.length === 0) {
        return errorResponse(404, "Not found");
      }
      if (request.method === "GET") {
        return handleDetail(id);
      }
      if (request.method === "DELETE") {
        return handleDelete(id);
      }
      return errorResponse(405, "Method not allowed", { Allow: "GET, DELETE, OPTIONS" });
    }

    return errorResponse(404, "Not found");
  }

  async function fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      return await route(request);
    } catch (error) {
      console.error("Unhandled API error", error);
      return errorResponse(500, "Internal server error");
    }
  }

  return {
    fetch,
    store,
    cache,
    close: () => store.close(),
  };
}
