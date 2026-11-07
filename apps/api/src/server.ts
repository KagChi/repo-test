import { createApp } from "./app";
import { resolveDbPath } from "./store";

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

const server = Bun.serve({
  port,
  fetch: (request) => app.fetch(request),
});

console.log(`Notes API listening on ${server.url} (db: ${resolveDbPath()})`);
