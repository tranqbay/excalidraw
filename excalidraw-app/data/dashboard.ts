/**
 * Dashboard API client — communicates with the MCP server REST API
 * at VITE_APP_DASHBOARD_API_URL (e.g. https://draw-mcp.tranq.services/api)
 */

import { getValidToken, refreshToken } from "./auth";

const DASHBOARD_API =
  import.meta.env.VITE_APP_DASHBOARD_API_URL || "/api";

export interface DiagramSummary {
  id: string;
  title: string | null;
  project: string | null;
  tags: string[];
  shareableUrl: string | null;
  elementCount: number;
  pinned: boolean;
  ownerId: string | null;
  visibility: "public" | "private";
  collabLink: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramListOptions {
  project?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  mine?: boolean;
}

export interface DiagramSearchOptions {
  query: string;
  project?: string;
  limit?: number;
}

export interface ProjectMetadata {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}

export interface ProjectSummary extends ProjectMetadata {
  pinned: boolean;
  diagramCount: number;
  ownerId: string | null;
  visibility: "public" | "private";
  createdAt: string;
  updatedAt: string;
}

export interface ShareEntry {
  id: number;
  resourceType: "diagram" | "project";
  resourceId: string;
  ownerId: string;
  sharedWith: string;
  permission: "read" | "write";
  createdAt: string;
}

// --- Auth-aware fetch wrapper ---

async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = await getValidToken();
  const headers = new Headers(options?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...options, headers });

  // If 401 and we had a token, try refresh once
  if (res.status === 401 && token) {
    const newToken = await refreshToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      return fetch(url, { ...options, headers });
    }
  }

  return res;
}

// --- Diagrams ---

export async function listDiagrams(
  options?: DiagramListOptions,
): Promise<DiagramSummary[]> {
  const params = new URLSearchParams();
  if (options?.project) params.set("project", options.project);
  if (options?.tags?.length) params.set("tags", options.tags.join(","));
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  if (options?.mine) params.set("mine", "true");

  const url = `${DASHBOARD_API}/diagrams${params.toString() ? `?${params}` : ""}`;
  const res = await authFetch(url);
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
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`Failed to search diagrams: ${res.statusText}`);
  const data = await res.json();
  return data.diagrams;
}

// --- Projects ---

export async function listProjects(): Promise<ProjectSummary[]> {
  const res = await authFetch(`${DASHBOARD_API}/projects`);
  if (!res.ok) throw new Error(`Failed to list projects: ${res.statusText}`);
  const data = await res.json();
  return data.projects;
}

export async function getProject(
  name: string,
): Promise<ProjectSummary | null> {
  const res = await authFetch(
    `${DASHBOARD_API}/projects/${encodeURIComponent(name)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get project: ${res.statusText}`);
  const data = await res.json();
  return data.project;
}

export async function createProject(meta: ProjectMetadata): Promise<void> {
  const res = await authFetch(`${DASHBOARD_API}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  if (res.status === 409)
    throw new Error("Project already exists");
  if (!res.ok) throw new Error(`Failed to create project: ${res.statusText}`);
}

export async function updateProject(
  name: string,
  meta: { description?: string; color?: string; icon?: string; pinned?: boolean },
): Promise<void> {
  const res = await authFetch(
    `${DASHBOARD_API}/projects/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    },
  );
  if (!res.ok) throw new Error(`Failed to update project: ${res.statusText}`);
}

export async function renameProject(
  oldName: string,
  newName: string,
): Promise<void> {
  const res = await authFetch(
    `${DASHBOARD_API}/projects/${encodeURIComponent(oldName)}/rename`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newName }),
    },
  );
  if (!res.ok) throw new Error(`Failed to rename project: ${res.statusText}`);
}

export async function deleteProject(name: string): Promise<void> {
  const res = await authFetch(
    `${DASHBOARD_API}/projects/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to delete project: ${res.statusText}`);
}

// --- Diagram CRUD ---

export async function updateDiagramMeta(
  id: string,
  meta: { title?: string; project?: string; tags?: string[]; pinned?: boolean; collabLink?: string | null },
): Promise<void> {
  const res = await authFetch(`${DASHBOARD_API}/diagrams/${id}/meta`, {
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
  const res = await authFetch(`${DASHBOARD_API}/diagrams/${id}/elements`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ elements, ...meta }),
  });
  if (!res.ok) throw new Error(`Failed to save diagram: ${res.statusText}`);
}

export async function loadDiagramElements(
  id: string,
): Promise<{ elements: any[]; permission?: string } | null> {
  const res = await authFetch(`${DASHBOARD_API}/diagrams/${id}/elements`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load diagram: ${res.statusText}`);
  return res.json();
}

export async function deleteDiagram(id: string): Promise<void> {
  const res = await authFetch(`${DASHBOARD_API}/diagrams/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete diagram: ${res.statusText}`);
}

// --- Visibility ---

export async function setDiagramVisibility(
  id: string,
  visibility: "public" | "private",
): Promise<void> {
  const res = await authFetch(`${DASHBOARD_API}/diagrams/${id}/visibility`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visibility }),
  });
  if (!res.ok) throw new Error(`Failed to set diagram visibility: ${res.statusText}`);
}

export async function setProjectVisibility(
  name: string,
  visibility: "public" | "private",
): Promise<void> {
  const res = await authFetch(
    `${DASHBOARD_API}/projects/${encodeURIComponent(name)}/visibility`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    },
  );
  if (!res.ok) throw new Error(`Failed to set project visibility: ${res.statusText}`);
}

// --- Shares ---

export async function listDiagramShares(id: string): Promise<ShareEntry[]> {
  const res = await authFetch(`${DASHBOARD_API}/diagrams/${id}/shares`);
  if (!res.ok) throw new Error(`Failed to list shares: ${res.statusText}`);
  const data = await res.json();
  return data.shares;
}

export async function shareDiagram(
  id: string,
  sharedWith: string,
  permission: "read" | "write" = "read",
): Promise<void> {
  const res = await authFetch(`${DASHBOARD_API}/diagrams/${id}/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sharedWith, permission }),
  });
  if (!res.ok) throw new Error(`Failed to share diagram: ${res.statusText}`);
}

export async function unshareDiagram(id: string, userId: string): Promise<void> {
  const res = await authFetch(`${DASHBOARD_API}/diagrams/${id}/shares/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to revoke share: ${res.statusText}`);
}

export async function listProjectShares(name: string): Promise<ShareEntry[]> {
  const res = await authFetch(`${DASHBOARD_API}/projects/${encodeURIComponent(name)}/shares`);
  if (!res.ok) throw new Error(`Failed to list project shares: ${res.statusText}`);
  const data = await res.json();
  return data.shares;
}

export async function shareProject(
  name: string,
  sharedWith: string,
  permission: "read" | "write" = "read",
): Promise<void> {
  const res = await authFetch(`${DASHBOARD_API}/projects/${encodeURIComponent(name)}/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sharedWith, permission }),
  });
  if (!res.ok) throw new Error(`Failed to share project: ${res.statusText}`);
}

export async function unshareProject(name: string, userId: string): Promise<void> {
  const res = await authFetch(`${DASHBOARD_API}/projects/${encodeURIComponent(name)}/shares/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to revoke project share: ${res.statusText}`);
}

// --- User lookup ---

export async function lookupUser(email: string): Promise<{ userId: string; email: string } | null> {
  const res = await authFetch(`${DASHBOARD_API}/users/lookup?email=${encodeURIComponent(email)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to lookup user: ${res.statusText}`);
  return res.json();
}

// --- Auth check ---

export async function checkAuth(): Promise<{ authenticated: boolean; userId: string | null; userType: string | null }> {
  const res = await authFetch(`${DASHBOARD_API}/auth/me`);
  if (!res.ok) return { authenticated: false, userId: null, userType: null };
  return res.json();
}
