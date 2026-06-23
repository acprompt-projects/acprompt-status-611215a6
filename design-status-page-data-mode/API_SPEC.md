===ACP_EOF===
===ACP_FILE: design-status-page-data-mode/schema.ts===
export interface ServiceStatus {
  id: string;
  name: string;
  group: string;
  health: "healthy" | "degraded" | "down" | "maintenance";
  uptimePercent: number;       // 0-100, rolling 30-day
  lastIncident: string | null; // ISO-8601 timestamp
  responseTimeMs: number | null;
  updatedAt: string;           // ISO-8601 timestamp
}

export interface Incident {
  id: string;
  serviceId: string;
  title: string;
  severity: "minor" | "major" | "critical";
  status: "investigating" | "identified" | "monitoring" | "resolved";
  startedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdate[];
}

export interface IncidentUpdate {
  id: string;
  body: string;
  status: Incident["status"];
  createdAt: string;
}

export interface Summary {
  overallHealth: ServiceStatus["health"];
  healthyCount: number;
  degradedCount: number;
  downCount: number;
  lastChecked: string;
}

// --- API Response Shapes ---

export interface ServicesResponse {
  data: ServiceStatus[];
}

export interface ServiceResponse {
  data: ServiceStatus;
}

export interface IncidentsResponse {
  data: Incident[];
}

export interface IncidentResponse {
  data: Incident;
}

export interface SummaryResponse {
  data: Summary;
}

export interface ErrorResponse {
  error: { code: number; message: string };
}