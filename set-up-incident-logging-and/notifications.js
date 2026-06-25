const https = require("https");
const http = require("http");

const subscribers = new Map(); // serviceId -> Set of URLs
const hooks = []; // global hooks: [{ filter, fn }]
let nextSubId = 1;

function registerHook(fn, filter) {
  const id = nextSubId++;
  hooks.push({ id, fn, filter: filter || null });
  return id;
}

function removeHook(id) {
  const idx = hooks.findIndex((h) => h.id === id);
  if (idx === -1) return false;
  hooks.splice(idx, 1);
  return true;
}

function subscribe(serviceId, webhookUrl) {
  if (!subscribers.has(serviceId)) subscribers.set(serviceId, new Set());
  subscribers.get(serviceId).add(webhookUrl);
  return { serviceId, webhookUrl };
}

function unsubscribe(serviceId, webhookUrl) {
  const set = subscribers.get(serviceId);
  if (!set) return false;
  const had = set.delete(webhookUrl);
  if (set.size === 0) subscribers.delete(serviceId);
  return had;
}

function dispatch(eventType, incident, extra) {
  const payload = { event: eventType, incident, extra: extra || null, timestamp: new Date().toISOString() };
  // Run global hooks
  for (const hook of hooks) {
    if (hook.filter && !hook.filter(eventType, incident)) continue;
    try { hook.fn(payload); } catch (_) { /* swallow hook errors */ }
  }
  // Notify webhook subscribers for this service
  const urls = subscribers.get(incident.serviceId);
  if (!urls) return;
  const body = JSON.stringify(payload);
  for (const url of urls) {
    _sendWebhook(url, body).catch(() => {});
  }
}

async function _sendWebhook(url, body) {
  const mod = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 5000 },
      (res) => { res.resume(); resolve(res.statusCode); }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

function listSubscriptions(serviceId) {
  const set = subscribers.get(serviceId);
  return set ? Array.from(set) : [];
}

module.exports = { registerHook, removeHook, subscribe, unsubscribe, dispatch, listSubscriptions };