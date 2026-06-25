const notifications = require("./notifications");

const incidents = new Map();
let nextId = 1;

function create({ serviceId, title, severity, description }) {
  const id = String(nextId++);
  const incident = {
    id,
    serviceId,
    title,
    severity: severity || "major",
    description: description || "",
    status: "open",
    updates: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
  };
  incidents.set(id, incident);
  notifications.dispatch("incident.created", incident);
  return incident;
}

function addUpdate(id, { message, status }) {
  const incident = incidents.get(id);
  if (!incident) return null;
  const validStatuses = ["open", "monitoring", "identified", "resolved"];
  const newStatus = validStatuses.includes(status) ? status : incident.status;
  const update = {
    message,
    status: newStatus,
    timestamp: new Date().toISOString(),
  };
  incident.updates.push(update);
  incident.status = newStatus;
  incident.updatedAt = update.timestamp;
  if (newStatus === "resolved") {
    incident.resolvedAt = update.timestamp;
  }
  notifications.dispatch("incident.updated", incident, update);
  if (newStatus === "resolved") {
    notifications.dispatch("incident.resolved", incident);
  }
  return incident;
}

function resolve(id, message) {
  return addUpdate(id, { message: message || "Incident resolved", status: "resolved" });
}

function get(id) {
  return incidents.get(id) || null;
}

function list({ serviceId, status } = {}) {
  let results = Array.from(incidents.values());
  if (serviceId) results = results.filter((i) => i.serviceId === serviceId);
  if (status) results = results.filter((i) => i.status === status);
  return results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function remove(id) {
  const incident = incidents.get(id);
  if (!incident) return false;
  incidents.delete(id);
  notifications.dispatch("incident.deleted", incident);
  return true;
}

module.exports = { create, addUpdate, resolve, get, list, remove };