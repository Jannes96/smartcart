import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import listsRouter from "./routes/lists.js";
import profilesRouter from "./routes/profiles.js";
import { setupWebSocket } from "./ws.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 8080;

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

app.use("/api/lists", listsRouter);
app.use("/api/profiles", profilesRouter);

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Listen-URLs wie /list/k3v9x2mq liefern die SPA aus
app.get("/list/:id", (_req, res) => {
  res.sendFile(join(__dirname, "..", "public", "index.html"));
});

const httpServer = createServer(app);
setupWebSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`SmartCart läuft auf http://localhost:${PORT}`);
});
