import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CreateNoteInput, Note } from "./notes";

/** Local SQLite file used when `DB_PATH` is not set. */
export const DEFAULT_DB_PATH = join("data", "notes.sqlite");

interface NoteRow {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = "id, title, content, created_at, updated_at";

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Resolves the database location from `DB_PATH` or the local default. */
export function resolveDbPath(): string {
  const configured = process.env.DB_PATH?.trim();
  return configured !== undefined && configured.length > 0 ? configured : DEFAULT_DB_PATH;
}

/**
 * SQLite-backed persistence for notes.
 *
 * The database is opened eagerly and the `notes` table is created when it does
 * not exist yet. Pass `":memory:"` for an ephemeral database, which is handy in
 * tests.
 */
export class NotesStore {
  private readonly db: Database;

  constructor(dbPath: string = resolveDbPath()) {
    if (dbPath !== ":memory:" && dbPath !== "") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  /** Returns every note, oldest first. */
  list(): Note[] {
    const rows = this.db
      .query<NoteRow, []>(`SELECT ${SELECT_COLUMNS} FROM notes ORDER BY created_at ASC, rowid ASC`)
      .all();

    return rows.map(toNote);
  }

  /** Returns a single note or `undefined` when it does not exist. */
  get(id: string): Note | undefined {
    const row = this.db
      .query<NoteRow, [string]>(`SELECT ${SELECT_COLUMNS} FROM notes WHERE id = ?`)
      .get(id);

    return row === null ? undefined : toNote(row);
  }

  /** Inserts a note and returns the persisted record. */
  create(input: CreateNoteInput): Note {
    const timestamp = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: input.title,
      content: input.content,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.run(
      "INSERT INTO notes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [note.id, note.title, note.content, note.createdAt, note.updatedAt],
    );

    return note;
  }

  /** Deletes a note, returning whether one was removed. */
  delete(id: string): boolean {
    const result = this.db.run("DELETE FROM notes WHERE id = ?", [id]);
    return result.changes > 0;
  }

  /** Closes the underlying SQLite connection. */
  close(): void {
    this.db.close();
  }
}
