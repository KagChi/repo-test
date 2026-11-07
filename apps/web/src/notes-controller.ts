import type { CacheStatus, NotesApi } from "./api-client";
import { type NoteFormInput, validateNoteForm } from "./notes-form";
import type { Note } from "./types";

/** Tone used to render status messages. */
export type StatusTone = "info" | "success" | "error";

/** A form field that can be marked invalid. */
export type NoteField = "title" | "content";

/**
 * The DOM operations the controller needs.
 *
 * Keeping them behind this interface means the create/refresh/delete flow can
 * be tested without a browser, while `src/browser/app.ts` owns the real DOM.
 */
export interface NotesView {
  renderNotes(notes: Note[]): void;
  setBusy(busy: boolean): void;
  setStatus(message: string, tone?: StatusTone): void;
  setFormError(message: string, field?: NoteField): void;
  setCacheStatus(cache: CacheStatus | null): void;
  resetForm(): void;
  focusField(field: NoteField): void;
}

/** UI-agnostic notes interactions used by the browser app. */
export interface NotesController {
  /** Loads the note list. Resolves to `true` when the refresh succeeded. */
  loadNotes(): Promise<boolean>;
  /** Validates and creates a note, then refreshes the list. */
  createNote(input: NoteFormInput): Promise<boolean>;
  /** Deletes a note, then refreshes the list. */
  deleteNote(id: string, title: string): Promise<boolean>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

/**
 * Wires the notes API to a view.
 *
 * Every write refreshes the list so the UI reflects what the API actually
 * stored, and so the latest `X-Cache` value is shown.
 */
export function createNotesController(api: NotesApi, view: NotesView): NotesController {
  let requestCounter = 0;

  async function loadNotes(): Promise<boolean> {
    const request = ++requestCounter;
    view.setBusy(true);
    view.setStatus("Loading notes…");
    view.setCacheStatus(null);

    try {
      const result = await api.listNotes();
      if (request !== requestCounter) {
        return false;
      }

      view.renderNotes(result.notes);
      view.setCacheStatus(result.cache);
      view.setStatus(
        result.notes.length === 0
          ? "No notes yet. Create your first note with the form."
          : `Loaded ${result.notes.length} note${result.notes.length === 1 ? "" : "s"}.`,
        "success",
      );
      return true;
    } catch (error) {
      if (request !== requestCounter) {
        return false;
      }

      view.renderNotes([]);
      view.setCacheStatus(null);
      view.setStatus(`Could not load notes: ${errorMessage(error)}`, "error");
      return false;
    } finally {
      if (request === requestCounter) {
        view.setBusy(false);
      }
    }
  }

  async function createNote(input: NoteFormInput): Promise<boolean> {
    const validation = validateNoteForm(input);
    if (!validation.ok) {
      view.setFormError(validation.error, validation.field);
      view.setStatus("Please fix the highlighted field.", "error");
      view.focusField(validation.field);
      return false;
    }

    view.setFormError("");
    view.setBusy(true);
    view.setStatus("Saving note…");

    try {
      const { note, cache } = await api.createNote(validation.value);
      view.setCacheStatus(cache);
      view.resetForm();

      const refreshed = await loadNotes();
      if (refreshed) {
        view.setStatus(`Created “${note.title}”.`, "success");
      }
      return true;
    } catch (error) {
      view.setStatus(`Could not create note: ${errorMessage(error)}`, "error");
      return false;
    } finally {
      view.setBusy(false);
    }
  }

  async function deleteNote(id: string, title: string): Promise<boolean> {
    view.setBusy(true);
    view.setStatus(`Deleting “${title}”…`);

    try {
      const { cache } = await api.deleteNote(id);
      view.setCacheStatus(cache);

      const refreshed = await loadNotes();
      if (refreshed) {
        view.setStatus(`Deleted “${title}”.`, "success");
      }
      return true;
    } catch (error) {
      view.setStatus(`Could not delete “${title}”: ${errorMessage(error)}`, "error");
      return false;
    } finally {
      view.setBusy(false);
    }
  }

  return { loadNotes, createNote, deleteNote };
}
