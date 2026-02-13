/**
 * Dashboard API client — communicates with the MCP server REST API
 * at VITE_APP_DASHBOARD_API_URL (e.g. https://draw-mcp.tranq.services/api)
 */

const DASHBOARD_API =
  import.meta.env.VITE_APP_DASHBOARD_API_URL || "/api";

export interface DiagramSummary {
  id: string;
  title: string | null;
  project: string | null;
  tags: string[];
  shareableUrl: string | null;
  elementCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramListOptions {
  project?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface DiagramSearchOptions {
  query: string;
  project?: string;
  limit?: number;
}

export async function listDiagrams(
  options?: DiagramListOptions,
): Promise<DiagramSummary[]> {
  const params = new URLSearchParams();
  if (options?.project) params.set("project", options.project);
  if (options?.tags?.length) params.set("tags", options.tags.join(","));
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));

  const url = `${DASHBOARD_API}/diagrams${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to list diagrams: ${res.statusText}`);
  const data = await res.json();
  return data.diagrams;
}

export async function searchDiagrams(
  options: DiagramSearchOptions,
): Promise<DiagramSummary[]> {
  const params = new URLSearchParams({ q: options.query });
  if (options.project) params.set("project", options.project);
  if (options.limit) params.set("limit", String(options.limit));

  const url = `${DASHBOARD_API}/diagrams/search?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to search diagrams: ${res.statusText}`);
  const data = await res.json();
  return data.diagrams;
}

export async function listProjects(): Promise<string[]> {
  const res = await fetch(`${DASHBOARD_API}/projects`);
  if (!res.ok) throw new Error(`Failed to list projects: ${res.statusText}`);
  const data = await res.json();
  return data.projects;
}

export async function updateDiagramMeta(
  id: string,
  meta: { title?: string; project?: string; tags?: string[] },
): Promise<void> {
  const res = await fetch(`${DASHBOARD_API}/diagrams/${id}/meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  if (!res.ok) throw new Error(`Failed to update diagram: ${res.statusText}`);
}

export async function saveDiagram(
  id: string,
  elements: readonly any[],
  meta?: { title?: string; project?: string },
): Promise<void> {
  const res = await fetch(`${DASHBOARD_API}/diagrams/${id}/elements`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ elements, ...meta }),
  });
  if (!res.ok) throw new Error(`Failed to save diagram: ${res.statusText}`);
}

export async function loadDiagramElements(
  id: string,
): Promise<{ elements: any[] } | null> {
  const res = await fetch(`${DASHBOARD_API}/diagrams/${id}/elements`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load diagram: ${res.statusText}`);
  return res.json();
}

export async function deleteDiagram(id: string): Promise<void> {
  const res = await fetch(`${DASHBOARD_API}/diagrams/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete diagram: ${res.statusText}`);
}
