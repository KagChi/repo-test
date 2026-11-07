import { createNotesApi, type FetchLike, type NotesApi } from "../api-client";
import {
  createNotesController,
  type NoteField,
  type NotesView,
  type StatusTone,
} from "../notes-controller";
import { MAX_CONTENT_LENGTH } from "../notes-form";
import type { Note } from "../types";

/** Returns a required element, failing loudly when the markup drifts. */
function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function setInvalid(element: HTMLElement, invalid: boolean): void {
  if (invalid) {
    element.setAttribute("aria-invalid", "true");
  } else {
    element.removeAttribute("aria-invalid");
  }
}

export interface BrowserAppOptions {
  /** API client override, primarily for tests. */
  api?: NotesApi;
  /** Fetch override forwarded to the default API client. */
  fetch?: FetchLike;
  /** Root document. Defaults to the global document. */
  document?: Document;
  /** Window used to schedule the initial load. Defaults to the global window. */
  window?: Window & typeof globalThis;
}

/**
 * Wires the notes UI to the same-origin `/api/*` client.
 *
 * Returns the controller so the flow can be driven without a real browser.
 */
export function mountNotesApp(options: BrowserAppOptions = {}) {
  const doc = options.document ?? document;
  const win = options.window ?? window;
  const api = options.api ?? createNotesApi({ fetch: options.fetch });

  const form = requireElement<HTMLFormElement>("#note-form");
  const titleInput = requireElement<HTMLInputElement>("#note-title");
  const contentInput = requireElement<HTMLTextAreaElement>("#note-content");
  const submitButton = requireElement<HTMLButtonElement>("#note-submit");
  const refreshButton = requireElement<HTMLButtonElement>("#notes-refresh");
  const formError = requireElement<HTMLElement>("#form-error");
  const status = requireElement<HTMLElement>("#notes-status");
  const cacheBadge = requireElement<HTMLElement>("#cache-badge");
  const notesList = requireElement<HTMLUListElement>("#notes-list");
  const emptyState = requireElement<HTMLElement>("#notes-empty");
  const notesPanel = requireElement<HTMLElement>("#notes-panel");
  const counter = doc.querySelector<HTMLElement>("#note-counter");

  function updateCounter(): void {
    if (counter !== null) {
      counter.textContent = `${contentInput.value.length} / ${MAX_CONTENT_LENGTH}`;
    }
  }

  const view: NotesView = {
    renderNotes(notes: Note[]) {
      notesList.replaceChildren();
      emptyState.hidden = notes.length > 0;

      for (const note of notes) {
        const item = doc.createElement("li");
        item.className = "note";
        item.dataset.noteId = note.id;

        const header = doc.createElement("div");
        header.className = "note__header";

        const title = doc.createElement("h3");
        title.className = "note__title";
        title.textContent = note.title;

        const remove = doc.createElement("button");
        remove.type = "button";
        remove.className = "note__delete";
        remove.textContent = "Delete";
        remove.setAttribute("aria-label", `Delete note: ${note.title}`);
        remove.addEventListener("click", () => {
          remove.disabled = true;
          remove.textContent = "Deleting…";
          void controller.deleteNote(note.id, note.title).then((deleted) => {
            // A successful delete re-renders the list; a failure keeps this note.
            if (!deleted) {
              remove.disabled = false;
              remove.textContent = "Delete";
            }
          });
        });

        header.append(title, remove);

        const content = doc.createElement("p");
        content.className = "note__content";
        content.textContent = note.content;

        const meta = doc.createElement("p");
        meta.className = "note__meta";
        meta.textContent = `Created ${formatTimestamp(note.createdAt)}`;

        item.append(header, content, meta);
        notesList.append(item);
      }
    },

    setBusy(busy: boolean) {
      submitButton.disabled = busy;
      refreshButton.disabled = busy;
      form.setAttribute("aria-busy", String(busy));
      notesPanel.setAttribute("aria-busy", String(busy));
    },

    setStatus(message: string, tone: StatusTone = "info") {
      status.textContent = message;
      status.dataset.tone = tone;
      status.hidden = message.length === 0;
    },

    setFormError(message: string, field?: NoteField) {
      formError.textContent = message;
      formError.hidden = message.length === 0;
      setInvalid(titleInput, field === "title");
      setInvalid(contentInput, field === "content");
    },

    setCacheStatus(cache) {
      if (cache === null) {
        cacheBadge.hidden = true;
        cacheBadge.textContent = "";
        cacheBadge.removeAttribute("data-cache");
        return;
      }

      cacheBadge.hidden = false;
      cacheBadge.textContent = `Cache ${cache}`;
      cacheBadge.dataset.cache = cache;
      cacheBadge.title =
        cache === "HIT" ? "Served from the API's in-memory cache" : "Freshly read from the API";
    },

    resetForm() {
      form.reset();
      setInvalid(titleInput, false);
      setInvalid(contentInput, false);
      updateCounter();
    },

    focusField(field: NoteField) {
      if (field === "title") {
        titleInput.focus();
      } else {
        contentInput.focus();
      }
    },
  };

  const controller = createNotesController(api, view);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void controller.createNote({ title: titleInput.value, content: contentInput.value });
  });

  refreshButton.addEventListener("click", () => {
    void controller.loadNotes();
  });

  titleInput.addEventListener("input", () => {
    if (titleInput.value.trim().length > 0) {
      setInvalid(titleInput, false);
      formError.hidden = true;
    }
  });

  contentInput.addEventListener("input", () => {
    updateCounter();
    if (formError.hidden) {
      return;
    }
    setInvalid(contentInput, false);
    formError.hidden = true;
  });

  updateCounter();

  win.setTimeout(() => {
    void controller.loadNotes();
  }, 0);

  return controller;
}

if (typeof document !== "undefined") {
  const start = () => {
    try {
      mountNotesApp();
    } catch (error) {
      console.error(error);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
