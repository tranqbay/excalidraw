import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { restore } from "@excalidraw/excalidraw/data/restore";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { DiagramSummary, ProjectSummary, ProjectMetadata } from "../data/dashboard";
import {
  listDiagrams,
  searchDiagrams,
  listProjects,
  loadDiagramElements,
  deleteDiagram,
  updateDiagramMeta,
  createProject,
  updateProject,
  renameProject,
  deleteProject,
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
  onRename,
  onSetProject,
  currentDiagramId,
}: {
  diagram: DiagramSummary;
  onLoad: (diagram: DiagramSummary) => Promise<void>;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onSetProject: (id: string, project: string) => Promise<void>;
  currentDiagramId: string | null;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showProjectInput, setShowProjectInput] = useState(false);
  const [projectValue, setProjectValue] = useState("");
  const [projectSuggestions, setProjectSuggestions] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const renameSubmittedRef = useRef(false);
  const projectSubmittedRef = useRef(false);

  const isCurrent = diagram.id === currentDiagramId;

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!showMenu) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMenu]);

  // Auto-focus rename input
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // Auto-focus project input and fetch suggestions
  useEffect(() => {
    if (showProjectInput) {
      projectInputRef.current?.focus();
      listProjects()
        .then((projects) => setProjectSuggestions(projects.map((p) => p.name)))
        .catch(() => {});
    }
  }, [showProjectInput]);

  const handleClick = async () => {
    if (loading || isRenaming || showProjectInput || showMenu) return;
    setLoading(true);
    try {
      await onLoad(diagram);
    } finally {
      setLoading(false);
    }
  };

  const handleRenameSubmit = async () => {
    if (renameSubmittedRef.current) return;
    renameSubmittedRef.current = true;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== (diagram.title || "")) {
      await onRename(diagram.id, trimmed);
    }
    setIsRenaming(false);
    renameSubmittedRef.current = false;
  };

  const handleProjectSubmit = async () => {
    if (projectSubmittedRef.current) return;
    projectSubmittedRef.current = true;
    const trimmed = projectValue.trim();
    if (trimmed) {
      await onSetProject(diagram.id, trimmed);
    }
    setShowProjectInput(false);
    setProjectValue("");
    projectSubmittedRef.current = false;
  };

  const cardClass = [
    "dashboard-diagram-card",
    loading && "dashboard-diagram-card--loading",
    isCurrent && "dashboard-diagram-card--current",
    (showMenu || showProjectInput) && "dashboard-diagram-card--menu-open",
  ].filter(Boolean).join(" ");

  return (
    <div className={cardClass} onClick={handleClick}>
      <div className="dashboard-diagram-card__header">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="dashboard-diagram-card__rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onBlur={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="dashboard-diagram-card__title">
            {diagram.title || "Untitled"}
          </span>
        )}
        <button
          ref={menuBtnRef}
          className="dashboard-diagram-card__menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          ...
        </button>
      </div>
      {showProjectInput && (
        <div
          className="dashboard-diagram-card__project-input-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={projectInputRef}
            className="dashboard-diagram-card__rename-input"
            placeholder="Project name..."
            value={projectValue}
            onChange={(e) => setProjectValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") handleProjectSubmit();
              if (e.key === "Escape") {
                setShowProjectInput(false);
                setProjectValue("");
              }
            }}
            onBlur={handleProjectSubmit}
            list={`project-suggestions-${diagram.id}`}
          />
          {projectSuggestions.length > 0 && (
            <datalist id={`project-suggestions-${diagram.id}`}>
              {projectSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          )}
        </div>
      )}
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
      {showMenu && (
        <div ref={menuRef} className="dashboard-diagram-card__menu">
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
              setShowMenu(false);
              setRenameValue(diagram.title || "");
              setIsRenaming(true);
            }}
          >
            Rename
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              setProjectValue(diagram.project || "");
              setShowProjectInput(true);
            }}
          >
            Set project
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
  );
}

function useLoadDiagram(
  excalidrawAPI: ExcalidrawImperativeAPI,
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>,
  flushDashboardSave?: () => void,
  skipNextDashboardSave?: (elements?: readonly any[]) => void,
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
        // Skip the auto-save triggered by updateScene and set fingerprint for loaded elements
        skipNextDashboardSave?.(restored.elements);
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
  opts?: {
    currentDiagramId: string | null;
    dashboardDiagramIdRef?: React.MutableRefObject<string | null>;
    flushDashboardSave?: () => void;
    skipNextDashboardSave?: (elements?: readonly any[]) => void;
    excalidrawAPI?: ExcalidrawImperativeAPI;
    onDiagramLoaded?: (id: string) => void;
  },
) {
  return useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this diagram? This cannot be undone.")) {
        return;
      }
      try {
        // If deleting the currently loaded diagram, switch to a new blank diagram
        // BEFORE the API call to prevent the debounced auto-save from re-creating it
        if (opts && id === opts.currentDiagramId && opts.dashboardDiagramIdRef && opts.excalidrawAPI) {
          const newId = `web-${crypto.randomUUID()}`;
          opts.dashboardDiagramIdRef.current = newId;
          localStorage.setItem("dashboard-diagram-id", newId);
          opts.skipNextDashboardSave?.([]);
          opts.excalidrawAPI.updateScene({
            elements: [],
            appState: { name: "" },
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
          opts.onDiagramLoaded?.(newId);
        }
        await deleteDiagram(id);
        setDiagrams((prev) => prev.filter((d) => d.id !== id));
      } catch (err) {
        console.error("Failed to delete diagram:", err);
      }
    },
    [setDiagrams, opts],
  );
}

function AllDiagramsTab({
  excalidrawAPI,
  dashboardDiagramIdRef,
  flushDashboardSave,
  skipNextDashboardSave,
  currentDiagramId,
  onDiagramLoaded,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>;
  flushDashboardSave?: () => void;
  skipNextDashboardSave?: (elements?: readonly any[]) => void;
  currentDiagramId: string | null;
  onDiagramLoaded: (id: string) => void;
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

  const baseHandleLoad = useLoadDiagram(excalidrawAPI, dashboardDiagramIdRef, flushDashboardSave, skipNextDashboardSave);
  const handleLoad = useCallback(async (diagram: DiagramSummary) => {
    await baseHandleLoad(diagram);
    onDiagramLoaded(diagram.id);
  }, [baseHandleLoad, onDiagramLoaded]);
  const handleDelete = useDeleteDiagram(setDiagrams, {
    currentDiagramId,
    dashboardDiagramIdRef,
    flushDashboardSave,
    skipNextDashboardSave,
    excalidrawAPI,
    onDiagramLoaded: onDiagramLoaded,
  });

  const handleRename = useCallback(async (id: string, title: string) => {
    await updateDiagramMeta(id, { title });
    setDiagrams((prev) => prev.map((d) => d.id === id ? { ...d, title } : d));
  }, []);

  const handleSetProject = useCallback(async (id: string, project: string) => {
    await updateDiagramMeta(id, { project });
    setDiagrams((prev) => prev.map((d) => d.id === id ? { ...d, project } : d));
  }, []);

  return (
    <div className="dashboard-all-tab">
      <div className="dashboard-search">
        <input
          type="text"
          placeholder="Search diagrams..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
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
            onRename={handleRename}
            onSetProject={handleSetProject}
            currentDiagramId={currentDiagramId}
          />
        ))}
      </div>
    </div>
  );
}

const PROJECT_COLORS = [
  "#6554c0",
  "#0065ff",
  "#00875a",
  "#ff991f",
  "#de350b",
  "#ff5630",
  "#6b778c",
];

function ProjectCard({
  project,
  onSelect,
  onEdit,
  onDelete,
}: {
  project: ProjectSummary;
  onSelect: (project: ProjectSummary) => void;
  onEdit: (project: ProjectSummary) => void;
  onDelete: (name: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMenu]);

  return (
    <div className={`dashboard-project-card${showMenu ? " dashboard-project-card--menu-open" : ""}`} onClick={() => onSelect(project)}>
      <div className="dashboard-project-card__header">
        <span
          className="dashboard-project-card__dot"
          style={{ background: project.color || "#6554c0" }}
        />
        {project.icon && (
          <span className="dashboard-project-card__icon">{project.icon}</span>
        )}
        <span className="dashboard-project-card__name">{project.name}</span>
        <button
          ref={menuBtnRef}
          className="dashboard-diagram-card__menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          ...
        </button>
      </div>
      {project.description && (
        <div className="dashboard-project-card__desc">{project.description}</div>
      )}
      <div className="dashboard-project-card__meta">
        <span>{project.diagramCount} diagram{project.diagramCount !== 1 ? "s" : ""}</span>
        <span>{formatDate(project.updatedAt)}</span>
      </div>
      {showMenu && (
        <div ref={menuRef} className="dashboard-project-card__menu">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              onEdit(project);
            }}
          >
            Edit
          </button>
          <button
            className="dashboard-diagram-card__delete"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              onDelete(project.name);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectEditForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ProjectSummary;
  onSave: (data: { name: string; description?: string; color?: string; icon?: string; originalName?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? "#6554c0");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: trimmedName,
        description: description.trim() || undefined,
        color,
        icon: icon.trim() || undefined,
        originalName: initial?.name,
      });
    } catch (err: any) {
      setError(err.message || "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="dashboard-project-form" onSubmit={handleSubmit}>
      <label className="dashboard-project-form__label">
        Name
        <input
          ref={nameRef}
          className="dashboard-project-form__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Project name"
          required
        />
      </label>
      <label className="dashboard-project-form__label">
        Description
        <textarea
          className="dashboard-project-form__textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Optional description..."
          rows={3}
        />
      </label>
      <label className="dashboard-project-form__label">
        Color
        <div className="dashboard-project-form__color-grid">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`dashboard-project-form__color-swatch${c === color ? " dashboard-project-form__color-swatch--active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </label>
      <label className="dashboard-project-form__label">
        Icon (emoji)
        <input
          className="dashboard-project-form__input"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={`e.g. \u{1F4C1}`}
        />
      </label>
      {error && <div className="dashboard-error" style={{ padding: "0.5rem 0" }}>{error}</div>}
      <div className="dashboard-project-form__actions">
        <button
          type="button"
          className="dashboard-project-form__cancel"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="dashboard-project-form__save"
          disabled={saving || !name.trim()}
        >
          {saving ? "Saving..." : initial ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}

type ProjectsView = "list" | "form" | "drilldown";

function ProjectsTab({
  excalidrawAPI,
  dashboardDiagramIdRef,
  flushDashboardSave,
  skipNextDashboardSave,
  currentDiagramId,
  onDiagramLoaded,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>;
  flushDashboardSave?: () => void;
  skipNextDashboardSave?: (elements?: readonly any[]) => void;
  currentDiagramId: string | null;
  onDiagramLoaded: (id: string) => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [view, setView] = useState<ProjectsView>("list");
  const [editingProject, setEditingProject] = useState<ProjectSummary | undefined>();
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(() => {
    setLoading(true);
    listProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (selectedProject && view === "drilldown") {
      setLoading(true);
      listDiagrams({ project: selectedProject.name })
        .then(setDiagrams)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [selectedProject, view]);

  const baseHandleLoad = useLoadDiagram(excalidrawAPI, dashboardDiagramIdRef, flushDashboardSave, skipNextDashboardSave);
  const handleLoad = useCallback(async (diagram: DiagramSummary) => {
    await baseHandleLoad(diagram);
    onDiagramLoaded(diagram.id);
  }, [baseHandleLoad, onDiagramLoaded]);
  const handleDeleteDiagram = useDeleteDiagram(setDiagrams, {
    currentDiagramId,
    dashboardDiagramIdRef,
    flushDashboardSave,
    skipNextDashboardSave,
    excalidrawAPI,
    onDiagramLoaded: onDiagramLoaded,
  });

  const handleRename = useCallback(async (id: string, title: string) => {
    await updateDiagramMeta(id, { title });
    setDiagrams((prev) => prev.map((d) => d.id === id ? { ...d, title } : d));
  }, []);

  const handleSetProject = useCallback(async (id: string, project: string) => {
    await updateDiagramMeta(id, { project });
    setDiagrams((prev) => prev.map((d) => d.id === id ? { ...d, project } : d));
    fetchProjects();
  }, [fetchProjects]);

  const handleSelectProject = useCallback((project: ProjectSummary) => {
    setSelectedProject(project);
    setView("drilldown");
  }, []);

  const handleEditProject = useCallback((project: ProjectSummary) => {
    setEditingProject(project);
    setView("form");
  }, []);

  const handleDeleteProject = useCallback(async (name: string) => {
    if (!window.confirm(`Delete project "${name}"? Diagrams will be unassigned but not deleted.`)) return;
    try {
      await deleteProject(name);
      setProjects((prev) => prev.filter((p) => p.name !== name));
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  }, []);

  const handleSaveProject = useCallback(async (data: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    originalName?: string;
  }) => {
    const { originalName, ...meta } = data;
    if (originalName) {
      // Editing existing project
      if (originalName !== meta.name) {
        await renameProject(originalName, meta.name);
      }
      await updateProject(meta.name, {
        description: meta.description,
        color: meta.color,
        icon: meta.icon,
      });
    } else {
      await createProject(meta as ProjectMetadata);
    }
    setView("list");
    setEditingProject(undefined);
    fetchProjects();
  }, [fetchProjects]);

  // List view
  if (view === "list") {
    return (
      <div className="dashboard-projects-tab">
        <div className="dashboard-projects-tab__actions">
          <button
            className="dashboard-new-project-btn"
            onClick={() => {
              setEditingProject(undefined);
              setView("form");
            }}
          >
            + New Project
          </button>
        </div>
        {loading && (
          <div className="dashboard-empty">Loading projects...</div>
        )}
        {!loading && projects.length === 0 && (
          <div className="dashboard-empty">No projects yet. Create one to organize your diagrams.</div>
        )}
        <div className="dashboard-project-list">
          {projects.map((project) => (
            <ProjectCard
              key={project.name}
              project={project}
              onSelect={handleSelectProject}
              onEdit={handleEditProject}
              onDelete={handleDeleteProject}
            />
          ))}
        </div>
      </div>
    );
  }

  // Form view (create or edit)
  if (view === "form") {
    return (
      <div className="dashboard-projects-tab">
        <button
          className="dashboard-back-btn"
          onClick={() => {
            setView("list");
            setEditingProject(undefined);
          }}
        >
          &#8592; Back to projects
        </button>
        <h3 className="dashboard-project-title">
          {editingProject ? "Edit Project" : "New Project"}
        </h3>
        <ProjectEditForm
          initial={editingProject}
          onSave={handleSaveProject}
          onCancel={() => {
            setView("list");
            setEditingProject(undefined);
          }}
        />
      </div>
    );
  }

  // Drill-down view
  return (
    <div className="dashboard-projects-tab">
      <button
        className="dashboard-back-btn"
        onClick={() => {
          setView("list");
          setSelectedProject(null);
          setDiagrams([]);
        }}
      >
        &#8592; Back to projects
      </button>
      <div className="dashboard-project-title-row">
        {selectedProject?.color && (
          <span
            className="dashboard-project-card__dot"
            style={{ background: selectedProject.color }}
          />
        )}
        <h3 className="dashboard-project-title">
          {selectedProject?.icon ? `${selectedProject.icon} ` : ""}
          {selectedProject?.name}
        </h3>
      </div>
      {selectedProject?.description && (
        <p className="dashboard-project-desc">{selectedProject.description}</p>
      )}
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
            onDelete={handleDeleteDiagram}
            onRename={handleRename}
            onSetProject={handleSetProject}
            currentDiagramId={currentDiagramId}
          />
        ))}
      </div>
    </div>
  );
}

export type DashboardSaveStatus = "idle" | "saving" | "saved" | "error";

function SaveStatusIndicator({ status }: { status: DashboardSaveStatus }) {
  const className = `dashboard-save-status dashboard-save-status--${status}`;
  return (
    <span className={className}>
      {status === "saving" && "Saving..."}
      {status === "saved" && "\u2713 Saved"}
      {status === "error" && "\u2022 Save failed"}
      {status === "idle" && "\u00A0"}
    </span>
  );
}

export const DashboardSidebar: React.FC<{
  excalidrawAPI: ExcalidrawImperativeAPI;
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>;
  flushDashboardSave?: () => void;
  skipNextDashboardSave?: (elements?: readonly any[]) => void;
  dashboardSaveStatus?: DashboardSaveStatus;
}> = ({ excalidrawAPI, dashboardDiagramIdRef, flushDashboardSave, skipNextDashboardSave, dashboardSaveStatus = "idle" }) => {
  const [currentDiagramId, setCurrentDiagramId] = useState<string | null>(
    dashboardDiagramIdRef?.current ?? null,
  );

  const handleDiagramLoaded = useCallback((id: string) => {
    setCurrentDiagramId(id);
  }, []);

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
      setCurrentDiagramId(newId);
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
          <SaveStatusIndicator status={dashboardSaveStatus} />
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
            currentDiagramId={currentDiagramId}
            onDiagramLoaded={handleDiagramLoaded}
          />
        </Sidebar.Tab>
        <Sidebar.Tab tab={DASHBOARD_TAB_PROJECTS}>
          <ProjectsTab
            excalidrawAPI={excalidrawAPI}
            dashboardDiagramIdRef={dashboardDiagramIdRef}
            flushDashboardSave={flushDashboardSave}
            skipNextDashboardSave={skipNextDashboardSave}
            currentDiagramId={currentDiagramId}
            onDiagramLoaded={handleDiagramLoaded}
          />
        </Sidebar.Tab>
      </Sidebar.Tabs>
    </Sidebar>
  );
};
