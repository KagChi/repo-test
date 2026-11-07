/** A note as exposed by the HTTP API. */
export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** The request body accepted by `POST /api/notes`. */
export interface CreateNoteInput {
  title: string;
  content: string;
}

export const MAX_TITLE_LENGTH = 120;
export const MAX_CONTENT_LENGTH = 5000;

/** The result of validating a note creation payload. */
export type NoteInputValidation =
  | { ok: true; value: CreateNoteInput }
  | { ok: false; error: string };

/**
 * Validates an untrusted `POST /api/notes` payload.
 *
 * A title is required, trimmed, non-empty, and at most {@link MAX_TITLE_LENGTH}
 * characters. Content is required and at most {@link MAX_CONTENT_LENGTH}
 * characters; its whitespace is preserved.
 */
export function validateNoteInput(input: unknown): NoteInputValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const body = input as Record<string, unknown>;

  if (typeof body.title !== "string") {
    return { ok: false, error: "title is required" };
  }

  const title = body.title.trim();
  if (title.length === 0) {
    return { ok: false, error: "title must not be empty" };
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `title must be at most ${MAX_TITLE_LENGTH} characters` };
  }

  if (typeof body.content !== "string") {
    return { ok: false, error: "content is required" };
  }

  if (body.content.length > MAX_CONTENT_LENGTH) {
    return { ok: false, error: `content must be at most ${MAX_CONTENT_LENGTH} characters` };
  }

  return { ok: true, value: { title, content: body.content } };
}
