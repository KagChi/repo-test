import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, type NotesApp } from "./app";
import type { Note } from "./notes";
import { NotesStore } from "./store";

interface NotesResponse {
  data: Note[];
}

interface NoteResponse {
  data: Note;
}

interface ErrorResponse {
  error: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function request(app: NotesApp, path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

function createNote(app: NotesApp, title: string, content: string): Promise<Response> {
  return request(app, "/api/notes", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ title, content }),
  });
}

describe("notes API", () => {
  let app: NotesApp;

  beforeEach(() => {
    app = createApp({ store: new NotesStore(":memory:") });
  });

  afterEach(() => {
    app.close();
  });

  describe("GET /health", () => {
    test("returns status ok", async () => {
      const response = await request(app, "/health");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    });

    test("handles CORS preflight requests", async () => {
      const response = await request(app, "/api/notes", { method: "OPTIONS" });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toContain("DELETE");
      expect(response.headers.get("access-control-expose-headers")).toContain("X-Cache");
    });
  });

  describe("POST /api/notes", () => {
    test("creates a note and returns the persisted record", async () => {
      const response = await createNote(app, "  Shopping list  ", "Milk\nEggs");

      expect(response.status).toBe(201);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");

      const { data } = (await response.json()) as NoteResponse;
      expect(data.title).toBe("Shopping list");
      expect(data.content).toBe("Milk\nEggs");
      expect(typeof data.id).toBe("string");
      expect(data.id.length).toBeGreaterThan(0);
      expect(new Date(data.createdAt).toISOString()).toBe(data.createdAt);
      expect(data.updatedAt).toBe(data.createdAt);

      const fetched = await request(app, `/api/notes/${data.id}`);
      expect(fetched.status).toBe(200);
      expect(((await fetched.json()) as NoteResponse).data).toEqual(data);
    });

    test("accepts content at the length limit and rejects longer content", async () => {
      const accepted = await createNote(app, "Long", "x".repeat(5000));
      expect(accepted.status).toBe(201);

      const rejected = await createNote(app, "Too long", "x".repeat(5001));
      expect(rejected.status).toBe(400);
      expect(((await rejected.json()) as ErrorResponse).error).toContain("content");
    });

    test("accepts titles at 120 characters after trimming", async () => {
      const response = await createNote(app, `  ${"t".repeat(120)}  `, "body");
      expect(response.status).toBe(201);

      const tooLong = await createNote(app, "t".repeat(121), "body");
      expect(tooLong.status).toBe(400);
    });

    test("rejects missing, blank, and non-string titles", async () => {
      for (const body of [
        { content: "x" },
        { title: "   ", content: "x" },
        { title: 1, content: "x" },
      ]) {
        const response = await request(app, "/api/notes", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        });

        expect(response.status).toBe(400);
        expect(((await response.json()) as ErrorResponse).error).toContain("title");
      }
    });

    test("rejects missing and non-string content", async () => {
      for (const body of [{ title: "Title" }, { title: "Title", content: 42 }]) {
        const response = await request(app, "/api/notes", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        });

        expect(response.status).toBe(400);
        expect(((await response.json()) as ErrorResponse).error).toContain("content");
      }
    });

    test("rejects malformed JSON and non-object payloads", async () => {
      const malformed = await request(app, "/api/notes", {
        method: "POST",
        headers: JSON_HEADERS,
        body: "{not json",
      });
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as ErrorResponse).error).toContain("JSON");

      const arrayBody = await request(app, "/api/notes", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify([{ title: "x", content: "y" }]),
      });
      expect(arrayBody.status).toBe(400);
    });
  });

  describe("GET /api/notes", () => {
    test("returns an empty list initially", async () => {
      const response = await request(app, "/api/notes");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [] });
      expect(response.headers.get("x-cache")).toBe("MISS");
    });

    test("lists created notes", async () => {
      await createNote(app, "First", "one");
      await createNote(app, "Second", "two");

      const response = await request(app, "/api/notes");
      const { data } = (await response.json()) as NotesResponse;

      expect(data.map((note) => note.title)).toEqual(["First", "Second"]);
    });
  });

  describe("GET /api/notes/:id", () => {
    test("returns 404 with a JSON error for unknown ids", async () => {
      const response = await request(app, "/api/notes/missing");

      expect(response.status).toBe(404);
      expect(((await response.json()) as ErrorResponse).error).toBeDefined();
    });
  });

  describe("DELETE /api/notes/:id", () => {
    test("deletes a note and returns 204 without a body", async () => {
      const created = (await (await createNote(app, "Temp", "body")).json()) as NoteResponse;

      const response = await request(app, `/api/notes/${created.data.id}`, { method: "DELETE" });

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");

      const detail = await request(app, `/api/notes/${created.data.id}`);
      expect(detail.status).toBe(404);

      const list = (await (await request(app, "/api/notes")).json()) as NotesResponse;
      expect(list.data).toEqual([]);
    });

    test("returns 404 when the note is missing", async () => {
      const response = await request(app, "/api/notes/missing", { method: "DELETE" });

      expect(response.status).toBe(404);
      expect(((await response.json()) as ErrorResponse).error).toBeDefined();
    });
  });

  describe("caching", () => {
    test("reports MISS then HIT for list reads", async () => {
      await createNote(app, "Cached", "body");

      const first = await request(app, "/api/notes");
      expect(first.headers.get("x-cache")).toBe("MISS");

      const second = await request(app, "/api/notes");
      expect(second.headers.get("x-cache")).toBe("HIT");
      expect(await second.json()).toEqual(await first.json());
    });

    test("reports MISS then HIT for detail reads", async () => {
      const created = (await (await createNote(app, "Cached", "body")).json()) as NoteResponse;
      const path = `/api/notes/${created.data.id}`;

      const first = await request(app, path);
      expect(first.headers.get("x-cache")).toBe("MISS");

      const second = await request(app, path);
      expect(second.headers.get("x-cache")).toBe("HIT");
      expect(await second.json()).toEqual(await first.json());
    });

    test("does not cache 404 responses", async () => {
      await request(app, "/api/notes/missing");

      await createNote(app, "Created later", "body");
      const list = await request(app, "/api/notes");
      expect(list.headers.get("x-cache")).toBe("MISS");
      expect(((await list.json()) as NotesResponse).data).toHaveLength(1);
    });

    test("expires cached entries after the configured TTL", async () => {
      let current = 0;
      const ttlApp = createApp({
        store: new NotesStore(":memory:"),
        cacheTtlMs: 100,
        now: () => current,
      });

      try {
        const first = await request(ttlApp, "/api/notes");
        expect(first.headers.get("x-cache")).toBe("MISS");

        const hit = await request(ttlApp, "/api/notes");
        expect(hit.headers.get("x-cache")).toBe("HIT");

        current += 100;
        const expired = await request(ttlApp, "/api/notes");
        expect(expired.headers.get("x-cache")).toBe("MISS");
      } finally {
        ttlApp.close();
      }
    });

    test("invalidates the list cache and repopulates detail caches after a create", async () => {
      const created = (await (await createNote(app, "First", "body")).json()) as NoteResponse;
      const path = `/api/notes/${created.data.id}`;

      expect((await request(app, "/api/notes")).headers.get("x-cache")).toBe("MISS");
      expect((await request(app, path)).headers.get("x-cache")).toBe("MISS");
      expect((await request(app, "/api/notes")).headers.get("x-cache")).toBe("HIT");
      expect((await request(app, path)).headers.get("x-cache")).toBe("HIT");

      const second = (await (await createNote(app, "Second", "body")).json()) as NoteResponse;

      const list = await request(app, "/api/notes");
      expect(list.headers.get("x-cache")).toBe("MISS");
      expect(((await list.json()) as NotesResponse).data).toHaveLength(2);

      // A newly created note is never served stale from the cache.
      expect((await request(app, `/api/notes/${second.data.id}`)).headers.get("x-cache")).toBe(
        "MISS",
      );

      // Existing details are unaffected by unrelated creates.
      expect((await request(app, path)).headers.get("x-cache")).toBe("HIT");
      expect(((await (await request(app, path)).json()) as NoteResponse).data.id).toBe(
        created.data.id,
      );
    });

    test("invalidates list and detail caches after a delete", async () => {
      const created = (await (await createNote(app, "Doomed", "body")).json()) as NoteResponse;
      const path = `/api/notes/${created.data.id}`;

      expect((await request(app, "/api/notes")).headers.get("x-cache")).toBe("MISS");
      expect((await request(app, path)).headers.get("x-cache")).toBe("MISS");

      expect((await request(app, path, { method: "DELETE" })).status).toBe(204);

      expect((await request(app, "/api/notes")).headers.get("x-cache")).toBe("MISS");
      const detail = await request(app, path);
      expect(detail.status).toBe(404);
      expect(detail.headers.get("x-cache")).toBeNull();
    });

    test("invalidates the detail cache so deleted notes are not resurrected", async () => {
      const created = (await (await createNote(app, "Gone", "body")).json()) as NoteResponse;
      const path = `/api/notes/${created.data.id}`;

      expect((await request(app, path)).headers.get("x-cache")).toBe("MISS");

      await app.store.delete(created.data.id);
      await request(app, path, { method: "DELETE" });

      expect((await request(app, path)).status).toBe(404);
    });
  });

  describe("routing", () => {
    test("returns 404 for unknown routes", async () => {
      const response = await request(app, "/nope");

      expect(response.status).toBe(404);
      expect(((await response.json()) as ErrorResponse).error).toBeDefined();
    });

    test("returns 405 for unsupported methods", async () => {
      const response = await request(app, "/api/notes", { method: "PUT" });

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toContain("POST");
    });

    test("ignores trailing slashes", async () => {
      expect((await request(app, "/api/notes/")).status).toBe(200);
      expect((await request(app, "/health/")).status).toBe(200);
    });
  });
});

describe("notes persistence", () => {
  let directory: string;
  let dbPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "notes-api-"));
    dbPath = join(directory, "nested", "notes.sqlite");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  test("persists notes in a SQLite file across store instances", () => {
    const first = new NotesStore(dbPath);
    const created = first.create({ title: "Persisted", content: "survives restarts" });
    first.close();

    const second = new NotesStore(dbPath);
    try {
      expect(second.get(created.id)).toEqual(created);
      expect(second.list()).toHaveLength(1);
    } finally {
      second.close();
    }
  });

  test("survives across app instances backed by the same file", async () => {
    const firstApp = createApp({ store: new NotesStore(dbPath) });
    const created = (await (await createNote(firstApp, "Durable", "yes")).json()) as NoteResponse;
    firstApp.close();

    const secondApp = createApp({ store: new NotesStore(dbPath) });
    try {
      const response = await request(secondApp, `/api/notes/${created.data.id}`);
      expect(response.status).toBe(200);
      expect(((await response.json()) as NoteResponse).data).toEqual(created.data);
    } finally {
      secondApp.close();
    }
  });
});
