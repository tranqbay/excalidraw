import React, { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import { restore } from "@excalidraw/excalidraw/data/restore";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import { decryptData, IV_LENGTH_BYTES } from "@excalidraw/excalidraw/data/encryption";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { DiagramSummary } from "../data/dashboard";
import {
  listDiagrams,
  searchDiagrams,
  listProjects,
  deleteDiagram,
} from "../data/dashboard";

import "./DashboardSidebar.scss";

export const DASHBOARD_SIDEBAR_NAME = "dashboard";
const DASHBOARD_TAB_ALL = "all";
const DASHBOARD_TAB_PROJECTS = "projects";

const BACKEND_V2_GET = import.meta.env.VITE_APP_BACKEND_V2_GET_URL;

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/**
 * Loads a diagram from the storage backend using its shareable URL.
 * Uses the same decryption/decompression flow as importFromBackend.
 */
async function loadDiagramFromUrl(
  shareableUrl: string,
): Promise<ImportedDataState | null> {
  try {
    const url = new URL(shareableUrl);
    const hash = url.hash.slice(1); // remove #
    const jsonParam = hash.startsWith("json=")
      ? hash.slice(5)
      : new URLSearchParams(hash).get("json");
    if (!jsonParam) return null;

    const [id, decryptionKey] = jsonParam.split(",");
    if (!id || !decryptionKey || !BACKEND_V2_GET) return null;

    const response = await fetch(`${BACKEND_V2_GET}${id}`);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();

    // Use the new format (compressData/decompressData) first, fall back to legacy
    try {
      const { data: decodedBuffer } = await decompressData(
        new Uint8Array(buffer),
        { decryptionKey },
      );
      const data: ImportedDataState = JSON.parse(
        new TextDecoder().decode(decodedBuffer),
      );
      return {
        elements: data.elements || null,
        appState: data.appState || null,
      };
    } catch {
      // Legacy format: IV + encrypted data (no compression wrapper)
      const iv = new Uint8Array(buffer.slice(0, IV_LENGTH_BYTES));
      const encrypted = buffer.slice(IV_LENGTH_BYTES, buffer.byteLength);
      const decrypted = await decryptData(iv, encrypted, decryptionKey);
      const text = new TextDecoder("utf-8").decode(new Uint8Array(decrypted));
      const data: ImportedDataState = JSON.parse(text);
      return {
        elements: data.elements || null,
        appState: data.appState || null,
      };
    }
  } catch (err) {
    console.error("Failed to load diagram from URL:", err);
    return null;
  }
}

function DiagramCard({
  diagram,
  onLoad,
  onDelete,
}: {
  diagram: DiagramSummary;
  onLoad: (diagram: DiagramSummary) => void;
  onDelete: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="dashboard-diagram-card" onClick={() => onLoad(diagram)}>
      <div className="dashboard-diagram-card__header">
        <span className="dashboard-diagram-card__title">
          {diagram.title || "Untitled"}
        </span>
        <button
          className="dashboard-diagram-card__menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          ...
        </button>
        {showMenu && (
          <div className="dashboard-diagram-card__menu">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (diagram.shareableUrl) {
                  window.open(diagram.shareableUrl, "_blank");
                }
                setShowMenu(false);
              }}
              disabled={!diagram.shareableUrl}
            >
              Open link
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(diagram.id);
                setShowMenu(false);
              }}
              className="dashboard-diagram-card__delete"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="dashboard-diagram-card__meta">
        {diagram.project && (
          <span className="dashboard-diagram-card__project">
            {diagram.project}
          </span>
        )}
        <span className="dashboard-diagram-card__elements">
          {diagram.elementCount} elements
        </span>
        <span className="dashboard-diagram-card__date">
          {formatDate(diagram.updatedAt)}
        </span>
      </div>
      {diagram.tags.length > 0 && (
        <div className="dashboard-diagram-card__tags">
          {diagram.tags.map((tag) => (
            <span key={tag} className="dashboard-diagram-card__tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function useLoadDiagram(excalidrawAPI: ExcalidrawImperativeAPI) {
  return useCallback(
    async (diagram: DiagramSummary) => {
      if (!diagram.shareableUrl) return;
      const data = await loadDiagramFromUrl(diagram.shareableUrl);
      if (!data) return;

      const restored = restore(data, null, null, { repairBindings: true });
      excalidrawAPI.updateScene({
        elements: restored.elements,
        appState: {
          ...restored.appState,
          name: diagram.title || "Untitled",
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    [excalidrawAPI],
  );
}

function useDeleteDiagram(
  setDiagrams: React.Dispatch<React.SetStateAction<DiagramSummary[]>>,
) {
  return useCallback(
    async (id: string) => {
      try {
        await deleteDiagram(id);
        setDiagrams((prev) => prev.filter((d) => d.id !== id));
      } catch (err) {
        console.error("Failed to delete diagram:", err);
      }
    },
    [setDiagrams],
  );
}

function AllDiagramsTab({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) {
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const fetchDiagrams = useCallback(async (query?: string) => {
    setLoading(true);
    setError(null);
    try {
      const results = query
        ? await searchDiagrams({ query })
        : await listDiagrams({ limit: 50 });
      setDiagrams(results);
    } catch (err: any) {
      setError(err.message || "Failed to load diagrams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiagrams();
  }, [fetchDiagrams]);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimeout) clearTimeout(searchTimeout);
      const timeout = setTimeout(() => {
        fetchDiagrams(value || undefined);
      }, 300);
      setSearchTimeout(timeout);
    },
    [fetchDiagrams, searchTimeout],
  );

  const handleLoad = useLoadDiagram(excalidrawAPI);
  const handleDelete = useDeleteDiagram(setDiagrams);

  return (
    <div className="dashboard-all-tab">
      <div className="dashboard-search">
        <input
          type="text"
          placeholder="Search diagrams..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="dashboard-search__input"
        />
      </div>
      <div className="dashboard-diagram-list">
        {loading && (
          <div className="dashboard-empty">Loading diagrams...</div>
        )}
        {error && <div className="dashboard-error">{error}</div>}
        {!loading && !error && diagrams.length === 0 && (
          <div className="dashboard-empty">
            {searchQuery ? "No diagrams found" : "No diagrams yet"}
          </div>
        )}
        {diagrams.map((diagram) => (
          <DiagramCard
            key={diagram.id}
            diagram={diagram}
            onLoad={handleLoad}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectsTab({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) {
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedProject) {
      setLoading(true);
      listDiagrams({ project: selectedProject })
        .then(setDiagrams)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [selectedProject]);

  const handleLoad = useLoadDiagram(excalidrawAPI);
  const handleDelete = useDeleteDiagram(setDiagrams);

  if (!selectedProject) {
    return (
      <div className="dashboard-projects-tab">
        {loading && (
          <div className="dashboard-empty">Loading projects...</div>
        )}
        {!loading && projects.length === 0 && (
          <div className="dashboard-empty">No projects yet</div>
        )}
        {projects.map((project) => (
          <div
            key={project}
            className="dashboard-project-item"
            onClick={() => setSelectedProject(project)}
          >
            <span className="dashboard-project-item__icon">&#128193;</span>
            <span className="dashboard-project-item__name">{project}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="dashboard-projects-tab">
      <button
        className="dashboard-back-btn"
        onClick={() => {
          setSelectedProject(null);
          setDiagrams([]);
        }}
      >
        &#8592; Back to projects
      </button>
      <h3 className="dashboard-project-title">{selectedProject}</h3>
      <div className="dashboard-diagram-list">
        {loading && (
          <div className="dashboard-empty">Loading diagrams...</div>
        )}
        {!loading && diagrams.length === 0 && (
          <div className="dashboard-empty">No diagrams in this project</div>
        )}
        {diagrams.map((diagram) => (
          <DiagramCard
            key={diagram.id}
            diagram={diagram}
            onLoad={handleLoad}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}

export const DashboardSidebar: React.FC<{
  excalidrawAPI: ExcalidrawImperativeAPI;
}> = ({ excalidrawAPI }) => {
  // Only render if dashboard API URL is configured
  if (!import.meta.env.VITE_APP_DASHBOARD_API_URL) {
    return null;
  }

  return (
    <Sidebar name={DASHBOARD_SIDEBAR_NAME}>
      <Sidebar.Tabs>
        <Sidebar.Header>
          <span className="dashboard-sidebar-title">My Diagrams</span>
          <Sidebar.TabTriggers>
            <Sidebar.TabTrigger tab={DASHBOARD_TAB_ALL}>
              All
            </Sidebar.TabTrigger>
            <Sidebar.TabTrigger tab={DASHBOARD_TAB_PROJECTS}>
              Projects
            </Sidebar.TabTrigger>
          </Sidebar.TabTriggers>
        </Sidebar.Header>
        <Sidebar.Tab tab={DASHBOARD_TAB_ALL}>
          <AllDiagramsTab excalidrawAPI={excalidrawAPI} />
        </Sidebar.Tab>
        <Sidebar.Tab tab={DASHBOARD_TAB_PROJECTS}>
          <ProjectsTab excalidrawAPI={excalidrawAPI} />
        </Sidebar.Tab>
      </Sidebar.Tabs>
    </Sidebar>
  );
};
