import { createWebApp } from "./server";

const port = Number(process.env.WEB_PORT ?? process.env.PORT ?? 3000);
const app = createWebApp();

const server = Bun.serve({
  port,
  fetch: (request) => app.fetch(request),
});

console.log(`Notes web app listening on ${server.url} (api: ${app.apiBaseUrl})`);
