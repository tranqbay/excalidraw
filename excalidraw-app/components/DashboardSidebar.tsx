import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { restore } from "@excalidraw/excalidraw/data/restore";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type {
  DiagramSummary,
  ProjectSummary,
  ProjectMetadata,
} from "../data/dashboard";
import {
  listDiagrams,
  searchDiagrams,
  listProjects,
  loadDiagramElements,
  deleteDiagram,
  updateDiagramMeta,
  saveDiagram,
  createProject,
  updateProject,
  renameProject,
  deleteProject,
  setDiagramVisibility,
  setProjectVisibility,
  listDiagramVersions,
  restoreDiagramVersion,
} from "../data/dashboard";
import type { DiagramVersion } from "../data/dashboard";
import type { AuthState } from "../data/auth";
import type { CollabAPI } from "../collab/Collab";
import { getCollaborationLinkData } from "../data";

import "./DashboardSidebar.scss";

export const DASHBOARD_SIDEBAR_NAME = "dashboard";
const DASHBOARD_TAB_ALL = "all";
const DASHBOARD_TAB_MINE = "mine";
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

// =============================================================
// Login Form
// =============================================================


// =============================================================
// Project Picker
// =============================================================

function ProjectPicker({
  projects,
  currentProject,
  onSelect,
  onClear,
  onClose,
}: {
  projects: ProjectSummary[];
  currentProject: string | null;
  onSelect: (projectName: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    filterInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const exactMatch = projects.some(
    (p) => p.name.toLowerCase() === filter.trim().toLowerCase(),
  );

  return (
    <div
      ref={pickerRef}
      className="dashboard-project-picker"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={filterInputRef}
        className="dashboard-project-picker__search"
        type="text"
        placeholder="Search or create..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && filter.trim()) {
            onSelect(filter.trim());
          }
        }}
      />
      <div className="dashboard-project-picker__list">
        {filtered.map((p) => (
          <button
            key={p.name}
            className={`dashboard-project-picker__item${p.name === currentProject ? " dashboard-project-picker__item--active" : ""}`}
            onClick={() => onSelect(p.name)}
          >
            <span
              className="dashboard-project-card__dot"
              style={{ background: p.color || "#6554c0" }}
            />
            {p.icon && <span className="dashboard-project-picker__icon">{p.icon}</span>}
            <span className="dashboard-project-picker__name">{p.name}</span>
          </button>
        ))}
        {filter.trim() && !exactMatch && (
          <button
            className="dashboard-project-picker__item dashboard-project-picker__item--create"
            onClick={() => onSelect(filter.trim())}
          >
            + Create "{filter.trim()}"
          </button>
        )}
        {filtered.length === 0 && !filter.trim() && (
          <div className="dashboard-project-picker__empty">No projects</div>
        )}
      </div>
      {currentProject && (
        <button
          className="dashboard-project-picker__clear"
          onClick={onClear}
        >
          Clear project
        </button>
      )}
    </div>
  );
}

// =============================================================
// Version History Panel
// =============================================================

function VersionHistoryPanel({
  diagramId,
  onRestore,
  onClose,
}: {
  diagramId: string;
  onRestore: (diagramId: string) => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<DiagramVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listDiagramVersions(diagramId)
      .then(setVersions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [diagramId]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleRestore = async (versionId: number) => {
    if (!window.confirm("Restore this version? Current changes will be overwritten.")) return;
    setRestoring(versionId);
    try {
      await restoreDiagramVersion(diagramId, versionId);
      onRestore(diagramId);
      onClose();
    } catch (err) {
      console.error("Restore failed:", err);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div
      ref={panelRef}
      className="dashboard-version-panel"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="dashboard-version-panel__header">
        <span className="dashboard-version-panel__title">Version History</span>
        <button className="dashboard-version-panel__close" onClick={onClose}>
          &times;
        </button>
      </div>
      <div className="dashboard-version-panel__list">
        {loading && <div className="dashboard-empty">Loading versions...</div>}
        {!loading && versions.length === 0 && (
          <div className="dashboard-empty">No versions yet</div>
        )}
        {versions.map((v) => (
          <div key={v.id} className="dashboard-version-panel__item">
            <div className="dashboard-version-panel__item-info">
              <span className="dashboard-version-panel__item-date">
                {formatDate(v.createdAt)}
              </span>
              <span className="dashboard-version-panel__item-count">
                {v.elementCount} elements
              </span>
            </div>
            <button
              className="dashboard-version-panel__restore-btn"
              onClick={() => handleRestore(v.id)}
              disabled={restoring !== null}
            >
              {restoring === v.id ? "Restoring..." : "Restore"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================
// DiagramCard — with visibility/share/live indicators
// =============================================================

function DiagramCard({
  diagram,
  onLoad,
  onDelete,
  onRename,
  onSetProject,
  onClearProject,
  onTogglePin,
  currentDiagramId,
  auth,
  onDiagramUpdate,
  hideProject,
  collabCount,
  onRestoreVersion,
}: {
  diagram: DiagramSummary;
  onLoad: (diagram: DiagramSummary) => Promise<void>;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onSetProject: (id: string, project: string) => Promise<void>;
  onClearProject: (id: string) => Promise<void>;
  onTogglePin: (id: string, pinned: boolean) => Promise<void>;
  currentDiagramId: string | null;
  auth?: AuthState;
  onDiagramUpdate?: (id: string, updates: Partial<DiagramSummary>) => void;
  hideProject?: boolean;
  collabCount?: number;
  onRestoreVersion?: (diagramId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [pickerProjects, setPickerProjects] = useState<ProjectSummary[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [visibilityFeedback, setVisibilityFeedback] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameSubmittedRef = useRef(false);

  const isCurrent = diagram.id === currentDiagramId;
  const isOwner = auth?.isAuthenticated && auth.userId === diagram.ownerId;
  const isLegacy = !diagram.ownerId;

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

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    if (showProjectPicker) {
      listProjects()
        .then(setPickerProjects)
        .catch(() => {});
    }
  }, [showProjectPicker]);

  const handleClick = async () => {
    if (loading || isRenaming || showProjectPicker || showMenu || showVersionHistory) return;
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
    try {
      const trimmed = renameValue.trim();
      if (trimmed && trimmed !== (diagram.title || "")) {
        await onRename(diagram.id, trimmed);
      }
    } catch (err) {
      console.error("Rename failed:", err);
    } finally {
      setIsRenaming(false);
      renameSubmittedRef.current = false;
    }
  };

  const handlePickerSelect = async (projectName: string) => {
    setShowProjectPicker(false);
    try {
      await onSetProject(diagram.id, projectName);
    } catch (err) {
      console.error("Set project failed:", err);
    }
  };

  const handlePickerClear = async () => {
    setShowProjectPicker(false);
    try {
      await onClearProject(diagram.id);
    } catch (err) {
      console.error("Clear project failed:", err);
    }
  };

  const cardClass = [
    "dashboard-diagram-card",
    loading && "dashboard-diagram-card--loading",
    isCurrent && "dashboard-diagram-card--current",
    (showMenu || showProjectPicker || showVersionHistory) && "dashboard-diagram-card--menu-open",
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
            {diagram.pinned && <span className="dashboard-pin-icon" title="Pinned">&#x1F4CC;</span>}
            {diagram.visibility === "private" && <span className="dashboard-visibility-icon" title="Private">&#x1F512;</span>}
            {diagram.title || "Untitled"}
            {diagram.collabLink && (
              <span className="dashboard-live-badge" title="Live collaboration active">
                <span className="dashboard-live-badge__dot" />
                Live
                {isCurrent && collabCount && collabCount > 1 ? (
                  <span className="dashboard-live-badge__count">{collabCount}</span>
                ) : null}
              </span>
            )}
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
      {showProjectPicker && (
        <ProjectPicker
          projects={pickerProjects}
          currentProject={diagram.project || null}
          onSelect={handlePickerSelect}
          onClear={handlePickerClear}
          onClose={() => setShowProjectPicker(false)}
        />
      )}
      <div className="dashboard-diagram-card__meta">
        {!hideProject && diagram.project && (
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
      {/* Visibility feedback toast */}
      {visibilityFeedback && (
        <div className="dashboard-diagram-card__toast">{visibilityFeedback}</div>
      )}
      {showMenu && (
        <div ref={menuRef} className="dashboard-diagram-card__menu">
          {/* --- Links section --- */}
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
          {diagram.shareableUrl && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await navigator.clipboard.writeText(diagram.shareableUrl!);
                  setLinkCopied(true);
                  setTimeout(() => {
                    setLinkCopied(false);
                    setShowMenu(false);
                  }, 800);
                } catch {
                  window.prompt("Copy this link:", diagram.shareableUrl!);
                  setShowMenu(false);
                }
              }}
            >
              {linkCopied ? "Copied!" : "Copy link"}
            </button>
          )}
          {diagram.collabLink && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await navigator.clipboard.writeText(diagram.collabLink!);
                  setLinkCopied(true);
                  setTimeout(() => {
                    setLinkCopied(false);
                    setShowMenu(false);
                  }, 800);
                } catch {
                  window.prompt("Copy this collab link:", diagram.collabLink!);
                  setShowMenu(false);
                }
              }}
            >
              {linkCopied ? "Copied!" : "Copy collab link"}
            </button>
          )}
          {/* --- Edit section --- */}
          <div className="dashboard-diagram-card__menu-sep" />
          {(isOwner || isLegacy) && (
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
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              onTogglePin(diagram.id, !diagram.pinned);
            }}
          >
            {diagram.pinned ? "Unpin" : "Pin to top"}
          </button>
          {(isOwner || isLegacy) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                setShowProjectPicker(true);
              }}
            >
              Set project
            </button>
          )}
          {isOwner && (
            <>
              <div className="dashboard-diagram-card__menu-sep" />
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  try {
                    const newVis = diagram.visibility === "public" ? "private" : "public";
                    await setDiagramVisibility(diagram.id, newVis);
                    onDiagramUpdate?.(diagram.id, { visibility: newVis });
                    setVisibilityFeedback(newVis === "private" ? "Made private" : "Made public");
                    setTimeout(() => setVisibilityFeedback(null), 1500);
                  } catch (err) {
                    console.error("Toggle visibility failed:", err);
                    setVisibilityFeedback("Failed to change visibility");
                    setTimeout(() => setVisibilityFeedback(null), 2000);
                  }
                }}
              >
                Make {diagram.visibility === "public" ? "private" : "public"}
              </button>
            </>
          )}
          {/* --- History --- */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              setShowVersionHistory(true);
            }}
          >
            Version history
          </button>
          {/* --- Danger section --- */}
          {(isOwner || isLegacy) && (
            <>
              <div className="dashboard-diagram-card__menu-sep" />
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
            </>
          )}
        </div>
      )}
      {showVersionHistory && (
        <VersionHistoryPanel
          diagramId={diagram.id}
          onRestore={(id) => onRestoreVersion?.(id)}
          onClose={() => setShowVersionHistory(false)}
        />
      )}
    </div>
  );
}

// =============================================================
// Hooks
// =============================================================

function useLoadDiagram(
  excalidrawAPI: ExcalidrawImperativeAPI,
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>,
  flushDashboardSave?: () => void,
  skipNextDashboardSave?: (elements?: readonly any[]) => void,
  onReadOnlyDiagram?: (diagramId: string, permission: string) => void,
  collabAPI?: CollabAPI | null,
  auth?: AuthState,
) {
  return useCallback(
    async (diagram: DiagramSummary) => {
      try {
        flushDashboardSave?.();

        const data = await loadDiagramElements(diagram.id);
        if (!data || !data.elements?.length) return;

        const restored = restore(
          { elements: data.elements, appState: null },
          null,
          null,
          { repairBindings: true },
        );
        if (dashboardDiagramIdRef) {
          dashboardDiagramIdRef.current = diagram.id;
          localStorage.setItem("dashboard-diagram-id", diagram.id);
        }
        // skipNextDashboardSave MUST run before onReadOnlyDiagram:
        // it clears any previous readonly state, then onReadOnlyDiagram
        // re-sets it if needed. Reversed order would immediately undo readonly.
        skipNextDashboardSave?.(restored.elements);

        if (data.permission === "read") {
          onReadOnlyDiagram?.(diagram.id, "read");
        }

        const currentOpenSidebar = excalidrawAPI.getAppState().openSidebar;
        // Strip viewModeEnabled/zenModeEnabled from restored state —
        // these are controlled via props, and spreading defaults here
        // would override the prop-driven state set by onReadOnlyDiagram.
        const {
          viewModeEnabled: _vm,
          zenModeEnabled: _zm,
          ...safeAppState
        } = (restored.appState || {}) as any;
        excalidrawAPI.updateScene({
          elements: restored.elements,
          appState: {
            ...safeAppState,
            name: diagram.title || "Untitled",
            openSidebar: currentOpenSidebar,
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });

        // --- Collab edge cases ---
        if (diagram.collabLink && collabAPI) {
          const isOwner = auth?.userId && diagram.ownerId === auth.userId;
          const isLegacy = !diagram.ownerId;

          if ((isOwner || isLegacy) && !collabAPI.isCollaborating()) {
            // Stale collab link: owner loaded their diagram but is not in a session.
            // Clear the orphaned collabLink so the "Live" badge disappears.
            updateDiagramMeta(diagram.id, { collabLink: null }).catch(
              (err) => console.warn("Failed to clear stale collab link:", err),
            );
          } else if (!isOwner && !collabAPI.isCollaborating()) {
            // Non-owner loading a diagram with an active collab session.
            // Public diagrams or legacy diagrams: auto-join the live session.
            const canJoin = diagram.visibility === "public" || isLegacy;
            if (canJoin) {
              const roomData = getCollaborationLinkData(diagram.collabLink);
              if (roomData) {
                window.history.pushState({}, "", diagram.collabLink);
                collabAPI.startCollaboration(roomData);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to load diagram:", err);
      }
    },
    [excalidrawAPI, dashboardDiagramIdRef, flushDashboardSave, skipNextDashboardSave, onReadOnlyDiagram, collabAPI, auth],
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
        if (opts && id === opts.currentDiagramId && opts.dashboardDiagramIdRef && opts.excalidrawAPI) {
          const newId = `web-${crypto.randomUUID()}`;
          opts.dashboardDiagramIdRef.current = newId;
          localStorage.setItem("dashboard-diagram-id", newId);
          opts.skipNextDashboardSave?.([]);
          const currentOpenSidebar = opts.excalidrawAPI.getAppState().openSidebar;
          opts.excalidrawAPI.updateScene({
            elements: [],
            appState: { name: "", openSidebar: currentOpenSidebar },
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

// =============================================================
// DiagramsTab — shared between All and Mine
// =============================================================

function DiagramsTab({
  excalidrawAPI,
  dashboardDiagramIdRef,
  flushDashboardSave,
  skipNextDashboardSave,
  currentDiagramId,
  onDiagramLoaded,
  auth,
  collabAPI,
  mineOnly,
  onReadOnlyDiagram,
  collabCount,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>;
  flushDashboardSave?: () => void;
  skipNextDashboardSave?: (elements?: readonly any[]) => void;
  currentDiagramId: string | null;
  onDiagramLoaded: (id: string) => void;
  auth?: AuthState;
  collabAPI?: CollabAPI | null;
  mineOnly?: boolean;
  onReadOnlyDiagram?: (diagramId: string, permission: string) => void;
  collabCount?: number;
}) {
  const PAGE_SIZE = 50;
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const fetchDiagrams = useCallback(async (query?: string, append = false, appendOffset = 0) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const results = query
        ? await searchDiagrams({ query })
        : await listDiagrams({ limit: PAGE_SIZE, offset: appendOffset, mine: mineOnly });
      if (append) {
        setDiagrams((prev) => [...prev, ...results]);
      } else {
        setDiagrams(results);
      }
      setHasMore(!query && results.length === PAGE_SIZE);
    } catch (err: any) {
      setError(err.message || "Failed to load diagrams");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [mineOnly]);

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

  const handleLoadMore = useCallback(() => {
    fetchDiagrams(undefined, true, diagrams.length);
  }, [fetchDiagrams, diagrams.length]);

  const baseHandleLoad = useLoadDiagram(excalidrawAPI, dashboardDiagramIdRef, flushDashboardSave, skipNextDashboardSave, onReadOnlyDiagram, collabAPI, auth);
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
    onDiagramLoaded,
  });

  const handleRename = useCallback(async (id: string, title: string) => {
    await updateDiagramMeta(id, { title });
    setDiagrams((prev) => prev.map((d) => d.id === id ? { ...d, title } : d));
  }, []);

  const handleSetProject = useCallback(async (id: string, project: string) => {
    await updateDiagramMeta(id, { project });
    setDiagrams((prev) => prev.map((d) => d.id === id ? { ...d, project } : d));
  }, []);

  const handleClearProject = useCallback(async (id: string) => {
    await updateDiagramMeta(id, { project: "" });
    setDiagrams((prev) => prev.map((d) => d.id === id ? { ...d, project: "" } : d));
  }, []);

  const handleTogglePin = useCallback(async (id: string, pinned: boolean) => {
    await updateDiagramMeta(id, { pinned });
    setDiagrams((prev) => {
      const updated = prev.map((d) => d.id === id ? { ...d, pinned } : d);
      return updated.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
    });
  }, []);

  const handleDiagramUpdate = useCallback((id: string, updates: Partial<DiagramSummary>) => {
    setDiagrams((prev) => prev.map((d) => d.id === id ? { ...d, ...updates } : d));
  }, []);

  const handleRestoreVersion = useCallback(async (diagramId: string) => {
    // After restoring a version, reload the diagram from server
    const diagram = diagrams.find((d) => d.id === diagramId);
    if (diagram) {
      await handleLoad(diagram);
    }
  }, [diagrams, handleLoad]);

  return (
    <div className="dashboard-all-tab">
      <div className="dashboard-search">
        <input
          type="text"
          placeholder={mineOnly ? "Search my diagrams..." : "Search diagrams..."}
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
            {searchQuery
              ? "No diagrams found"
              : mineOnly
                ? "No diagrams yet. Create one with + New."
                : "No diagrams yet"}
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
            onClearProject={handleClearProject}
            onTogglePin={handleTogglePin}
            currentDiagramId={currentDiagramId}
            auth={auth}
            onDiagramUpdate={handleDiagramUpdate}
            collabCount={collabCount}
            onRestoreVersion={handleRestoreVersion}
          />
        ))}
        {hasMore && !loading && (
          <button
            className="dashboard-load-more"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================
// Project components (ProjectCard, ProjectEditForm, ProjectsTab)
// =============================================================

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
  onTogglePin,
  onToggleVisibility,
  auth,
}: {
  project: ProjectSummary;
  onSelect: (project: ProjectSummary) => void;
  onEdit: (project: ProjectSummary) => void;
  onDelete: (name: string) => void;
  onTogglePin: (name: string, pinned: boolean) => Promise<void>;
  onToggleVisibility?: (name: string, visibility: "public" | "private") => Promise<void>;
  auth?: AuthState;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [visibilityFeedback, setVisibilityFeedback] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const isOwner = auth?.isAuthenticated && auth.userId === project.ownerId;

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
        <span className="dashboard-project-card__name">
          {project.pinned && <span className="dashboard-pin-icon" title="Pinned">&#x1F4CC;</span>}
          {project.visibility === "private" && <span className="dashboard-visibility-icon" title="Private">&#x1F512;</span>}
          {project.name}
        </span>
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
      {visibilityFeedback && (
        <div className="dashboard-diagram-card__toast">{visibilityFeedback}</div>
      )}
      {showMenu && (
        <div ref={menuRef} className="dashboard-project-card__menu">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              onTogglePin(project.name, !project.pinned);
            }}
          >
            {project.pinned ? "Unpin" : "Pin to top"}
          </button>
          {(isOwner || !project.ownerId) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onEdit(project);
              }}
            >
              Edit
            </button>
          )}
          {isOwner && (
            <>
              <div className="dashboard-diagram-card__menu-sep" />
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  try {
                    const newVis = project.visibility === "public" ? "private" : "public";
                    await onToggleVisibility?.(project.name, newVis);
                    setVisibilityFeedback(newVis === "private" ? "Made private" : "Made public");
                    setTimeout(() => setVisibilityFeedback(null), 1500);
                  } catch (err) {
                    console.error("Toggle visibility failed:", err);
                    setVisibilityFeedback("Failed to change visibility");
                    setTimeout(() => setVisibilityFeedback(null), 2000);
                  }
                }}
              >
                Make {project.visibility === "public" ? "private" : "public"}
              </button>
            </>
          )}
          {(isOwner || !project.ownerId) && (
            <>
              <div className="dashboard-diagram-card__menu-sep" />
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
            </>
          )}
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
  auth,
  collabAPI,
  onReadOnlyDiagram,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>;
  flushDashboardSave?: () => void;
  skipNextDashboardSave?: (elements?: readonly any[]) => void;
  currentDiagramId: string | null;
  onDiagramLoaded: (id: string) => void;
  auth?: AuthState;
  collabAPI?: CollabAPI | null;
  onReadOnlyDiagram?: (diagramId: string, permission: string) => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [view, setView] = useState<ProjectsView>("list");
  const [editingProject, setEditingProject] = useState<ProjectSummary | undefined>();
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");

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

  const baseHandleLoad = useLoadDiagram(excalidrawAPI, dashboardDiagramIdRef, flushDashboardSave, skipNextDashboardSave, onReadOnlyDiagram, collabAPI, auth);
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
    onDiagramLoaded,
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

  const handleClearProject = useCallback(async (id: string) => {
    await updateDiagramMeta(id, { project: "" });
    setDiagrams((prev) => prev.map((d) => d.id === id ? { ...d, project: "" } : d));
    fetchProjects();
  }, [fetchProjects]);

  const handleToggleDiagramPin = useCallback(async (id: string, pinned: boolean) => {
    await updateDiagramMeta(id, { pinned });
    setDiagrams((prev) => {
      const updated = prev.map((d) => d.id === id ? { ...d, pinned } : d);
      return updated.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
    });
  }, []);

  const handleDiagramUpdate = useCallback((id: string, updates: Partial<DiagramSummary>) => {
    setDiagrams((prev) => prev.map((d) => d.id === id ? { ...d, ...updates } : d));
  }, []);

  const handleRestoreVersion = useCallback(async (diagramId: string) => {
    const diagram = diagrams.find((d) => d.id === diagramId);
    if (diagram) {
      await handleLoad(diagram);
    }
  }, [diagrams, handleLoad]);

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

  const handleToggleProjectPin = useCallback(async (name: string, pinned: boolean) => {
    try {
      await updateProject(name, { pinned });
      setProjects((prev) => {
        const updated = prev.map((p) => p.name === name ? { ...p, pinned } : p);
        return updated.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
      });
    } catch (err) {
      console.error("Failed to toggle project pin:", err);
    }
  }, []);

  const handleToggleProjectVisibility = useCallback(async (name: string, visibility: "public" | "private") => {
    await setProjectVisibility(name, visibility);
    setProjects((prev) => prev.map((p) => p.name === name ? { ...p, visibility } : p));
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

  const filteredProjects = projects.filter((p) =>
    !projectSearchQuery ||
    p.name.toLowerCase().includes(projectSearchQuery.toLowerCase()) ||
    p.description?.toLowerCase().includes(projectSearchQuery.toLowerCase()),
  );

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
        {projects.length > 0 && (
          <div className="dashboard-search">
            <input
              type="text"
              placeholder="Search projects..."
              value={projectSearchQuery}
              onChange={(e) => setProjectSearchQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="dashboard-search__input"
            />
          </div>
        )}
        {loading && (
          <div className="dashboard-empty">Loading projects...</div>
        )}
        {!loading && projects.length === 0 && (
          <div className="dashboard-empty">No projects yet. Create one to organize your diagrams.</div>
        )}
        {!loading && projects.length > 0 && filteredProjects.length === 0 && (
          <div className="dashboard-empty">No matching projects</div>
        )}
        <div className="dashboard-project-list">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.name}
              project={project}
              onSelect={handleSelectProject}
              onEdit={handleEditProject}
              onDelete={handleDeleteProject}
              onTogglePin={handleToggleProjectPin}
              onToggleVisibility={handleToggleProjectVisibility}
              auth={auth}
            />
          ))}
        </div>
      </div>
    );
  }

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
            onClearProject={handleClearProject}
            onTogglePin={handleToggleDiagramPin}
            currentDiagramId={currentDiagramId}
            auth={auth}
            onDiagramUpdate={handleDiagramUpdate}
            onRestoreVersion={handleRestoreVersion}
            hideProject
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================
// SaveStatusIndicator
// =============================================================

export type DashboardSaveStatus = "idle" | "saving" | "saved" | "error" | "readonly" | "queued";

function SaveStatusIndicator({
  status,
  onFork,
}: {
  status: DashboardSaveStatus;
  onFork?: () => void;
}) {
  if (status === "readonly") {
    return (
      <span
        className="dashboard-save-status dashboard-save-status--readonly"
        onClick={onFork}
        title="Click to save as your own copy"
      >
        Read-only — Fork to edit
      </span>
    );
  }
  const className = `dashboard-save-status dashboard-save-status--${status}`;
  return (
    <span className={className}>
      {status === "saving" && "Saving..."}
      {status === "saved" && "\u2713 Saved"}
      {status === "error" && "\u2022 Save failed"}
      {status === "queued" && "\u2022 Queued (offline)"}
      {status === "idle" && "\u00A0"}
    </span>
  );
}

// =============================================================
// DashboardSidebar (main export)
// =============================================================

const DASHBOARD_DOCKED_KEY = "dashboard-sidebar-docked";

export const DashboardSidebar: React.FC<{
  excalidrawAPI: ExcalidrawImperativeAPI;
  dashboardDiagramIdRef?: React.MutableRefObject<string | null>;
  flushDashboardSave?: () => void;
  skipNextDashboardSave?: (elements?: readonly any[]) => void;
  dashboardSaveStatus?: DashboardSaveStatus;
  auth?: AuthState;
  collabAPI?: CollabAPI | null;
  onForkDiagram?: () => void;
  onReadOnlyDiagram?: (diagramId: string, permission: string) => void;
}> = ({
  excalidrawAPI,
  dashboardDiagramIdRef,
  flushDashboardSave,
  skipNextDashboardSave,
  dashboardSaveStatus = "idle",
  auth,
  collabAPI,
  onForkDiagram,
  onReadOnlyDiagram,
}) => {
  const [currentDiagramId, setCurrentDiagramId] = useState<string | null>(
    dashboardDiagramIdRef?.current ?? null,
  );
  const [collabCount, setCollabCount] = useState(0);

  useEffect(() => {
    if (!collabAPI?.isCollaborating()) {
      setCollabCount(0);
      return;
    }
    const interval = setInterval(() => {
      const count = excalidrawAPI.getAppState().collaborators.size;
      setCollabCount(count);
    }, 2000);
    return () => clearInterval(interval);
  }, [excalidrawAPI, collabAPI]);

  const [docked, setDocked] = useState(() => {
    try {
      return localStorage.getItem(DASHBOARD_DOCKED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const handleDock = useCallback((isDocked: boolean) => {
    setDocked(isDocked);
    try {
      localStorage.setItem(DASHBOARD_DOCKED_KEY, String(isDocked));
    } catch {}
  }, []);

  const handleDiagramLoaded = useCallback((id: string) => {
    setCurrentDiagramId(id);
  }, []);

  if (!import.meta.env.VITE_APP_DASHBOARD_API_URL) {
    return null;
  }

  const handleNewDiagram = () => {
    flushDashboardSave?.();
    let newId: string | undefined;
    if (dashboardDiagramIdRef) {
      newId = `web-${crypto.randomUUID()}`;
      dashboardDiagramIdRef.current = newId;
      localStorage.setItem("dashboard-diagram-id", newId);
      setCurrentDiagramId(newId);
    }
    skipNextDashboardSave?.();
    const currentOpenSidebar = excalidrawAPI.getAppState().openSidebar;
    excalidrawAPI.updateScene({
      elements: [],
      appState: { name: "", openSidebar: currentOpenSidebar },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    // Fire-and-forget: create DB record immediately for crash recovery
    if (newId) {
      saveDiagram(newId, []).catch(() => {});
    }
  };

  const isAuthenticated = auth?.isAuthenticated;

  return (
    <Sidebar name={DASHBOARD_SIDEBAR_NAME} docked={docked} onDock={handleDock}>
      <Sidebar.Tabs>
        <Sidebar.Header>
          <span className="dashboard-sidebar-title">My Diagrams</span>
          <SaveStatusIndicator status={dashboardSaveStatus} onFork={onForkDiagram} />
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
            {isAuthenticated && (
              <Sidebar.TabTrigger tab={DASHBOARD_TAB_MINE}>
                Mine
              </Sidebar.TabTrigger>
            )}
            <Sidebar.TabTrigger tab={DASHBOARD_TAB_PROJECTS}>
              Projects
            </Sidebar.TabTrigger>
          </Sidebar.TabTriggers>
        </Sidebar.Header>

        <Sidebar.Tab tab={DASHBOARD_TAB_ALL}>
          <DiagramsTab
            excalidrawAPI={excalidrawAPI}
            dashboardDiagramIdRef={dashboardDiagramIdRef}
            flushDashboardSave={flushDashboardSave}
            skipNextDashboardSave={skipNextDashboardSave}
            currentDiagramId={currentDiagramId}
            onDiagramLoaded={handleDiagramLoaded}
            auth={auth}
            collabAPI={collabAPI}
            onReadOnlyDiagram={onReadOnlyDiagram}
            collabCount={collabCount}
          />
        </Sidebar.Tab>

        {isAuthenticated && (
          <Sidebar.Tab tab={DASHBOARD_TAB_MINE}>
            <DiagramsTab
              excalidrawAPI={excalidrawAPI}
              dashboardDiagramIdRef={dashboardDiagramIdRef}
              flushDashboardSave={flushDashboardSave}
              skipNextDashboardSave={skipNextDashboardSave}
              currentDiagramId={currentDiagramId}
              onDiagramLoaded={handleDiagramLoaded}
              auth={auth}
              collabAPI={collabAPI}
              mineOnly
              onReadOnlyDiagram={onReadOnlyDiagram}
              collabCount={collabCount}
            />
          </Sidebar.Tab>
        )}

        <Sidebar.Tab tab={DASHBOARD_TAB_PROJECTS}>
          <ProjectsTab
            excalidrawAPI={excalidrawAPI}
            dashboardDiagramIdRef={dashboardDiagramIdRef}
            flushDashboardSave={flushDashboardSave}
            skipNextDashboardSave={skipNextDashboardSave}
            currentDiagramId={currentDiagramId}
            onDiagramLoaded={handleDiagramLoaded}
            auth={auth}
            collabAPI={collabAPI}
            onReadOnlyDiagram={onReadOnlyDiagram}
          />
        </Sidebar.Tab>
      </Sidebar.Tabs>
    </Sidebar>
  );
};
