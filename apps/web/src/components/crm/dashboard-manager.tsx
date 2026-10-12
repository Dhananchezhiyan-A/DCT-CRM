"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  Grid2X2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";

type Dashboard = {
  id: string;
  name: string;
  description?: string | null;
  createdBy: string;
  createdByName?: string | null;
  ownerName?: string | null;
  createdAt: string;
  updatedAt: string;
  isDefault?: boolean;
  layout?: unknown[];
  folder?: { id: string; name: string } | null;
  isFavorite?: boolean;
  isSubscribed?: boolean;
};
type FolderItem = {
  id: string;
  name: string;
  description?: string | null;
  createdBy?: string;
  createdByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isFavorite?: boolean;
  _count?: { dashboards: number };
};
type View = "recent" | "createdByMe" | "private" | "all" | "favorites";
type FolderView = "all" | "createdByMe" | "sharedWithMe" | "favorites";

const views: { key: View; label: string; icon?: React.ReactNode }[] = [
  { key: "recent", label: "Recent" },
  { key: "createdByMe", label: "Created by Me" },
  { key: "private", label: "Private Dashboards" },
  { key: "all", label: "All Dashboards" },
  { key: "favorites", label: "All Favorites" },
];

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Authentication required");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success)
    throw new Error(body.error || "Request failed");
  return body.data as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function DashboardManager() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  // Backend requires DASHBOARD_CREATE/UPDATE/DELETE for these actions; hiding
  // the controls keeps the UI honest instead of showing guaranteed 403s.
  const canCreate = hasPermission("Dashboard", "create");
  const canEdit = hasPermission("Dashboard", "edit");
  const canDelete = hasPermission("Dashboard", "delete");
  const [view, setView] = React.useState<View>("all");
  const [folderView, setFolderView] = React.useState<FolderView>("all");
  const [showFolders, setShowFolders] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [dashboards, setDashboards] = React.useState<Dashboard[]>([]);
  const [folders, setFolders] = React.useState<FolderItem[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [sort, setSort] = React.useState<{
    field: "name" | "createdAt";
    order: "asc" | "desc";
  }>({ field: "createdAt", order: "desc" });
  const [menu, setMenu] = React.useState<string | null>(null);
  const [folderMenu, setFolderMenu] = React.useState<string | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [folderId, setFolderId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState("");
  const [ownerDashboard, setOwnerDashboard] = React.useState<Dashboard | null>(
    null,
  );
  const [ownerSearch, setOwnerSearch] = React.useState("");
  const [ownerUserId, setOwnerUserId] = React.useState("");
  const [ownerUsers, setOwnerUsers] = React.useState<
    { id: string; email: string; firstName: string; lastName: string }[]
  >([]);
  const [shareDashboard, setShareDashboard] = React.useState<Dashboard | null>(
    null,
  );
  const [shareUserId, setShareUserId] = React.useState("");
  const [shareTarget, setShareTarget] = React.useState<
    "user" | "role" | "team"
  >("user");
  const [shareLevel, setShareLevel] = React.useState("VIEW");
  const [selectedFolderId, setSelectedFolderId] = React.useState("");
  const [folderOpen, setFolderOpen] = React.useState(false);
  const [folderName, setFolderName] = React.useState("");
  const [movingDashboard, setMovingDashboard] =
    React.useState<Dashboard | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadDashboards = React.useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(page),
        limit: "15",
        sortBy: sort.field,
        sortOrder: sort.order,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (view !== "all") params.set("view", view);
      if (selectedFolderId) params.set("folderId", selectedFolderId);
      const response = await fetch(`/api/proxy/api/dashboards?${params}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.href = "/login";
        throw new Error("Authentication required");
      }
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: Dashboard[];
        pagination?: { total?: number; totalPages?: number };
      };
      if (!response.ok || !body.success)
        throw new Error(body.error || "Request failed");
      const items = Array.isArray(body.data) ? body.data : [];
      setDashboards(items);
      // pagination is a SIBLING of data in the API envelope, not nested in it.
      setTotal(
        typeof body.pagination?.total === "number"
          ? body.pagination.total
          : items.length,
      );
      setTotalPages(
        typeof body.pagination?.totalPages === "number"
          ? body.pagination.totalPages
          : 1,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load dashboards",
      );
      setDashboards([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, selectedFolderId, sort, view]);

  React.useEffect(() => {
    void loadDashboards();
  }, [loadDashboards]);
  const loadFolders = React.useCallback(async () => {
    try {
      const params = new URLSearchParams({ view: folderView });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const data = await readResponse<FolderItem[]>(
        await fetch(`/api/proxy/api/dashboards/folders?${params}`, {
          cache: "no-store",
        }),
      );
      setFolders(Array.isArray(data) ? data : []);
    } catch {
      setFolders([]);
    }
  }, [debouncedSearch, folderView]);

  React.useEffect(() => {
    void loadFolders();
  }, [loadFolders]);
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedFolderId, view, folderView]);
  React.useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const createDashboard = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Dashboard name is required.");
      return;
    }
    try {
      setSaving(true);
      setFormError("");
      const dashboard = await readResponse<Dashboard>(
        await fetch("/api/proxy/api/dashboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmed,
            description: description.trim() || undefined,
            folderId: folderId || null,
            layout: [],
            isDefault: false,
          }),
        }),
      );
      setNewOpen(false);
      setName("");
      setDescription("");
      setFolderId("");
      router.push(`/dashboards/${dashboard.id}?mode=edit`);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Unable to create dashboard",
      );
    } finally {
      setSaving(false);
    }
  };

  const cloneDashboard = async (dashboard: Dashboard) => {
    try {
      const cloned = await readResponse<Dashboard>(
        await fetch(`/api/proxy/api/dashboards/${dashboard.id}/clone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${dashboard.name} Copy` }),
        }),
      );
      router.push(`/dashboards/${cloned.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to clone dashboard",
      );
    }
  };
  const createFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!folderName.trim()) return;
    try {
      const folder = await readResponse<FolderItem>(
        await fetch("/api/proxy/api/dashboards/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: folderName.trim() }),
        }),
      );
      setFolders((current) => [...current, folder]);
      setSelectedFolderId(folder.id);
      setShowFolders(false);
      setView("all");
      setFolderName("");
      setFolderOpen(false);
      void loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create folder");
    }
  };

  const deleteDashboard = async (dashboard: Dashboard) => {
    if (!window.confirm(`Delete "${dashboard.name}"?`)) return;
    try {
      await readResponse(
        await fetch(`/api/proxy/api/dashboards/${dashboard.id}`, {
          method: "DELETE",
        }),
      );
      void loadDashboards();
      void loadFolders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete dashboard",
      );
    }
  };

  const moveDashboard = async (folderId: string | null) => {
    if (!movingDashboard) return;
    try {
      await readResponse(
        await fetch(`/api/proxy/api/dashboards/${movingDashboard.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId }),
        }),
      );
      setMovingDashboard(null);
      void loadDashboards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to move dashboard");
    }
  };

  const toggleDashboardAction = async (
    dashboard: Dashboard,
    action: "favorite" | "subscribe",
  ) => {
    const active =
      action === "favorite" ? dashboard.isFavorite : dashboard.isSubscribed;
    try {
      await readResponse(
        await fetch(`/api/proxy/api/dashboards/${dashboard.id}/${action}`, {
          method: active ? "DELETE" : "POST",
        }),
      );
      setDashboards((current) =>
        current
          .map((item) =>
            item.id === dashboard.id
              ? {
                  ...item,
                  ...(action === "favorite"
                    ? { isFavorite: !active }
                    : { isSubscribed: !active }),
                }
              : item,
          )
          .filter((item) => view !== "favorites" || item.isFavorite),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Unable to update ${action}`,
      );
    }
  };

  const loadOwnerUsers = async () => {
    const query = ownerSearch.trim()
      ? `&search=${encodeURIComponent(ownerSearch.trim())}`
      : "";
    try {
      const data = await readResponse<
        { items?: typeof ownerUsers } | typeof ownerUsers
      >(
        await fetch(`/api/proxy/api/users?isActive=true&limit=30${query}`, {
          cache: "no-store",
        }),
      );
      setOwnerUsers(Array.isArray(data) ? data : data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users");
    }
  };
  const changeOwner = async () => {
    if (!ownerDashboard || !ownerUserId) return;
    try {
      await readResponse(
        await fetch(
          `/api/proxy/api/dashboards/${ownerDashboard.id}/change-owner`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: ownerUserId, sendEmail: false }),
          },
        ),
      );
      setOwnerDashboard(null);
      void loadDashboards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change owner");
    }
  };
  const shareDashboardWithUser = async () => {
    if (!shareDashboard || !shareUserId) return;
    try {
      await readResponse(
        await fetch(`/api/proxy/api/dashboards/${shareDashboard.id}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(shareTarget === "user" ? { userId: shareUserId } : {}),
            ...(shareTarget === "role" ? { roleId: shareUserId } : {}),
            ...(shareTarget === "team" ? { teamId: shareUserId } : {}),
            accessLevel: shareLevel,
          }),
        }),
      );
      setShareDashboard(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to share dashboard",
      );
    }
  };

  const toggleSort = (field: "name" | "createdAt") =>
    setSort((current) =>
      current.field === field
        ? { field, order: current.order === "asc" ? "desc" : "asc" }
        : { field, order: "asc" },
    );
  const renameFolder = async (folder: FolderItem) => {
    const name = window.prompt("Folder name", folder.name)?.trim();
    if (!name || name === folder.name) return;
    try {
      await readResponse(
        await fetch(`/api/proxy/api/dashboards/folders/${folder.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      );
      setFolderMenu(null);
      void loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename folder");
    }
  };
  const deleteFolder = async (folder: FolderItem) => {
    if (
      !window.confirm(
        `Delete "${folder.name}"? Dashboards inside will be kept.`,
      )
    )
      return;
    try {
      await readResponse(
        await fetch(`/api/proxy/api/dashboards/folders/${folder.id}`, {
          method: "DELETE",
        }),
      );
      setFolderMenu(null);
      if (selectedFolderId === folder.id) setSelectedFolderId("");
      void loadFolders();
      void loadDashboards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete folder");
    }
  };
  const toggleFolderFavorite = async (folder: FolderItem) => {
    try {
      const method = folder.isFavorite ? "DELETE" : "POST";
      await readResponse(
        await fetch(`/api/proxy/api/dashboards/folders/${folder.id}/favorite`, {
          method,
        }),
      );
      setFolderMenu(null);
      void loadFolders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update folder favorite",
      );
    }
  };
  const selectFolderSection = (nextView: FolderView) => {
    setFolderView(nextView);
    setShowFolders(true);
    setSelectedFolderId("");
    setView("all");
  };
  const sidebarButton = (active: boolean, withIcon = false) =>
    `flex w-full items-center ${withIcon ? "gap-2" : "justify-between"} border-l-4 px-4 py-2.5 text-left text-sm transition ${active ? "border-primary bg-primary/10 font-semibold text-primary" : "border-transparent text-muted-foreground hover:bg-muted"}`;

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden bg-background">
      <div className="flex h-full min-h-0">
        <aside className="hidden h-full w-56 shrink-0 overflow-y-auto border-r bg-card py-4 lg:block">
          <div className="mb-6 flex items-center gap-2 px-4 text-sm font-semibold text-foreground">
            <Grid2X2 className="h-4 w-4 text-primary" />
            <span>Dashboards</span>
          </div>
          <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dashboards
          </p>
          <nav className="space-y-1">
            {views.map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  setView(item.key);
                  setShowFolders(false);
                  setSelectedFolderId("");
                }}
                className={sidebarButton(
                  view === item.key && !selectedFolderId,
                )}
              >
                <span>{item.label}</span>
                {view === item.key && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </nav>
          <p className="mb-2 mt-8 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Folders
          </p>
          <nav className="space-y-1 text-muted-foreground">
            <button
              onClick={() => selectFolderSection("all")}
              className={sidebarButton(
                showFolders && folderView === "all",
                true,
              )}
            >
              <Folder className="h-4 w-4 shrink-0" /> <span>All Folders</span>
            </button>
            {(
              [
                ["createdByMe", "Created by Me"],
                ["sharedWithMe", "Shared with Me"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => selectFolderSection(key)}
                className={sidebarButton(
                  showFolders && folderView === key,
                  true,
                )}
              >
                <Folder className="h-4 w-4 shrink-0" /> <span>{label}</span>
              </button>
            ))}
            <button
              onClick={() => selectFolderSection("favorites")}
              className={sidebarButton(
                showFolders && folderView === "favorites",
                true,
              )}
            >
              <Folder className="h-4 w-4 shrink-0" />{" "}
              <span>Favorite Folders</span>
            </button>
          </nav>
          <p className="mb-2 mt-8 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Favorites
          </p>
          <button
            onClick={() => {
              setView("favorites");
              setShowFolders(false);
              setSelectedFolderId("");
            }}
            className={sidebarButton(
              view === "favorites" && !showFolders,
              true,
            )}
          >
            <Star className="h-4 w-4 shrink-0" /> <span>All Favorites</span>
          </button>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl">
            <div className="mb-4 flex flex-col justify-between gap-4 rounded-lg border bg-card p-5 shadow-sm md:flex-row md:items-center">
              <div>
                <p className="text-sm text-muted-foreground">Dashboards</p>
                <h1 className="text-2xl font-bold tracking-tight">
                  {showFolders
                    ? "All Folders"
                    : views.find((item) => item.key === view)?.label}
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  {showFolders
                    ? folders.length
                    : `${total} dashboard${total === 1 ? "" : "s"}`}
                  {showFolders
                    ? ` folder${folders.length === 1 ? "" : "s"}`
                    : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void loadDashboards()}
                  title="Refresh dashboards"
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                </Button>
                {canCreate && (
                  <Button variant="outline" onClick={() => setFolderOpen(true)}>
                    <Folder className="mr-2 h-4 w-4" /> New Folder
                  </Button>
                )}
                {canCreate && (
                  <Button
                    onClick={() => {
                      setFormError("");
                      setNewOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> New Dashboard
                  </Button>
                )}
              </div>
            </div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter")
                      setDebouncedSearch(search.trim());
                  }}
                  placeholder={`Search ${views.find((item) => item.key === view)?.label.toLowerCase()}...`}
                  className="pl-9 pr-9"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-2.5 text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {error && (
              <div className="mb-4 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <span>{error}</span>
                <button onClick={() => setError("")}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
              {showFolders ? (
                <DashboardFolderTable
                  folders={folders}
                  folderMenu={folderMenu}
                  onMenuChange={setFolderMenu}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onOpen={(folder) => {
                    setSelectedFolderId(folder.id);
                    setShowFolders(false);
                    setView("all");
                  }}
                  onRename={(folder) => void renameFolder(folder)}
                  onDelete={(folder) => void deleteFolder(folder)}
                  onFavorite={(folder) => void toggleFolderFavorite(folder)}
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-sm">
                      <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-5 py-3">
                            <button
                              onClick={() => toggleSort("name")}
                              className="flex items-center gap-1"
                            >
                              Dashboard Name{" "}
                              <ChevronDown
                                className={`h-3 w-3 ${sort.field === "name" && sort.order === "asc" ? "rotate-180" : ""}`}
                              />
                            </button>
                          </th>
                          <th className="px-4 py-3">Description</th>
                          <th className="px-4 py-3">Folder</th>
                          <th className="px-4 py-3">Created By</th>
                          <th className="px-4 py-3">
                            <button
                              onClick={() => toggleSort("createdAt")}
                              className="flex items-center gap-1"
                            >
                              Created On{" "}
                              <ChevronDown
                                className={`h-3 w-3 ${sort.field === "createdAt" && sort.order === "asc" ? "rotate-180" : ""}`}
                              />
                            </button>
                          </th>
                          <th className="px-4 py-3">Subscribed</th>
                          <th className="w-14 px-3 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {loading ? (
                          Array.from({ length: 5 }).map((_, index) => (
                            <tr key={index}>
                              <td colSpan={7} className="px-5 py-5">
                                <div className="h-4 animate-pulse rounded bg-muted" />
                              </td>
                            </tr>
                          ))
                        ) : dashboards.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-5 py-16 text-center">
                              <BarChart3 className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
                              <p className="font-medium">
                                {debouncedSearch
                                  ? "No dashboards match your search"
                                  : "No dashboards yet"}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Create a dashboard to start arranging live CRM
                                reports.
                              </p>
                            </td>
                          </tr>
                        ) : (
                          dashboards.map((dashboard) => (
                            <tr
                              key={dashboard.id}
                              className="group hover:bg-muted/30"
                            >
                              <td className="px-5 py-4">
                                <Link
                                  href={`/dashboards/${dashboard.id}?mode=view`}
                                  className="font-medium text-primary hover:underline"
                                >
                                  {dashboard.name}
                                </Link>
                                {dashboard.isDefault && (
                                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                    Default
                                  </span>
                                )}
                              </td>
                              <td className="max-w-[250px] truncate px-4 py-4 text-muted-foreground">
                                {dashboard.description || "—"}
                              </td>
                              <td className="px-4 py-4 text-muted-foreground">
                                <span className="inline-flex items-center gap-2">
                                  <Folder className="h-4 w-4" />{" "}
                                  {dashboard.folder?.name ||
                                    "Private Dashboards"}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-muted-foreground">
                                {dashboard.createdByName ||
                                  dashboard.createdBy}
                              </td>
                              <td className="px-4 py-4 text-muted-foreground">
                                {formatDate(dashboard.createdAt)}
                              </td>
                              <td className="px-4 py-4 text-muted-foreground">
                                {dashboard.isSubscribed ? "Yes" : "No"}
                              </td>
                              <td className="relative px-3 py-4">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setMenu(
                                      menu === dashboard.id
                                        ? null
                                        : dashboard.id,
                                    );
                                  }}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                {menu === dashboard.id && (
                                  <div
                                    onClick={(event) => event.stopPropagation()}
                                    className="absolute right-3 top-12 z-20 w-44 rounded-md border bg-background p-1 shadow-lg"
                                  >
                                    <Link
                                      href={`/dashboards/${dashboard.id}?mode=view`}
                                      className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-muted"
                                    >
                                      View
                                    </Link>
                                    {canEdit && (
                                      <Link
                                        href={`/dashboards/${dashboard.id}?mode=edit`}
                                        className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-muted"
                                      >
                                        Edit
                                      </Link>
                                    )}
                                    <button
                                      onClick={() =>
                                        void toggleDashboardAction(
                                          dashboard,
                                          "subscribe",
                                        )
                                      }
                                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"
                                    >
                                      {dashboard.isSubscribed
                                        ? "Unsubscribe"
                                        : "Subscribe"}
                                    </button>
                                    {canDelete && (
                                      <button
                                        onClick={() =>
                                          void deleteDashboard(dashboard)
                                        }
                                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                                      >
                                        Delete
                                      </button>
                                    )}
                                    <button
                                      onClick={() =>
                                        void toggleDashboardAction(
                                          dashboard,
                                          "favorite",
                                        )
                                      }
                                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"
                                    >
                                      {dashboard.isFavorite
                                        ? "Remove from Favorites"
                                        : "Favorite"}
                                    </button>
                                    {canEdit && (
                                      <button
                                        onClick={() => {
                                          setShareDashboard(dashboard);
                                          setShareUserId("");
                                          setMenu(null);
                                        }}
                                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"
                                      >
                                        Share
                                      </button>
                                    )}
                                    {canEdit && (
                                      <button
                                        onClick={() => {
                                          setOwnerDashboard(dashboard);
                                          setOwnerUserId("");
                                          setOwnerSearch("");
                                          setMenu(null);
                                          void loadOwnerUsers();
                                        }}
                                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"
                                      >
                                        Change Owner
                                      </button>
                                    )}
                                    {canEdit && (
                                      <button
                                        onClick={() => {
                                          setMovingDashboard(dashboard);
                                          setMenu(null);
                                        }}
                                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"
                                      >
                                        Move
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-muted-foreground">
                    <span>
                      {total
                        ? `Showing ${(page - 1) * 15 + 1}–${Math.min(page * 15, total)} of ${total}`
                        : "No dashboards"}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={page <= 1}
                        onClick={() => setPage((current) => current - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span>
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={page >= totalPages}
                        onClick={() => setPage((current) => current + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={createDashboard}
            className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-xl"
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold">New Dashboard</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Build a live view from saved CRM reports.
                </p>
              </div>
              <button type="button" onClick={() => setNewOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <label className="mb-4 block text-sm font-medium">
              Name <span className="text-destructive">*</span>
              <Input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My Sales Dashboard"
                className="mt-1.5"
              />
            </label>
            <label className="mb-4 block text-sm font-medium">
              Description
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this dashboard is for"
                className="mt-1.5"
              />
            </label>
            <label className="mb-5 block text-sm font-medium">
              Folder
              <select
                value={folderId}
                onChange={(event) => setFolderId(event.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">No folder</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
            {formError && (
              <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </div>
      )}
      {folderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={createFolder}
            className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Folder</h2>
              <button type="button" onClick={() => setFolderOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <Input
              autoFocus
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Folder name"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFolderOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!folderName.trim()}>
                Create Folder
              </Button>
            </div>
          </form>
        </div>
      )}
      {movingDashboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Move Dashboard</h2>
              <button type="button" onClick={() => setMovingDashboard(null)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm hover:bg-muted"
                onClick={() => void moveDashboard(null)}
              >
                <Folder className="h-4 w-4" /> No Folder
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm hover:bg-muted"
                  onClick={() => void moveDashboard(folder.id)}
                >
                  <Folder className="h-4 w-4" /> {folder.name}
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setMovingDashboard(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      {shareDashboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Share Dashboard</h2>
              <button onClick={() => setShareDashboard(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <select
              value={shareTarget}
              onChange={(event) =>
                setShareTarget(event.target.value as "user" | "role" | "team")
              }
              className="mb-3 h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="user">User</option>
              <option value="role">Role</option>
              <option value="team">Team (role membership)</option>
            </select>
            <Input
              placeholder={`${shareTarget === "user" ? "User" : shareTarget === "role" ? "Role" : "Team"} ID`}
              value={shareUserId}
              onChange={(event) => setShareUserId(event.target.value)}
            />
            <select
              value={shareLevel}
              onChange={(event) => setShareLevel(event.target.value)}
              className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="VIEW">View</option>
              <option value="EDIT">Edit</option>
              <option value="SHARE">Share</option>
              <option value="DELETE">Delete</option>
              <option value="MANAGE">Manage</option>
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShareDashboard(null)}>
                Cancel
              </Button>
              <Button
                disabled={!shareUserId.trim()}
                onClick={() => void shareDashboardWithUser()}
              >
                Share
              </Button>
            </div>
          </div>
        </div>
      )}
      {ownerDashboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Change Owner</h2>
              <button onClick={() => setOwnerDashboard(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <Input
              placeholder="Search users"
              value={ownerSearch}
              onChange={(event) => {
                setOwnerSearch(event.target.value);
                void loadOwnerUsers();
              }}
            />
            <div className="mt-3 max-h-52 overflow-auto rounded-md border">
              {ownerUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setOwnerUserId(user.id)}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${ownerUserId === user.id ? "bg-primary/10" : ""}`}
                >
                  {user.firstName} {user.lastName} · {user.email}
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOwnerDashboard(null)}>
                Cancel
              </Button>
              <Button
                disabled={!ownerUserId}
                onClick={() => void changeOwner()}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardFolderTable({
  folders,
  folderMenu,
  onMenuChange,
  onOpen,
  onRename,
  onDelete,
  onFavorite,
  canEdit = true,
  canDelete = true,
}: {
  folders: FolderItem[];
  folderMenu: string | null;
  onMenuChange: (id: string | null) => void;
  onOpen: (folder: FolderItem) => void;
  onRename: (folder: FolderItem) => void;
  onDelete: (folder: FolderItem) => void;
  onFavorite: (folder: FolderItem) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const formatFolderDate = (value?: string) =>
    value
      ? new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(new Date(value))
      : "-";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-5 py-3">Name</th>
            <th className="px-4 py-3">Dashboards</th>
            <th className="px-4 py-3">Created By</th>
            <th className="px-4 py-3">Created On</th>
            <th className="px-4 py-3">Last Modified</th>
            <th className="w-14 px-3 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {folders.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-5 py-16 text-center">
                <Folder className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" />
                <p className="font-medium">No folders found.</p>
              </td>
            </tr>
          ) : (
            folders.map((folder) => (
              <tr key={folder.id} className="hover:bg-muted/30">
                <td className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => onOpen(folder)}
                    className="font-medium text-primary hover:underline"
                  >
                    {folder.name}
                  </button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {folder.isFavorite ? "Favorite" : "Folder"}
                  </p>
                </td>
                <td className="px-4 py-4 text-muted-foreground">
                  {folder._count?.dashboards || 0}
                </td>
                <td className="px-4 py-4 text-muted-foreground">
                  {folder.createdByName || folder.createdBy || "-"}
                </td>
                <td className="px-4 py-4 text-muted-foreground">
                  {formatFolderDate(folder.createdAt)}
                </td>
                <td className="px-4 py-4 text-muted-foreground">
                  {formatFolderDate(folder.updatedAt || folder.createdAt)}
                </td>
                <td className="relative px-3 py-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${folder.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMenuChange(folderMenu === folder.id ? null : folder.id);
                    }}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                  {folderMenu === folder.id && (
                    <div
                      onClick={(event) => event.stopPropagation()}
                      className="absolute right-3 top-12 z-20 w-48 rounded-md border bg-background p-1 shadow-lg"
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(folder)}
                        className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        Open dashboards
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => onRename(folder)}
                          className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          Rename
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onFavorite(folder)}
                        className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        {folder.isFavorite
                          ? "Remove from Favorites"
                          : "Add to Favorites"}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(folder)}
                          className="block w-full rounded px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
