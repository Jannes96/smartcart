# 🛒 SmartCart

Geteilte Einkaufsliste mit Echtzeit-Sync. Eine Liste erstellen, Link teilen – alle mit dem Link sehen Änderungen sofort (WebSockets), ganz ohne Login.

## Stack

- **Backend:** Node.js 22, Express, `ws` (WebSockets)
- **Datenbank:** SQLite (`better-sqlite3`) – auf Fly.io auf einem persistenten Volume
- **Frontend:** Vanilla HTML/CSS/JS, wird vom selben Server ausgeliefert
- **Deployment:** Docker + Fly.io

## Projektstruktur

```
├── server/
│   ├── index.js         # Express-Server + statische Dateien
│   ├── db.js            # SQLite-Setup & Schema
│   ├── ws.js            # WebSocket-Server (Subscribe/Broadcast pro Liste)
│   └── routes/lists.js  # REST-API für Listen & Items
├── public/              # Frontend (index.html, app.js, style.css)
│   ├── manifest.json    # PWA-Manifest
│   ├── sw.js            # Service Worker (App-Shell offline, API network-first)
│   └── icons/           # App-Icons (192/512 px)
├── Dockerfile
└── fly.toml
```

## Lokal entwickeln

```bash
npm install
npm run dev        # startet mit --watch auf http://localhost:8080
```

Die SQLite-Datenbank landet lokal unter `./data/smartcart.db`.

## Mit Docker

```bash
docker build -t smartcart .
docker run -p 8080:8080 -v smartcart_data:/data smartcart
```

## Auf Fly.io deployen

```bash
fly launch --no-deploy          # oder: fly apps create <name> und app-Name in fly.toml anpassen
fly volumes create smartcart_data --region fra --size 1
fly deploy
```

> **Hinweis:** Die App ist auf **eine** Maschine ausgelegt (SQLite + In-Memory-WebSocket-State). Nicht horizontal skalieren. Für mehrere Regionen/Maschinen wäre z.B. LiteFS oder Postgres nötig.

## PWA

Die App ist installierbar: auf iOS über *Teilen → Zum Home-Bildschirm*, auf Android über den Install-Prompt in Chrome. Der Service Worker cacht die App-Shell (offline nutzbar) und API-Antworten als Lese-Fallback; API-Requests gehen immer zuerst ans Netz.

> **Wichtig:** Wenn sich Frontend-Dateien ändern, `CACHE_VERSION` in [public/sw.js](public/sw.js) hochzählen (z.B. `smartcart-v2`), sonst bekommen installierte Clients den alten Cache-Stand.

## API

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/lists` | Neue Liste anlegen `{ name }` |
| `GET` | `/api/lists/:id` | Liste inkl. Items laden |
| `POST` | `/api/lists/:id/items` | Item hinzufügen `{ name, quantity? }` |
| `PATCH` | `/api/lists/:id/items/:itemId` | Item ändern `{ checked?, name? }` |
| `DELETE` | `/api/lists/:id/items/:itemId` | Item löschen |
| `DELETE` | `/api/lists/:id/items` | Alle abgehakten Items entfernen |
| `POST` | `/api/profiles` | Sync-Profil anlegen → `{ code }` |
| `GET` | `/api/profiles/:code/lists` | Listen des Profils |
| `PUT` | `/api/profiles/:code/lists/:listId` | Liste zum Profil hinzufügen |
| `DELETE` | `/api/profiles/:code/lists/:listId` | Liste aus dem Profil entfernen |

## Geräte-Sync

Die Übersicht „Deine Listen“ liegt normalerweise im `localStorage` (pro Gerät). Über **Geräte-Sync** auf der Startseite lässt sich ein Sync-Code erstellen (z.B. `tiger-apfel-50`) und auf anderen Geräten eingeben — danach zeigen alle verbundenen Geräte dieselbe Listen-Übersicht. Der Code ist faktisch das Passwort des Profils: nicht öffentlich teilen. Beim Verbinden werden lokal gemerkte Listen ins Profil übernommen (Merge).

WebSocket: `wss://…/ws`, danach `{ "type": "subscribe", "listId": "…" }` senden. Der Server broadcastet `item:added`, `item:updated`, `item:deleted`, `list:cleared`.
