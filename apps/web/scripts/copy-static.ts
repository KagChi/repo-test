/**
 * Copies the static HTML/CSS into `dist/client` so a built web server is
 * self-contained. `bun build` only emits the browser JavaScript.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const source = join(import.meta.dir, "..", "src", "client");
const destination = join(import.meta.dir, "..", "dist", "client");

await mkdir(destination, { recursive: true });

for (const file of ["index.html", "styles.css"]) {
  await copyFile(join(source, file), join(destination, file));
  console.log(`Copied ${file} to dist/client`);
}
