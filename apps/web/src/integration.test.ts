import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp, type NotesApp } from "../../api/src/app";
import { NotesStore } from "../../api/src/store";
import { createWebApp, type WebApp } from "./server";

/**
 * End-to-end coverage of the browser-facing flow: the web proxy in front of the
 * real notes API handler. Neither server opens a listener.
 */
describe("web + api integration", () => {
  let api: NotesApp;
  let web: WebApp;

  beforeEach(() => {
    api = createApp({ store: new NotesStore(":memory:") });
    web = createWebApp({
      apiBaseUrl: "http://api.test",
      fetch: (input, init) => api.fetch(new Request(String(input), init)),
    });
  });

  afterEach(() => {
    api.close();
  });

  function call(path: string, init?: RequestInit): Promise<Response> {
    return web.fetch(new Request(`http://web.test${path}`, init));
  }

  function createNote(title: string, content: string): Promise<Response> {
    return call("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
  }

  test("creates, lists, and deletes notes through the proxy", async () => {
    const created = await createNote("Groceries", "Milk and eggs");
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { data: { id: string; title: string } };
    expect(createdBody.data.title).toBe("Groceries");

    const listed = await call("/api/notes");
    expect(listed.status).toBe(200);
    expect(listed.headers.get("x-cache")).toBe("MISS");

    const cached = await call("/api/notes");
    expect(cached.headers.get("x-cache")).toBe("HIT");
    expect(((await cached.json()) as { data: unknown[] }).data).toHaveLength(1);

    const deleted = await call(`/api/notes/${createdBody.data.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");

    const afterDelete = await call("/api/notes");
    expect(((await afterDelete.json()) as { data: unknown[] }).data).toEqual([]);
  });

  test("forwards API validation errors to the browser unchanged", async () => {
    const response = await createNote("   ", "content");

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain("title");
  });
});
