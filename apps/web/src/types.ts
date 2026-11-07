/**
 * Browser-safe re-export of the HTTP API's `Note` shape.
 *
 * The import is type-only, so bundling this module never pulls the API's
 * SQLite store or `Bun.serve` handler into the browser bundle.
 */
import type { Note } from "../../api/src/notes";

export type { Note };
