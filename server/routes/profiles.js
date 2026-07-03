import { Router } from "express";
import crypto from "node:crypto";
import db from "../db.js";

const router = Router();

// Merkbare Codes wie "tiger-fluss-47". Der Code ist faktisch das Passwort des Profils.
const WORDS = [
  "apfel", "birne", "tiger", "fuchs", "berg", "fluss", "wolke", "stern",
  "eiche", "luchs", "moos", "kiesel", "falke", "biber", "klee", "zimt",
];

function newCode() {
  const pick = () => WORDS[crypto.randomInt(WORDS.length)];
  return `${pick()}-${pick()}-${crypto.randomInt(10, 100)}`;
}

function getProfileOr404(req, res) {
  const profile = db
    .prepare("SELECT * FROM profiles WHERE code = ?")
    .get(req.params.code.toLowerCase().trim());
  if (!profile) res.status(404).json({ error: "Sync-Code nicht gefunden" });
  return profile;
}

// Neues Sync-Profil anlegen
router.post("/", (_req, res) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    try {
      db.prepare("INSERT INTO profiles (code) VALUES (?)").run(code);
      return res.status(201).json({ code });
    } catch {
      // Kollision – neuer Versuch
    }
  }
  res.status(500).json({ error: "Konnte keinen Code erzeugen" });
});

// Listen eines Profils
router.get("/:code/lists", (req, res) => {
  const profile = getProfileOr404(req, res);
  if (!profile) return;
  const lists = db
    .prepare(
      `SELECT l.id, l.name FROM profile_lists pl
       JOIN lists l ON l.id = pl.list_id
       WHERE pl.profile_code = ?
       ORDER BY pl.added_at DESC`
    )
    .all(profile.code);
  res.json(lists);
});

// Liste zum Profil hinzufügen (idempotent)
router.put("/:code/lists/:listId", (req, res) => {
  const profile = getProfileOr404(req, res);
  if (!profile) return;
  const list = db.prepare("SELECT id FROM lists WHERE id = ?").get(req.params.listId);
  if (!list) return res.status(404).json({ error: "Liste nicht gefunden" });
  db.prepare(
    "INSERT OR REPLACE INTO profile_lists (profile_code, list_id, added_at) VALUES (?, ?, datetime('now'))"
  ).run(profile.code, list.id);
  res.status(204).end();
});

// Liste aus dem Profil entfernen (die Liste selbst bleibt bestehen)
router.delete("/:code/lists/:listId", (req, res) => {
  const profile = getProfileOr404(req, res);
  if (!profile) return;
  db.prepare("DELETE FROM profile_lists WHERE profile_code = ? AND list_id = ?").run(
    profile.code,
    req.params.listId
  );
  res.status(204).end();
});

export default router;
