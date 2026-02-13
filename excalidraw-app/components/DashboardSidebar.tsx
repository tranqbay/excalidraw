import React, { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { restore } from "@excalidraw/excalidraw/data/restore";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { DiagramSummary } from "../data/dashboard";
import {
  listDiagrams,
  searchDiagrams,
  listProjects,
  loadDiagramElements,
  deleteDiagram,
} from "../data/dashboard";

import "./DashboardSidebar.scss";

export const DASHBOARD_SIDEBAR_NAME = "dashboard";
const DASHBOARD_TAB_ALL = "all";
const DASHBOARD_TAB_PROJECTS = "projects";

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

function DiagramCard({
  diagram,
  onLoad,
  onDelete,
}: {
  diagram: DiagramSummary;
  onLoad: (diagram: DiagramSummary) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onLoad(diagram);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`dashboard-diagram-card${loading ? " dashboard-diagram-card--loading" : ""}`}
      onClick={handleClick}
    >
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

function useLoadDiagram(
  excalidrawAPI: ExcalidrawImperativeAPI,
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>,
  flushDashboardSave?: () => void,
  skipNextDashboardSave?: () => void,
) {
  return useCallback(
    async (diagram: DiagramSummary) => {
      try {
        // Flush any pending auto-save for the current diagram before switching
        flushDashboardSave?.();

        const data = await loadDiagramElements(diagram.id);
        if (!data || !data.elements?.length) return;

        const restored = restore(
          { elements: data.elements, appState: null },
          null,
          null,
          { repairBindings: true },
        );
        // Update the diagram ID ref so auto-save updates this diagram
        if (dashboardDiagramIdRef) {
          dashboardDiagramIdRef.current = diagram.id;
          localStorage.setItem("dashboard-diagram-id", diagram.id);
        }
        // Skip the auto-save triggered by updateScene (data hasn't changed)
        skipNextDashboardSave?.();
        excalidrawAPI.updateScene({
          elements: restored.elements,
          appState: {
            ...restored.appState,
            name: diagram.title || "Untitled",
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      } catch (err) {
        console.error("Failed to load diagram:", err);
      }
    },
    [excalidrawAPI, dashboardDiagramIdRef, flushDashboardSave, skipNextDashboardSave],
  );
}

function useDeleteDiagram(
  setDiagrams: React.Dispatch<React.SetStateAction<DiagramSummary[]>>,
) {
  return useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this diagram? This cannot be undone.")) {
        return;
      }
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
  dashboardDiagramIdRef,
  flushDashboardSave,
  skipNextDashboardSave,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>;
  flushDashboardSave?: () => void;
  skipNextDashboardSave?: () => void;
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

  const handleLoad = useLoadDiagram(excalidrawAPI, dashboardDiagramIdRef, flushDashboardSave, skipNextDashboardSave);
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
  dashboardDiagramIdRef,
  flushDashboardSave,
  skipNextDashboardSave,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>;
  flushDashboardSave?: () => void;
  skipNextDashboardSave?: () => void;
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

  const handleLoad = useLoadDiagram(excalidrawAPI, dashboardDiagramIdRef, flushDashboardSave, skipNextDashboardSave);
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
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>;
  flushDashboardSave?: () => void;
  skipNextDashboardSave?: () => void;
}> = ({ excalidrawAPI, dashboardDiagramIdRef, flushDashboardSave, skipNextDashboardSave }) => {
  // Only render if dashboard API URL is configured
  if (!import.meta.env.VITE_APP_DASHBOARD_API_URL) {
    return null;
  }

  const handleNewDiagram = () => {
    // Flush pending save for current diagram before switching
    flushDashboardSave?.();
    if (dashboardDiagramIdRef) {
      const newId = `web-${crypto.randomUUID()}`;
      dashboardDiagramIdRef.current = newId;
      localStorage.setItem("dashboard-diagram-id", newId);
    }
    // Skip the auto-save triggered by updateScene (empty canvas, nothing to save)
    skipNextDashboardSave?.();
    excalidrawAPI.updateScene({
      elements: [],
      appState: { name: "" },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  return (
    <Sidebar name={DASHBOARD_SIDEBAR_NAME}>
      <Sidebar.Tabs>
        <Sidebar.Header>
          <span className="dashboard-sidebar-title">My Diagrams</span>
          <button
            className="dashboard-new-btn"
            onClick={handleNewDiagram}
            title="New diagram"
          >
            + New
          </button>
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
          <AllDiagramsTab
            excalidrawAPI={excalidrawAPI}
            dashboardDiagramIdRef={dashboardDiagramIdRef}
            flushDashboardSave={flushDashboardSave}
            skipNextDashboardSave={skipNextDashboardSave}
          />
        </Sidebar.Tab>
        <Sidebar.Tab tab={DASHBOARD_TAB_PROJECTS}>
          <ProjectsTab
            excalidrawAPI={excalidrawAPI}
            dashboardDiagramIdRef={dashboardDiagramIdRef}
            flushDashboardSave={flushDashboardSave}
            skipNextDashboardSave={skipNextDashboardSave}
          />
        </Sidebar.Tab>
      </Sidebar.Tabs>
    </Sidebar>
  );
};
