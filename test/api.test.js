// End-to-End-Smoke-Tests: startet den echten Server auf einer temporären
// SQLite-Datei und spricht ihn über HTTP bzw. WebSocket an.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

const PORT = 8099;
const BASE = `http://127.0.0.1:${PORT}`;

let server;
let dataDir;

async function api(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = res.status === 204 ? null : await res.json();
  return { status: res.status, body };
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "smartcart-test-"));
  server = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: String(PORT), DATABASE_PATH: join(dataDir, "test.db") },
    stdio: "ignore",
  });

  // Auf den Health-Check warten, statt blind zu schlafen.
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch {
      // Server noch nicht bereit
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server ist nicht gestartet");
});

after(() => {
  server?.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("Listen-API", () => {
  it("legt eine Liste an und liefert sie wieder aus", async () => {
    const created = await api("/api/lists", {
      method: "POST",
      body: JSON.stringify({ name: "Wocheneinkauf" }),
    });
    assert.equal(created.status, 201);
    assert.match(created.body.id, /^[a-z0-9]{8}$/);

    const loaded = await api(`/api/lists/${created.body.id}`);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.name, "Wocheneinkauf");
    assert.deepEqual(loaded.body.items, []);
  });

  it("antwortet auf unbekannte Listen mit 404", async () => {
    const res = await api("/api/lists/gibtsnich");
    assert.equal(res.status, 404);
  });

  it("fügt Items hinzu, hakt sie ab und räumt sie weg", async () => {
    const { body: list } = await api("/api/lists", {
      method: "POST",
      body: JSON.stringify({ name: "Test" }),
    });

    const added = await api(`/api/lists/${list.id}/items`, {
      method: "POST",
      body: JSON.stringify({ name: "Milch", quantity: "2 l" }),
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.checked, 0);

    const patched = await api(`/api/lists/${list.id}/items/${added.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ checked: true }),
    });
    assert.equal(patched.body.checked, 1);

    const cleared = await api(`/api/lists/${list.id}/items`, { method: "DELETE" });
    assert.equal(cleared.status, 204);

    const { body: reloaded } = await api(`/api/lists/${list.id}`);
    assert.deepEqual(reloaded.items, []);
  });

  it("lehnt Items ohne Namen ab", async () => {
    const { body: list } = await api("/api/lists", { method: "POST", body: "{}" });
    const res = await api(`/api/lists/${list.id}/items`, {
      method: "POST",
      body: JSON.stringify({ name: "   " }),
    });
    assert.equal(res.status, 400);
  });
});

describe("Kategorien", () => {
  it("vergibt ohne Angabe die Default-Kategorie", async () => {
    const { body: list } = await api("/api/lists", { method: "POST", body: "{}" });
    const { body: item } = await api(`/api/lists/${list.id}/items`, {
      method: "POST",
      body: JSON.stringify({ name: "Irgendwas" }),
    });
    assert.equal(item.category, "sonstiges");
  });

  it("übernimmt eine gültige Kategorie beim Anlegen", async () => {
    const { body: list } = await api("/api/lists", { method: "POST", body: "{}" });
    const { body: item } = await api(`/api/lists/${list.id}/items`, {
      method: "POST",
      body: JSON.stringify({ name: "Äpfel", category: "obst-gemuese" }),
    });
    assert.equal(item.category, "obst-gemuese");

    const { body: reloaded } = await api(`/api/lists/${list.id}`);
    assert.equal(reloaded.items[0].category, "obst-gemuese");
  });

  it("ändert die Kategorie per PATCH", async () => {
    const { body: list } = await api("/api/lists", { method: "POST", body: "{}" });
    const { body: item } = await api(`/api/lists/${list.id}/items`, {
      method: "POST",
      body: JSON.stringify({ name: "Kokosmilch", category: "molkerei" }),
    });

    const { body: patched } = await api(`/api/lists/${list.id}/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ category: "vorrat" }),
    });
    assert.equal(patched.category, "vorrat");
    // Der Name darf durch ein reines Kategorie-Update nicht verloren gehen
    assert.equal(patched.name, "Kokosmilch");
  });

  it("fällt bei unbekannter Kategorie auf den bisherigen Wert zurück", async () => {
    const { body: list } = await api("/api/lists", { method: "POST", body: "{}" });
    const { body: item } = await api(`/api/lists/${list.id}/items`, {
      method: "POST",
      body: JSON.stringify({ name: "Brot", category: "backwaren" }),
    });

    const neu = await api(`/api/lists/${list.id}/items`, {
      method: "POST",
      body: JSON.stringify({ name: "Unfug", category: "gibtsnicht" }),
    });
    assert.equal(neu.body.category, "sonstiges");

    const { body: patched } = await api(`/api/lists/${list.id}/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ category: "<script>" }),
    });
    assert.equal(patched.category, "backwaren");
  });

  it("lässt das Abhaken die Kategorie unberührt", async () => {
    const { body: list } = await api("/api/lists", { method: "POST", body: "{}" });
    const { body: item } = await api(`/api/lists/${list.id}/items`, {
      method: "POST",
      body: JSON.stringify({ name: "Eier", category: "molkerei" }),
    });
    const { body: patched } = await api(`/api/lists/${list.id}/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ checked: true }),
    });
    assert.equal(patched.checked, 1);
    assert.equal(patched.category, "molkerei");
  });
});

describe("Sync-Profile", () => {
  it("verknüpft Listen mit einem Sync-Code", async () => {
    const { body: profile } = await api("/api/profiles", { method: "POST" });
    assert.match(profile.code, /^[a-zäöü]+-[a-zäöü]+-\d{2}$/);

    const { body: list } = await api("/api/lists", {
      method: "POST",
      body: JSON.stringify({ name: "Geteilt" }),
    });

    const linked = await api(`/api/profiles/${profile.code}/lists/${list.id}`, { method: "PUT" });
    assert.equal(linked.status, 204);

    const { body: lists } = await api(`/api/profiles/${profile.code}/lists`);
    assert.deepEqual(lists, [{ id: list.id, name: "Geteilt" }]);

    await api(`/api/profiles/${profile.code}/lists/${list.id}`, { method: "DELETE" });
    const { body: empty } = await api(`/api/profiles/${profile.code}/lists`);
    assert.deepEqual(empty, []);
  });
});

describe("WebSocket-Broadcast", () => {
  it("benachrichtigt Abonnenten über neue Items", async () => {
    const { body: list } = await api("/api/lists", {
      method: "POST",
      body: JSON.stringify({ name: "Live" }),
    });

    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    ws.send(JSON.stringify({ type: "subscribe", listId: list.id }));

    const message = new Promise((resolve) => {
      ws.once("message", (raw) => resolve(JSON.parse(raw)));
    });

    await api(`/api/lists/${list.id}/items`, {
      method: "POST",
      body: JSON.stringify({ name: "Brot" }),
    });

    const event = await message;
    assert.equal(event.type, "item:added");
    assert.equal(event.item.name, "Brot");
    ws.close();
  });
});
