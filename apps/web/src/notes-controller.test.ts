import { describe, expect, test } from "bun:test";
import { createNotesApi, type NotesApi, NotesApiError } from "./api-client";
import {
  createNotesController,
  type NoteField,
  type NotesView,
  type StatusTone,
} from "./notes-controller";
import { MAX_CONTENT_LENGTH, validateNoteForm } from "./notes-form";
import type { Note } from "./types";

const NOTE: Note = {
  id: "note-1",
  title: "Groceries",
  content: "Milk and eggs",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

interface ViewCall {
  message: string;
  tone?: StatusTone;
  field?: NoteField;
}

function createRecordingView() {
  const state = {
    notes: [] as Note[],
    busy: [] as boolean[],
    statuses: [] as ViewCall[],
    formErrors: [] as ViewCall[],
    caches: [] as (string | null)[],
    resets: 0,
    focused: [] as NoteField[],
  };

  const view: NotesView = {
    renderNotes(notes) {
      state.notes = notes;
    },
    setBusy(busy) {
      state.busy.push(busy);
    },
    setStatus(message, tone) {
      state.statuses.push({ message, tone });
    },
    setFormError(message, field) {
      state.formErrors.push({ message, field });
    },
    setCacheStatus(cache) {
      state.caches.push(cache);
    },
    resetForm() {
      state.resets += 1;
    },
    focusField(field) {
      state.focused.push(field);
    },
  };

  return { view, state };
}

function notesApi(overrides: Partial<NotesApi> = {}): NotesApi {
  return {
    listNotes: async () => ({ notes: [NOTE], cache: "MISS" }),
    createNote: async () => ({ note: NOTE, cache: "MISS" }),
    deleteNote: async () => ({ cache: "MISS" }),
    ...overrides,
  };
}

describe("validateNoteForm", () => {
  test("trims the title and accepts valid input", () => {
    expect(validateNoteForm({ title: "  Groceries  ", content: "Milk" })).toEqual({
      ok: true,
      value: { title: "Groceries", content: "Milk" },
    });
  });

  test("rejects blank and over-long titles", () => {
    expect(validateNoteForm({ title: "   ", content: "" })).toEqual({
      ok: false,
      field: "title",
      error: "Title is required.",
    });

    const tooLong = validateNoteForm({ title: "t".repeat(121), content: "" });
    expect(tooLong.ok).toBe(false);
    expect(tooLong.ok ? "" : tooLong.field).toBe("title");
  });

  test("rejects content over the API limit", () => {
    const result = validateNoteForm({
      title: "Title",
      content: "x".repeat(MAX_CONTENT_LENGTH + 1),
    });

    expect(result).toEqual({
      ok: false,
      field: "content",
      error: `Content must be at most ${MAX_CONTENT_LENGTH} characters.`,
    });
  });
});

describe("notes controller", () => {
  test("loads notes and shows the cache status", async () => {
    const { view, state } = createRecordingView();
    const controller = createNotesController(
      notesApi({ listNotes: async () => ({ notes: [NOTE], cache: "HIT" }) }),
      view,
    );

    expect(await controller.loadNotes()).toBe(true);
    expect(state.notes).toEqual([NOTE]);
    expect(state.caches).toEqual([null, "HIT"]);
    expect(state.statuses.at(-1)).toEqual({
      message: "Loaded 1 note.",
      tone: "success",
    });
    expect(state.busy).toEqual([true, false]);
  });

  test("shows the empty state message when there are no notes", async () => {
    const { view, state } = createRecordingView();
    const controller = createNotesController(
      notesApi({ listNotes: async () => ({ notes: [], cache: "MISS" }) }),
      view,
    );

    await controller.loadNotes();

    expect(state.notes).toEqual([]);
    expect(state.statuses.at(-1)?.message).toContain("No notes yet");
  });

  test("renders API failures as a useful message instead of throwing", async () => {
    const { view, state } = createRecordingView();
    const controller = createNotesController(
      notesApi({
        listNotes: async () => {
          throw new NotesApiError("Could not reach the notes API. Check that it is running.");
        },
      }),
      view,
    );

    expect(await controller.loadNotes()).toBe(false);
    expect(state.notes).toEqual([]);
    expect(state.caches.at(-1)).toBeNull();
    expect(state.statuses.at(-1)).toEqual({
      message: "Could not load notes: Could not reach the notes API. Check that it is running.",
      tone: "error",
    });
    expect(state.busy.at(-1)).toBe(false);
  });

  test("validates before calling the API", async () => {
    let created = 0;
    const { view, state } = createRecordingView();
    const controller = createNotesController(
      notesApi({
        createNote: async () => {
          created += 1;
          return { note: NOTE, cache: "MISS" };
        },
      }),
      view,
    );

    expect(await controller.createNote({ title: "  ", content: "" })).toBe(false);
    expect(created).toBe(0);
    expect(state.formErrors.at(-1)).toEqual({ message: "Title is required.", field: "title" });
    expect(state.focused).toEqual(["title"]);
    expect(state.statuses.at(-1)?.tone).toBe("error");
  });

  test("creates a note, resets the form, and refreshes the list", async () => {
    const calls: string[] = [];
    const { view, state } = createRecordingView();
    const controller = createNotesController(
      notesApi({
        createNote: async (input) => {
          calls.push(`create:${input.title}`);
          return { note: { ...NOTE, title: input.title }, cache: "MISS" };
        },
        listNotes: async () => {
          calls.push("list");
          return { notes: [NOTE], cache: "HIT" };
        },
      }),
      view,
    );

    expect(await controller.createNote({ title: "  Groceries  ", content: "Milk" })).toBe(true);
    expect(calls).toEqual(["create:Groceries", "list"]);
    expect(state.resets).toBe(1);
    expect(state.notes).toEqual([NOTE]);
    expect(state.caches).toEqual(["MISS", null, "HIT"]);
    expect(state.statuses.at(-1)).toEqual({ message: "Created “Groceries”.", tone: "success" });
  });

  test("reports create failures without resetting the form", async () => {
    const { view, state } = createRecordingView();
    const controller = createNotesController(
      notesApi({
        createNote: async () => {
          throw new NotesApiError("title must not be empty", 400);
        },
      }),
      view,
    );

    expect(await controller.createNote({ title: "Title", content: "Body" })).toBe(false);
    expect(state.resets).toBe(0);
    expect(state.statuses.at(-1)).toEqual({
      message: "Could not create note: title must not be empty",
      tone: "error",
    });
  });

  test("deletes a note and refreshes the list", async () => {
    const calls: string[] = [];
    const { view, state } = createRecordingView();
    const controller = createNotesController(
      notesApi({
        deleteNote: async (id) => {
          calls.push(`delete:${id}`);
          return { cache: "MISS" };
        },
        listNotes: async () => {
          calls.push("list");
          return { notes: [], cache: "MISS" };
        },
      }),
      view,
    );

    expect(await controller.deleteNote(NOTE.id, NOTE.title)).toBe(true);
    expect(calls).toEqual([`delete:${NOTE.id}`, "list"]);
    expect(state.notes).toEqual([]);
    expect(state.statuses.at(-1)).toEqual({ message: "Deleted “Groceries”.", tone: "success" });
  });

  test("reports delete failures", async () => {
    const { view, state } = createRecordingView();
    const controller = createNotesController(
      notesApi({
        deleteNote: async () => {
          throw new NotesApiError("Note not found", 404);
        },
      }),
      view,
    );

    expect(await controller.deleteNote(NOTE.id, NOTE.title)).toBe(false);
    expect(state.statuses.at(-1)).toEqual({
      message: "Could not delete “Groceries”: Note not found",
      tone: "error",
    });
  });

  test("works end to end with the real client and a fake fetch", async () => {
    const { view } = createRecordingView();
    let stored: Note[] = [];
    let listCount = 0;

    const api = createNotesApi({
      fetch: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "/api/notes" && method === "GET") {
          listCount += 1;
          const cache = listCount === 1 ? "MISS" : "HIT";
          return Response.json({ data: stored }, { headers: { "X-Cache": cache } });
        }

        if (url === "/api/notes" && method === "POST") {
          const body = (await new Response(init?.body).json()) as {
            title: string;
            content: string;
          };
          const note = { ...NOTE, ...body };
          stored = [note];
          return Response.json({ data: note }, { status: 201 });
        }

        if (method === "DELETE") {
          stored = [];
          return new Response(null, { status: 204 });
        }

        return new Response("not found", { status: 404 });
      },
    });

    const controller = createNotesController(api, view);

    await controller.loadNotes();
    expect(stored).toEqual([]);

    expect(await controller.createNote({ title: "Groceries", content: "Milk and eggs" })).toBe(
      true,
    );
    expect(stored.map((note) => note.title)).toEqual(["Groceries"]);

    expect(await controller.deleteNote(NOTE.id, "Groceries")).toBe(true);
    expect(stored).toEqual([]);
  });
});
