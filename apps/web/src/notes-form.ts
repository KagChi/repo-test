/**
 * Form-level validation shared by the browser UI and its tests.
 *
 * These limits mirror the notes API. They are duplicated (instead of imported
 * from the API workspace) so the browser bundle never depends on server code.
 */

export const MAX_TITLE_LENGTH = 120;
export const MAX_CONTENT_LENGTH = 5000;

/** Raw values read from the new-note form. */
export interface NoteFormInput {
  title: string;
  content: string;
}

/** A validated, trimmed note payload ready for `POST /api/notes`. */
export interface ValidNoteForm {
  ok: true;
  value: NoteFormInput;
}

/** A validation failure tied to the field the user must fix. */
export interface InvalidNoteForm {
  ok: false;
  field: "title" | "content";
  error: string;
}

export type NoteFormValidation = ValidNoteForm | InvalidNoteForm;

/** Validates the new-note form, mirroring the API's own rules. */
export function validateNoteForm(input: NoteFormInput): NoteFormValidation {
  const title = input.title.trim();

  if (title.length === 0) {
    return { ok: false, field: "title", error: "Title is required." };
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return {
      ok: false,
      field: "title",
      error: `Title must be at most ${MAX_TITLE_LENGTH} characters.`,
    };
  }

  if (input.content.length > MAX_CONTENT_LENGTH) {
    return {
      ok: false,
      field: "content",
      error: `Content must be at most ${MAX_CONTENT_LENGTH} characters.`,
    };
  }

  return { ok: true, value: { title, content: input.content } };
}
