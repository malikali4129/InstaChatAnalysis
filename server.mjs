import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const host = "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const fullPath = normalize(join(root, requested));

  if (!fullPath.startsWith(root) || !existsSync(fullPath) || !statSync(fullPath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": types[extname(fullPath)] || "application/octet-stream" });
  createReadStream(fullPath).pipe(response);
}).listen(port, host, () => {
  console.log(`Chat analysis app: http://${host}:${port}/`);
});
