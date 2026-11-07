import type { Note } from "./types";

/** Cache annotation returned by the API through the `X-Cache` header. */
export type CacheStatus = "HIT" | "MISS";

/** Body accepted by `POST /api/notes`. */
export interface CreateNoteInput {
  title: string;
  content: string;
}

/** Result of listing notes, including the API's cache status when present. */
export interface NotesListResult {
  notes: Note[];
  cache: CacheStatus | null;
}

/** Result of creating a note. */
export interface NoteResult {
  note: Note;
  cache: CacheStatus | null;
}

/** Result of deleting a note. */
export interface DeleteNoteResult {
  cache: CacheStatus | null;
}

/** Minimal fetch signature so tests can inject a fake implementation. */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** A failure returned by the notes API (or the network). */
export class NotesApiError extends Error {
  /** HTTP status, or `0` when the API could not be reached. */
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "NotesApiError";
    this.status = status;
  }
}

/** Browser-facing notes API client. */
export interface NotesApi {
  listNotes(options?: { signal?: AbortSignal }): Promise<NotesListResult>;
  createNote(input: CreateNoteInput): Promise<NoteResult>;
  deleteNote(id: string): Promise<DeleteNoteResult>;
}

export interface CreateNotesApiOptions {
  /** Same-origin API prefix. Defaults to `/api`. */
  baseUrl?: string;
  /** Fetch implementation. Defaults to the global `fetch`. */
  fetch?: FetchLike;
}

const JSON_HEADERS: Readonly<Record<string, string>> = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function parseCache(response: Response): CacheStatus | null {
  const value = response.headers.get("x-cache");
  return value === "HIT" || value === "MISS" ? value : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function responseError(response: Response): Promise<NotesApiError> {
  const payload = await readJson(response);

  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const message = (payload as { error?: unknown }).error;
    if (typeof message === "string" && message.trim().length > 0) {
      return new NotesApiError(message, response.status);
    }
  }

  const statusText = response.statusText.trim();
  const detail =
    statusText.length > 0 ? `${response.status} ${statusText}` : String(response.status);
  return new NotesApiError(`The notes API responded with ${detail}.`, response.status);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNote(value: unknown, response: Response): Note {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.content !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new NotesApiError("The notes API returned an unexpected note payload.", response.status);
  }

  return {
    id: value.id,
    title: value.title,
    content: value.content,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

/**
 * Creates a notes API client.
 *
 * All requests are relative to `baseUrl` (`/api` by default), so the browser
 * talks to the web server's same-origin proxy rather than the API directly.
 */
export function createNotesApi(options: CreateNotesApiOptions = {}): NotesApi {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? "/api");
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function send(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(`${baseUrl}${path}`, init);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw new NotesApiError("Could not reach the notes API. Check that it is running.");
    }
  }

  return {
    async listNotes(requestOptions = {}) {
      const response = await send("/notes", {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: requestOptions.signal,
      });

      if (!response.ok) {
        throw await responseError(response);
      }

      const payload = await readJson(response);
      if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new NotesApiError("The notes API returned an unexpected response.", response.status);
      }

      return {
        notes: payload.data.map((note) => parseNote(note, response)),
        cache: parseCache(response),
      };
    },

    async createNote(input) {
      const response = await send("/notes", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ title: input.title, content: input.content }),
      });

      if (!response.ok) {
        throw await responseError(response);
      }

      const payload = await readJson(response);
      if (!isRecord(payload) || !("data" in payload)) {
        throw new NotesApiError("The notes API returned an unexpected response.", response.status);
      }

      return {
        note: parseNote(payload.data, response),
        cache: parseCache(response),
      };
    },

    async deleteNote(id) {
      const response = await send(`/notes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw await responseError(response);
      }

      return { cache: parseCache(response) };
    },
  };
}

let defaultApi: NotesApi | undefined;

function defaultNotesApi(): NotesApi {
  defaultApi ??= createNotesApi();
  return defaultApi;
}

/** Lists notes through the same-origin `/api/notes` endpoint. */
export function listNotes(options?: { signal?: AbortSignal }): Promise<NotesListResult> {
  return defaultNotesApi().listNotes(options);
}

/** Creates a note through the same-origin `/api/notes` endpoint. */
export function createNote(input: CreateNoteInput): Promise<NoteResult> {
  return defaultNotesApi().createNote(input);
}

/** Deletes a note through the same-origin `/api/notes/:id` endpoint. */
export function deleteNote(id: string): Promise<DeleteNoteResult> {
  return defaultNotesApi().deleteNote(id);
}
