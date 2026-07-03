const $ = (sel) => document.querySelector(sel);

const state = {
  listId: null,
  items: [],
  ws: null,
};

// ---------- Gemerkte Listen (localStorage + optionaler Geräte-Sync) ----------

const STORAGE_KEY = "smartcart:lists";
const SYNC_KEY = "smartcart:sync";

const syncCode = () => localStorage.getItem(SYNC_KEY);

function savedLists() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function rememberList(id, name) {
  const lists = savedLists().filter((l) => l.id !== id);
  lists.unshift({ id, name });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists.slice(0, 20)));
  const code = syncCode();
  if (code) fetch(`/api/profiles/${code}/lists/${id}`, { method: "PUT" }).catch(() => {});
}

function forgetList(id) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLists().filter((l) => l.id !== id)));
  const code = syncCode();
  if (code) fetch(`/api/profiles/${code}/lists/${id}`, { method: "DELETE" }).catch(() => {});
}

// Lokale Listen ins Profil übertragen (beim Aktivieren/Verbinden)
async function pushLocalListsToProfile(code) {
  await Promise.allSettled(
    savedLists().map((l) => fetch(`/api/profiles/${code}/lists/${l.id}`, { method: "PUT" }))
  );
}

// ---------- Routing ----------

function currentListId() {
  const match = location.pathname.match(/^\/list\/([a-z0-9_-]+)$/i);
  return match ? match[1] : null;
}

async function init() {
  const listId = currentListId();
  if (listId) {
    await openList(listId);
  } else {
    showHome();
  }
}

async function showHome() {
  $("#view-home").hidden = false;
  renderSyncSection();

  let lists = savedLists();
  const code = syncCode();
  if (code) {
    try {
      const res = await fetch(`/api/profiles/${code}/lists`);
      if (res.ok) {
        lists = await res.json();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lists)); // Offline-Cache aktualisieren
      } else if (res.status === 404) {
        // Profil existiert nicht (mehr) – Code lokal verwerfen
        localStorage.removeItem(SYNC_KEY);
        renderSyncSection();
      }
    } catch {
      // Offline: lokaler Stand bleibt
    }
  }
  renderMyLists(lists);
}

function renderMyLists(lists) {
  $("#my-lists").hidden = !lists.length;
  const ul = $("#my-lists-items");
  ul.innerHTML = "";
  for (const l of lists) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `/list/${l.id}`;
    a.textContent = l.name;
    li.appendChild(a);
    ul.appendChild(li);
  }
}

// ---------- Geräte-Sync UI ----------

function renderSyncSection() {
  const code = syncCode();
  $("#sync-off").hidden = !!code;
  $("#sync-on").hidden = !code;
  if (code) $("#sync-code-display").textContent = code;
}

$("#sync-create").addEventListener("click", async () => {
  const res = await fetch("/api/profiles", { method: "POST" });
  if (!res.ok) return alert("Sync-Code konnte nicht erstellt werden.");
  const { code } = await res.json();
  localStorage.setItem(SYNC_KEY, code);
  await pushLocalListsToProfile(code);
  showHome();
});

$("#sync-join").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("#sync-code-input").value.toLowerCase().trim();
  if (!code) return;
  const res = await fetch(`/api/profiles/${code}/lists`);
  if (!res.ok) return alert("Diesen Sync-Code gibt es nicht.");
  localStorage.setItem(SYNC_KEY, code);
  await pushLocalListsToProfile(code); // lokale Listen mitnehmen (Merge)
  $("#sync-code-input").value = "";
  showHome();
});

$("#sync-copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(syncCode());
  $("#sync-copy").textContent = "✓ Kopiert!";
  setTimeout(() => ($("#sync-copy").textContent = "Code kopieren"), 2000);
});

$("#sync-leave").addEventListener("click", () => {
  localStorage.removeItem(SYNC_KEY);
  showHome();
});

// ---------- Startansicht ----------

$("#create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const res = await fetch("/api/lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: $("#create-name").value }),
  });
  const list = await res.json();
  location.href = `/list/${list.id}`;
});

$("#open-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  // Auch komplette Links akzeptieren, nicht nur den nackten Code
  const input = $("#open-code").value.trim().toLowerCase();
  const code = input.split("/list/").pop().replace(/[^a-z0-9_-]/g, "");
  if (!code) return;
  const res = await fetch(`/api/lists/${code}`);
  if (!res.ok) return alert("Diesen Listen-Code gibt es nicht.");
  location.href = `/list/${code}`;
});

// ---------- Listenansicht ----------

async function openList(listId) {
  const res = await fetch(`/api/lists/${listId}`);
  if (!res.ok) {
    forgetList(listId);
    showHome();
    alert("Diese Liste existiert nicht (mehr).");
    return;
  }
  const list = await res.json();
  state.listId = listId;
  state.items = list.items;
  rememberList(listId, list.name);

  $("#list-name").textContent = list.name;
  $("#list-code").textContent = listId;
  $("#view-list").hidden = false;
  renderItems();
  connectWebSocket();
}

function renderItems() {
  const ul = $("#items");
  ul.innerHTML = "";
  for (const item of state.items) {
    const li = document.createElement("li");
    li.className = item.checked ? "checked" : "";

    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!item.checked;
    checkbox.addEventListener("change", () => toggleItem(item, checkbox.checked));

    const text = document.createElement("span");
    text.textContent = item.quantity ? `${item.name} (${item.quantity})` : item.name;

    label.append(checkbox, text);

    const del = document.createElement("button");
    del.className = "delete";
    del.textContent = "×";
    del.addEventListener("click", () => deleteItem(item));

    li.append(label, del);
    ul.appendChild(li);
  }
}

$("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#add-name").value.trim();
  if (!name) return;
  await fetch(`/api/lists/${state.listId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, quantity: $("#add-qty").value }),
  });
  $("#add-name").value = "";
  $("#add-qty").value = "";
  $("#add-name").focus();
});

async function toggleItem(item, checked) {
  await fetch(`/api/lists/${state.listId}/items/${item.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checked }),
  });
}

async function deleteItem(item) {
  await fetch(`/api/lists/${state.listId}/items/${item.id}`, { method: "DELETE" });
}

$("#clear-btn").addEventListener("click", async () => {
  await fetch(`/api/lists/${state.listId}/items`, { method: "DELETE" });
});

$("#share-btn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(location.href);
  $("#share-btn").textContent = "✓ Kopiert!";
  setTimeout(() => ($("#share-btn").textContent = "🔗 Teilen"), 2000);
});

// ---------- Echtzeit-Sync ----------

function connectWebSocket() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  state.ws = ws;

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "subscribe", listId: state.listId }));
    setStatus("● live", true);
  });

  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
      case "item:added":
        if (!state.items.some((i) => i.id === msg.item.id)) state.items.unshift(msg.item);
        break;
      case "item:updated": {
        const idx = state.items.findIndex((i) => i.id === msg.item.id);
        if (idx !== -1) state.items[idx] = msg.item;
        break;
      }
      case "item:deleted":
        state.items = state.items.filter((i) => i.id !== msg.itemId);
        break;
      case "list:cleared":
        state.items = state.items.filter((i) => !i.checked);
        break;
    }
    renderItems();
  });

  ws.addEventListener("close", () => {
    setStatus("○ getrennt – verbinde neu…", false);
    setTimeout(connectWebSocket, 2000);
  });
}

function setStatus(text, live) {
  const el = $("#status");
  el.textContent = text;
  el.classList.toggle("live", live);
}

init();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
