import { WebSocketServer } from "ws";

// list_id -> Set<WebSocket>
const subscribers = new Map();

export function setupWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    ws.listId = null;

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === "subscribe" && typeof msg.listId === "string") {
        unsubscribe(ws);
        ws.listId = msg.listId;
        if (!subscribers.has(msg.listId)) subscribers.set(msg.listId, new Set());
        subscribers.get(msg.listId).add(ws);
      }
    });

    ws.on("close", () => unsubscribe(ws));
  });

  return wss;
}

function unsubscribe(ws) {
  if (ws.listId && subscribers.has(ws.listId)) {
    subscribers.get(ws.listId).delete(ws);
    if (subscribers.get(ws.listId).size === 0) subscribers.delete(ws.listId);
  }
  ws.listId = null;
}

export function broadcast(listId, payload) {
  const subs = subscribers.get(listId);
  if (!subs) return;
  const data = JSON.stringify(payload);
  for (const ws of subs) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}
