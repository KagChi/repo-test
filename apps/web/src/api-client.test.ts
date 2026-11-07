import { describe, expect, test } from "bun:test";
import { createNotesApi, type FetchLike, type NotesApi, NotesApiError } from "./api-client";
import type { Note } from "./types";

const NOTE: Note = {
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

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): {
  fetch: FetchLike;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init });
      return handler(url, init);
    },
  };
}

describe("notes API client", () => {
  test("lists notes through the same-origin /api/notes route", async () => {
    const { fetch, calls } = fakeFetch(async () =>
      jsonResponse({ data: [NOTE] }, 200, { "X-Cache": "MISS" }),
    );
    const api: NotesApi = createNotesApi({ fetch });

    const result = await api.listNotes();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/notes");
    expect(calls[0]?.init?.method).toBe("GET");
    expect(result).toEqual({ notes: [NOTE], cache: "MISS" });
  });

  test("reports a HIT cache status and ignores unknown cache values", async () => {
    const hit = createNotesApi({
      fetch: fakeFetch(async () => jsonResponse({ data: [] }, 200, { "X-Cache": "HIT" })).fetch,
    });
    expect((await hit.listNotes()).cache).toBe("HIT");

    const unknown = createNotesApi({
      fetch: fakeFetch(async () => jsonResponse({ data: [] }, 200, { "X-Cache": "STALE" })).fetch,
    });
    expect((await unknown.listNotes()).cache).toBeNull();
  });

  test("creates a note with a JSON body and returns the new record", async () => {
    let body = "";
    const { fetch, calls } = fakeFetch(async (_url, init) => {
      body = await new Response(init?.body).text();
      return jsonResponse({ data: NOTE }, 201, { "X-Cache": "MISS" });
    });
    const api = createNotesApi({ fetch });

    const result = await api.createNote({ title: "Groceries", content: "Milk and eggs" });

    expect(calls[0]?.url).toBe("/api/notes");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(body)).toEqual({ title: "Groceries", content: "Milk and eggs" });
    expect(result).toEqual({ note: NOTE, cache: "MISS" });
  });

  test("deletes a note by encoded id and returns the cache status", async () => {
    const { fetch, calls } = fakeFetch(
      async () => new Response(null, { status: 204, headers: { "X-Cache": "HIT" } }),
    );
    const api = createNotesApi({ fetch });

    const result = await api.deleteNote("note/1");

    expect(calls[0]?.url).toBe("/api/notes/note%2F1");
    expect(calls[0]?.init?.method).toBe("DELETE");
    expect(result).toEqual({ cache: "HIT" });
  });

  test("accepts a custom base URL and strips trailing slashes", async () => {
    const { fetch, calls } = fakeFetch(async () => jsonResponse({ data: [] }));
    const api = createNotesApi({ fetch, baseUrl: "/proxy/api/" });

    await api.listNotes();

    expect(calls[0]?.url).toBe("/proxy/api/notes");
  });

  test("surfaces API error messages and status codes", async () => {
    const api = createNotesApi({
      fetch: fakeFetch(async () => jsonResponse({ error: "title must not be empty" }, 400)).fetch,
    });

    const error = await api.createNote({ title: " ", content: "x" }).catch((cause) => cause);

    expect(error).toBeInstanceOf(NotesApiError);
    expect((error as NotesApiError).message).toBe("title must not be empty");
    expect((error as NotesApiError).status).toBe(400);
  });

  test("falls back to a status-based message when the API has no error body", async () => {
    const api = createNotesApi({
      fetch: fakeFetch(async () => new Response("nope", { status: 503, statusText: "Unavailable" }))
        .fetch,
    });

    const error = await api.listNotes().catch((cause) => cause);

    expect(error).toBeInstanceOf(NotesApiError);
    expect((error as NotesApiError).status).toBe(503);
    expect((error as NotesApiError).message).toContain("503");
  });

  test("reports an unreachable API as a network error", async () => {
    const api = createNotesApi({
      fetch: fakeFetch(async () => {
        throw new TypeError("Failed to fetch");
      }).fetch,
    });

    const error = await api.listNotes().catch((cause) => cause);

    expect(error).toBeInstanceOf(NotesApiError);
    expect((error as NotesApiError).status).toBe(0);
    expect((error as NotesApiError).message).toContain("Could not reach");
  });

  test("rethrows abort errors so callers can ignore superseded requests", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const api = createNotesApi({
      fetch: fakeFetch(async () => {
        throw abort;
      }).fetch,
    });

    const error = await api.listNotes().catch((cause) => cause);

    expect(error).toBe(abort);
  });

  test("rejects malformed list and note payloads", async () => {
    const malformedList = createNotesApi({
      fetch: fakeFetch(async () => jsonResponse({ notes: [NOTE] })).fetch,
    });
    await expect(malformedList.listNotes()).rejects.toBeInstanceOf(NotesApiError);

    const malformedNote = createNotesApi({
      fetch: fakeFetch(async () => jsonResponse({ data: [{ id: "only-an-id" }] })).fetch,
    });
    await expect(malformedNote.listNotes()).rejects.toBeInstanceOf(NotesApiError);

    const missingData = createNotesApi({
      fetch: fakeFetch(async () => jsonResponse({ note: NOTE }, 201)).fetch,
    });
    await expect(missingData.createNote({ title: "x", content: "y" })).rejects.toBeInstanceOf(
      NotesApiError,
    );
  });

  test("does not send the browser to the upstream API directly", async () => {
    const { fetch, calls } = fakeFetch(async () => jsonResponse({ data: [] }));
    const api = createNotesApi({ fetch });

    await api.listNotes();

    expect(calls[0]?.url).toBe("/api/notes");
    expect(calls[0]?.url).not.toContain("http");
  });
});
