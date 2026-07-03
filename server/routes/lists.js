import { Router } from "express";
import crypto from "node:crypto";
import db from "../db.js";
import { broadcast } from "../ws.js";

const router = Router();

function newListId() {
  // Kurzer, URL-freundlicher Code, z.B. "k3v9x2mq" (nur a-z und 0-9)
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(8);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

function getListOr404(req, res) {
  const list = db.prepare("SELECT * FROM lists WHERE id = ?").get(req.params.id);
  if (!list) res.status(404).json({ error: "Liste nicht gefunden" });
  return list;
}

// Neue Liste anlegen
router.post("/", (req, res) => {
  const name = (req.body?.name ?? "").trim() || "Einkaufsliste";
  const id = newListId();
  db.prepare("INSERT INTO lists (id, name) VALUES (?, ?)").run(id, name);
  res.status(201).json({ id, name });
});

// Liste mit allen Items laden
router.get("/:id", (req, res) => {
  const list = getListOr404(req, res);
  if (!list) return;
  const items = db
    .prepare("SELECT * FROM items WHERE list_id = ? ORDER BY checked, id DESC")
    .all(list.id);
  res.json({ ...list, items });
});

// Liste endgültig löschen (Items und Profil-Verknüpfungen kaskadieren)
router.delete("/:id", (req, res) => {
  const list = getListOr404(req, res);
  if (!list) return;
  broadcast(list.id, { type: "list:deleted" });
  db.prepare("DELETE FROM lists WHERE id = ?").run(list.id);
  res.status(204).end();
});

// Item hinzufügen
router.post("/:id/items", (req, res) => {
  const list = getListOr404(req, res);
  if (!list) return;
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Name fehlt" });
  const quantity = (req.body?.quantity ?? "").trim() || null;
  const info = db
    .prepare("INSERT INTO items (list_id, name, quantity) VALUES (?, ?, ?)")
    .run(list.id, name, quantity);
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(info.lastInsertRowid);
  broadcast(list.id, { type: "item:added", item });
  res.status(201).json(item);
});

// Item abhaken / ändern
router.patch("/:id/items/:itemId", (req, res) => {
  const list = getListOr404(req, res);
  if (!list) return;
  const item = db
    .prepare("SELECT * FROM items WHERE id = ? AND list_id = ?")
    .get(req.params.itemId, list.id);
  if (!item) return res.status(404).json({ error: "Item nicht gefunden" });

  const checked = req.body?.checked !== undefined ? (req.body.checked ? 1 : 0) : item.checked;
  const name = (req.body?.name ?? item.name).trim() || item.name;
  db.prepare("UPDATE items SET checked = ?, name = ? WHERE id = ?").run(checked, name, item.id);

  const updated = db.prepare("SELECT * FROM items WHERE id = ?").get(item.id);
  broadcast(list.id, { type: "item:updated", item: updated });
  res.json(updated);
});

// Item löschen
router.delete("/:id/items/:itemId", (req, res) => {
  const list = getListOr404(req, res);
  if (!list) return;
  const info = db
    .prepare("DELETE FROM items WHERE id = ? AND list_id = ?")
    .run(req.params.itemId, list.id);
  if (info.changes === 0) return res.status(404).json({ error: "Item nicht gefunden" });
  broadcast(list.id, { type: "item:deleted", itemId: Number(req.params.itemId) });
  res.status(204).end();
});

// Alle abgehakten Items entfernen
router.delete("/:id/items", (req, res) => {
  const list = getListOr404(req, res);
  if (!list) return;
  db.prepare("DELETE FROM items WHERE list_id = ? AND checked = 1").run(list.id);
  broadcast(list.id, { type: "list:cleared" });
  res.status(204).end();
});

export default router;
