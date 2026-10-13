"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  GripVertical,
  ImagePlus,
  Maximize2,
  Pencil,
  PieChart as PieChartIcon,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Table2,
  Trash2,
  Type,
  Undo2,
  Redo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Widget = {
  id: string;
  type:
    | "chart"
    | "table"
    | "metric"
    | "kpi"
    | "text"
    | "image"
    | "column"
    | "line"
    | "area"
    | "pie"
    | "donut"
    | "horizontalBar"
    | "stackedBar"
    | "stackedColumn"
    | "funnel"
    | "gauge"
    | "summary"
    | "progress"
    | "list"
    | "ranking"
    | "custom";
  title: string;
  metric?: string;
  reportId?: string;
  config?: Record<string, any>;
  position: { x: number; y: number; w: number; h: number };
  minW?: number;
  minH?: number;
  minimized?: boolean;
};
type DashboardFilter = { field: string; operator: string; value: string };
type LayoutConfig = {
  gridColumns: 9 | 12;
  spacing: "compact" | "normal" | "wide";
  snapToGrid: boolean;
  autoArrange: boolean;
  showGridLines: boolean;
};
type Dashboard = {
  id: string;
  name: string;
  description?: string | null;
  layout: Widget[];
  filters?: DashboardFilter[] | null;
  refreshInterval?: string;
  visibility?: string;
  ownerId?: string | null;
  folderId?: string | null;
  layoutConfig?: Partial<LayoutConfig> | null;
};
type Report = {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  objectName: string;
  createdAt: string;
  folder?: { name: string } | null;
  createdByName?: string;
};
type ReportResult = {
  source?: string;
  report?: { name: string };
  result?: {
    rows?: Record<string, any>[];
    groups?: {
      groupValues?: Record<string, string>;
      count?: number;
      summary?: Record<string, any>;
    }[];
    totalRows?: number;
    columns?: string[];
    summary?: Record<string, any>;
  };
};
type WidgetDataResponse = { widget: Widget; data: ReportResult };

function getWidgetReportId(widget: Widget) {
  return widget.reportId || widget.config?.reportId;
}

function normalizeWidgetReport(widget: Widget): Widget {
  // Legacy rows can lack position; default it so normalizeLayout never
  // dereferences undefined (white-screen crash).
  const normalized: Widget = widget.position
    ? widget
    : { ...widget, position: { x: 0, y: 0, w: 4, h: 3 } };
  const reportId = getWidgetReportId(normalized);
  if (!reportId) return normalized;

  const reportName = normalized.config?.reportName || normalized.title;
  return {
    ...normalized,
    reportId,
    title: reportName,
    config: { ...normalized.config, reportId, reportName },
  };
}

function reportWidgetDraft(report: Report, widget: Widget) {
  return {
    ...(widget.config || {}),
    reportId: report.id,
    reportName: report.name,
    reportType: report.type || widget.config?.reportType,
    reportObject: report.objectName,
    reportFolder: report.folder?.name || "Private Reports",
    reportCreatedAt: report.createdAt,
    chartType:
      widget.type === "metric" || widget.type === "kpi"
        ? "number"
        : widget.type === "table"
          ? "table"
          : widget.type === "column"
            ? "column"
            : widget.type === "line"
              ? "line"
              : widget.type === "area"
                ? "area"
                : widget.type === "pie"
                  ? "pie"
                  : widget.type === "donut"
                    ? "donut"
                    : widget.type === "funnel"
                      ? "funnel"
                      : widget.type === "gauge"
                        ? "gauge"
                        : "bar",
    aggregation: "count",
    legend: "bottom",
    title: report.name,
    showValues: true,
    theme: "light",
  };
}

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

const newWidget = (
  type: Widget["type"],
  position: Widget["position"],
  config?: Record<string, any>,
): Widget => ({
  id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  type,
  title:
    type === "text"
      ? "Text widget"
      : type === "image"
        ? "Image widget"
        : "Select a report",
  config,
  position,
});

const GRID_COLUMNS = 12;
const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  gridColumns: 12,
  spacing: "normal",
  snapToGrid: true,
  autoArrange: true,
  showGridLines: true,
};
const MAX_WIDGETS = 20;
const WIDGET_TYPES: { type: Widget["type"]; label: string }[] = [
  { type: "metric", label: "Metric / KPI" },
  { type: "chart", label: "Bar Chart" },
  { type: "column", label: "Column Chart" },
  { type: "line", label: "Line Chart" },
  { type: "area", label: "Area Chart" },
  { type: "pie", label: "Pie Chart" },
  { type: "donut", label: "Donut Chart" },
  { type: "funnel", label: "Funnel Chart" },
  { type: "gauge", label: "Gauge" },
  { type: "table", label: "Table" },
  { type: "horizontalBar", label: "Horizontal Bar Chart" },
  { type: "stackedBar", label: "Stacked Bar Chart" },
  { type: "stackedColumn", label: "Stacked Column Chart" },
  { type: "summary", label: "Summary" },
  { type: "text", label: "Text / Rich Text" },
  { type: "image", label: "Image" },
  { type: "progress", label: "Progress / Target" },
  { type: "list", label: "List" },
  { type: "ranking", label: "Ranking" },
  { type: "custom", label: "Custom Widget" },
];

const DISPLAY_OPTIONS = [
  { value: "bar", label: "Bar", icon: "bars" },
  { value: "pie", label: "Pie", icon: "pie" },
  { value: "table", label: "Table", icon: "table" },
  { value: "number", label: "Number", icon: "number" },
] as const;

function overlaps(a: Widget["position"], b: Widget["position"]) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

function getGridColumnsForViewport() {
  if (typeof window === "undefined") return GRID_COLUMNS;
  if (window.innerWidth < 768) return 1;
  if (window.innerWidth < 1024) return 8;
  return GRID_COLUMNS;
}

function clampGridValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeLayout(
  input: Widget[],
  movingId?: string,
  columns = GRID_COLUMNS,
  compactMovingUp = false,
): Widget[] {
  const result: Widget[] = [];
  const otherWidgets = compactMovingUp && movingId
    ? normalizeLayout(input.filter((widget) => widget.id !== movingId), undefined, columns)
    : [];
  const ordered = [...input].sort((a, b) =>
    a.id === movingId
      ? -1
      : b.id === movingId
        ? 1
        : (a.position?.y ?? 0) - (b.position?.y ?? 0),
  );
  for (const widget of ordered) {
    const minW = widget.minW || 2;
    const minH = widget.minH || 2;
    const width = Math.max(minW, Math.min(columns, widget.position.w));
    const height = Math.max(minH, widget.minimized ? 1 : widget.position.h);
    const next = {
      ...widget,
      position: {
        x: Math.max(
          0,
          Math.min(Math.max(columns - width, 0), widget.position.x),
        ),
        y: Math.max(0, widget.position.y),
        w: width,
        h: height,
      },
    };
    if (compactMovingUp && widget.id === movingId && next.position.y > 0) {
      const candidateColumns = Array.from(
        { length: Math.max(0, columns - width + 1) },
        (_, index) => index,
      ).sort(
        (a, b) =>
          Math.abs(a - next.position.x) - Math.abs(b - next.position.x) ||
          a - b,
      );
      for (let y = 0; y < next.position.y; y += 1) {
        const availableColumn = candidateColumns.find((x) => {
          const candidate = { ...next.position, x, y };
          return !otherWidgets.some((item) =>
            overlaps(candidate, item.position),
          );
        });
        if (availableColumn !== undefined) {
          next.position.x = availableColumn;
          next.position.y = y;
          break;
        }
      }
    }
    while (result.some((item) => overlaps(next.position, item.position))) {
      next.position.y += 1;
    }
    result.push(next);
  }
  return result.sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
  );
}

export default function DashboardBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  // Save/edit require DASHBOARD_UPDATE on the server; never enter edit mode
  // for users who would only hit a 403 on save.
  const canEdit = hasPermission("Dashboard", "edit");
  const [isEditing, setIsEditing] = React.useState(
    searchParams.get("mode") !== "view" && canEdit,
  );
  const [dashboard, setDashboard] = React.useState<Dashboard | null>(null);
  const [widgets, setWidgets] = React.useState<Widget[]>([]);
  const [history, setHistory] = React.useState<Widget[][]>([]);
  const [future, setFuture] = React.useState<Widget[][]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [reportSearch, setReportSearch] = React.useState("");
  const [reports, setReports] = React.useState<Report[]>([]);
  const [reportLoadError, setReportLoadError] = React.useState("");
  const [selectedReport, setSelectedReport] = React.useState<Report | null>(
    null,
  );
  const [selectedWidget, setSelectedWidget] = React.useState<Widget | null>(
    null,
  );
  const [widgetData, setWidgetData] = React.useState<
    Record<string, ReportResult | null>
  >({});
  const [widgetLoading, setWidgetLoading] = React.useState<Set<string>>(
    new Set(),
  );
  const [widgetErrors, setWidgetErrors] = React.useState<
    Record<string, string>
  >({});
  const widgetRequests = React.useRef(new Set<string>());
  const autoLoadedWidgets = React.useRef(new Set<string>());
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<DashboardFilter[]>([]);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [draftFilter, setDraftFilter] = React.useState<DashboardFilter>({
    field: "projectName",
    operator: "equals",
    value: "",
  });
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);
  const [savedMessage, setSavedMessage] = React.useState("");
  const [expandedWidget, setExpandedWidget] = React.useState<Widget | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [refreshInterval, setRefreshInterval] = React.useState("MANUAL");
  const [autoRefreshWhileEditing, setAutoRefreshWhileEditing] =
    React.useState(false);
  const [drilldown, setDrilldown] = React.useState<ReportResult | null>(null);
  const [widgetConfigOpen, setWidgetConfigOpen] = React.useState(false);
  const [widgetDraft, setWidgetDraft] = React.useState<Record<string, any>>({});
  const [dirty, setDirty] = React.useState(false);
  const [saveAsOpen, setSaveAsOpen] = React.useState(false);
  const [saveAsName, setSaveAsName] = React.useState("");
  const [persistedWidgetIds, setPersistedWidgetIds] = React.useState<
    Set<string>
  >(new Set());
  const [draftSnapshot, setDraftSnapshot] = React.useState<Widget[]>([]);
  const [layoutColumns, setLayoutColumns] = React.useState(() =>
    getGridColumnsForViewport(),
  );
  const [layoutConfig, setLayoutConfig] = React.useState<LayoutConfig>(
    DEFAULT_LAYOUT_CONFIG,
  );
  const [resetLayoutOpen, setResetLayoutOpen] = React.useState(false);
  const [dragState, setDragState] = React.useState<{
    id: string;
    mode: "drag" | "resize";
    handle?: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
    startPointer: { x: number; y: number };
    startPosition: Widget["position"];
  } | null>(null);

  React.useEffect(() => {
    const syncColumns = () => {
      if (window.innerWidth < 768) setLayoutColumns(1);
      else setLayoutColumns(layoutConfig.gridColumns);
    };
    syncColumns();
    window.addEventListener("resize", syncColumns);
    return () => window.removeEventListener("resize", syncColumns);
  }, [layoutConfig.gridColumns]);

  React.useEffect(() => {
    if (!dragState) return;
    const handleMove = (event: MouseEvent) => {
      const deltaX = event.clientX - dragState.startPointer.x;
      const deltaY = event.clientY - dragState.startPointer.y;
      const currentColumns = layoutColumns || GRID_COLUMNS;
      const rowHeight = 90;
      const source = widgets.find((widget) => widget.id === dragState.id);
      if (!source) return;

      if (dragState.mode === "drag") {
        const deltaCols = layoutConfig.snapToGrid
          ? Math.round(deltaX / (window.innerWidth / currentColumns))
          : Math.trunc(deltaX / (window.innerWidth / currentColumns));
        const deltaRows = layoutConfig.snapToGrid
          ? Math.round(deltaY / rowHeight)
          : Math.trunc(deltaY / rowHeight);
        const nextPosition = {
          ...dragState.startPosition,
          x: clampGridValue(
            dragState.startPosition.x + deltaCols,
            0,
            Math.max(0, currentColumns - source.position.w),
          ),
          y: Math.max(0, dragState.startPosition.y + deltaRows),
        };
        setWidgets((current) => {
          const next = current.map((widget) =>
            widget.id === dragState.id
              ? { ...widget, position: { ...widget.position, ...nextPosition } }
              : widget,
          );
          return layoutConfig.autoArrange
            ? normalizeLayout(next, dragState.id, currentColumns)
            : next;
        });
        return;
      }

      const next = { ...dragState.startPosition };
      if (dragState.handle?.includes("e")) {
        next.w = clampGridValue(
          Math.round(
            (dragState.startPosition.w +
              deltaX / (window.innerWidth / currentColumns)) *
              1,
          ),
          source.minW || 2,
          currentColumns - next.x,
        );
      }
      if (dragState.handle?.includes("s")) {
        next.h = clampGridValue(
          Math.round((dragState.startPosition.h + deltaY / rowHeight) * 1),
          source.minH || 2,
          24,
        );
      }
      if (dragState.handle?.includes("w")) {
        const nextX = Math.round(
          (dragState.startPosition.x +
            deltaX / (window.innerWidth / currentColumns)) *
            1,
        );
        const widthDelta = dragState.startPosition.x - nextX;
        const newWidth = clampGridValue(
          dragState.startPosition.w + widthDelta,
          source.minW || 2,
          currentColumns,
        );
        next.x = clampGridValue(
          dragState.startPosition.x - (newWidth - dragState.startPosition.w),
          0,
          currentColumns - newWidth,
        );
        next.w = newWidth;
      }
      if (dragState.handle?.includes("n")) {
        const nextY = Math.round(
          (dragState.startPosition.y + deltaY / rowHeight) * 1,
        );
        const heightDelta = dragState.startPosition.y - nextY;
        const newHeight = clampGridValue(
          dragState.startPosition.h + heightDelta,
          source.minH || 2,
          24,
        );
        next.y = clampGridValue(
          dragState.startPosition.y - (newHeight - dragState.startPosition.h),
          0,
          24 - newHeight,
        );
        next.h = newHeight;
      }

      setWidgets((current) => {
        const updated = current.map((widget) =>
          widget.id === dragState.id
            ? { ...widget, position: { ...widget.position, ...next } }
            : widget,
        );
        return layoutConfig.autoArrange
          ? normalizeLayout(updated, dragState.id, currentColumns)
          : updated;
      });
    };

    const handleUp = () => {
      if (dragState.mode === "drag" && layoutConfig.autoArrange) {
        const arranged = normalizeLayout(
          widgets,
          dragState.id,
          layoutColumns || GRID_COLUMNS,
          true,
        );
        const currentPosition = widgets.find(
          (widget) => widget.id === dragState.id,
        )?.position;
        const arrangedPosition = arranged.find(
          (widget) => widget.id === dragState.id,
        )?.position;
        if (
          arrangedPosition &&
          (arrangedPosition.x !== dragState.startPosition.x ||
            arrangedPosition.y !== dragState.startPosition.y ||
            arrangedPosition.w !== dragState.startPosition.w ||
            arrangedPosition.h !== dragState.startPosition.h)
        ) {
          if (
            currentPosition &&
            (currentPosition.x !== arrangedPosition.x ||
              currentPosition.y !== arrangedPosition.y ||
              currentPosition.w !== arrangedPosition.w ||
              currentPosition.h !== arrangedPosition.h)
          ) {
            setWidgets(arranged);
          }
          setDirty(true);
        }
      }
      setDragState(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragState, layoutColumns, layoutConfig, widgets]);

  const loadDashboard = React.useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await readResponse<Dashboard>(
        await fetch(`/api/proxy/api/dashboards/${params.id}`, {
          cache: "no-store",
        }),
      );
      setDashboard(data);
      const savedLayoutConfig = {
        ...DEFAULT_LAYOUT_CONFIG,
        ...(data.layoutConfig || {}),
      } as LayoutConfig;
      setLayoutConfig(savedLayoutConfig);
      setLayoutColumns(savedLayoutConfig.gridColumns);
      widgetRequests.current.clear();
      autoLoadedWidgets.current.clear();
      const loadedWidgets = normalizeLayout(
        Array.isArray(data.layout)
          ? data.layout.map(normalizeWidgetReport)
          : [],
        undefined,
        savedLayoutConfig.gridColumns,
      );
      setWidgets(loadedWidgets);
      setDraftSnapshot(loadedWidgets);
      setPersistedWidgetIds(
        new Set(
          Array.isArray(data.layout)
            ? data.layout.map((widget) => widget.id)
            : [],
        ),
      );
      setFilters(Array.isArray(data.filters) ? data.filters : []);
      setRefreshInterval(data.refreshInterval || "MANUAL");
      setAutoRefreshWhileEditing(
        Boolean(
          (data as Dashboard & { autoRefreshWhileEditing?: boolean })
            .autoRefreshWhileEditing,
        ),
      );
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);
  React.useEffect(() => {
    setIsEditing(searchParams.get("mode") !== "view");
  }, [searchParams]);
  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "You have unsaved dashboard changes.";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const commit = (next: Widget[]) => {
    setHistory((current) => [...current.slice(-19), widgets]);
    setFuture([]);
    setWidgets(() => normalizeLayout(next, undefined, layoutColumns));
    setDirty(true);
  };
  const updateWidget = (
    id: string,
    patch: Partial<Widget> & { config?: Record<string, any> },
  ) =>
    commit(
      widgets.map((widget) =>
        widget.id === id
          ? {
              ...widget,
              ...patch,
              config: { ...widget.config, ...patch.config },
            }
          : widget,
      ),
    );

  const persistDashboard = async (nextWidgets: Widget[] = widgets) => {
    if (!dashboard) return;
    await readResponse(
      await fetch(`/api/proxy/api/dashboards/${dashboard.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dashboard.name,
          description: dashboard.description || undefined,
          folderId: dashboard.folderId || null,
          visibility: dashboard.visibility,
          layout: nextWidgets,
          layoutConfig,
          filters,
          refreshInterval,
          autoRefreshWhileEditing,
        }),
      }),
    );
    setPersistedWidgetIds(new Set(nextWidgets.map((widget) => widget.id)));
  };
  const save = async () => {
    if (!dashboard) return;
    try {
      setSaving(true);
      await persistDashboard();
      setSavedMessage("Dashboard saved successfully");
      setDirty(false);
      setIsEditing(false);
      router.replace(`/dashboards/${dashboard.id}?mode=view`, {
        scroll: false,
      });
      window.setTimeout(() => setSavedMessage(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save dashboard");
    } finally {
      setSaving(false);
    }
  };
  const enterEditing = () => {
    setDraftSnapshot(widgets);
    setDirty(false);
    setIsEditing(true);
    router.replace(`/dashboards/${dashboard?.id}?mode=edit`, { scroll: false });
  };
  const cancelEditing = () => {
    setWidgets(draftSnapshot);
    setHistory([]);
    setFuture([]);
    setDirty(false);
    setIsEditing(false);
    router.replace(`/dashboards/${dashboard?.id}?mode=view`, { scroll: false });
  };
  const saveAs = async () => {
    if (!dashboard || !saveAsName.trim()) return;
    try {
      const copied = await readResponse<Dashboard>(
        await fetch("/api/proxy/api/dashboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: saveAsName.trim(),
            description: dashboard.description || undefined,
            folderId: dashboard.folderId || null,
            layout: widgets,
            layoutConfig,
            filters,
            refreshInterval,
            autoRefreshWhileEditing,
          }),
        }),
      );
      router.replace(`/dashboards/${copied.id}`, { scroll: false });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save dashboard as a new dashboard",
      );
    }
  };
  const deleteCurrentDashboard = async () => {
    if (
      !dashboard ||
      !window.confirm("Delete Dashboard? This action cannot be undone.")
    )
      return;
    try {
      await readResponse(
        await fetch(`/api/proxy/api/dashboards/${dashboard.id}`, {
          method: "DELETE",
        }),
      );
      router.replace("/dashboards", { scroll: false });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Dashboard could not be deleted",
      );
    }
  };
  const finishEditing = async () => {
    if (
      dirty &&
      window.confirm("You have unsaved changes. Save changes before leaving?")
    )
      await save();
    setIsEditing(false);
    router.replace(`/dashboards/${dashboard?.id}?mode=view`, { scroll: false });
  };

  const loadReports = async () => {
    try {
      setReportLoadError("");
      const params = new URLSearchParams({
        view: "all",
        page: "1",
        limit: "100",
      });
      if (reportSearch.trim()) params.set("search", reportSearch.trim());
      const data = await readResponse<{ items?: Report[] } | Report[]>(
        await fetch(`/api/proxy/api/reports?${params.toString()}`, {
          cache: "no-store",
        }),
      );
      const nextReports = Array.isArray(data)
        ? data
        : Array.isArray(data.items)
          ? data.items
          : [];
      setReports(nextReports);
    } catch (err) {
      setReports([]);
      setReportLoadError(
        err instanceof Error ? err.message : "Unable to load reports",
      );
    }
  };

  const openWidgetPicker = () => {
    setMenuOpen(false);
    setSelectedReport(null);
    setPickerOpen(true);
    void loadReports();
  };
  const addWidget = (type: Widget["type"]) => {
    setWidgets((current) => {
      if (current.length >= MAX_WIDGETS) {
        setError("Maximum of 20 dashboard components reached.");
        return current;
      }

      const widget = newWidget(type, {
        x: 0,
        y: current.reduce(
          (max, item) => Math.max(max, item.position.y + item.position.h),
          0,
        ),
        w: type === "text" || type === "image" ? 4 : 6,
        h: 3,
      });
      widget.minW = 2;
      widget.minH = 2;

      setHistory((historyValue) => [...historyValue.slice(-19), current]);
      setFuture([]);
      setDirty(true);

      setMenuOpen(false);
      if (type !== "text" && type !== "image" && type !== "custom") {
        setSelectedWidget(widget);
        setPickerOpen(true);
        void loadReports();
      }

      return normalizeLayout([...current, widget], undefined, layoutColumns);
    });
  };
  const duplicateWidget = (widget: Widget) => {
    if (widgets.length >= MAX_WIDGETS) {
      setError("Maximum of 20 dashboard components reached.");
      return;
    }
    const copy: Widget = {
      ...widget,
      id: `${widget.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: `${widget.title} Copy`,
      config: { ...widget.config },
      position: {
        ...widget.position,
        x: widget.position.x + 1,
        y: widget.position.y,
      },
    };
    commit([...widgets, copy]);
  };
  const selectReport = (report: Report) => {
    if (!selectedWidget) return;
    setSelectedReport(report);
    setWidgetDraft(reportWidgetDraft(report, selectedWidget));
  };

  const closeWidgetPicker = () => {
    if (selectedWidget && !getWidgetReportId(selectedWidget)) {
      commit(widgets.filter((widget) => widget.id !== selectedWidget.id));
    }
    setPickerOpen(false);
    setSelectedWidget(null);
    setSelectedReport(null);
  };
  const saveWidgetConfig = () => {
    if (!selectedWidget || !widgetDraft.reportId) return;
    setWidgets((current) => {
      const nextWidgets: Widget[] = current.map((widget) =>
        widget.id === selectedWidget.id
          ? {
              ...widget,
              reportId: widgetDraft.reportId,
              title: String(
                widgetDraft.title || widgetDraft.reportName || "Widget",
              ),
              type:
                widgetDraft.chartType === "number"
                  ? "metric"
                  : widgetDraft.chartType === "table"
                    ? "table"
                    : widgetDraft.chartType === "pie"
                      ? "pie"
                      : widgetDraft.chartType === "bar"
                        ? "chart"
                        : widget.type,
              config: {
                ...widgetDraft,
                reportId: widgetDraft.reportId,
                reportName: widgetDraft.reportName || widget.title,
              },
            }
          : widget,
      );
      setHistory((historyValue) => [...historyValue.slice(-19), current]);
      setFuture([]);
      setDirty(true);
      setSelectedReport(null);
      setSelectedWidget(null);
      setWidgetConfigOpen(false);
      const savedWidget = nextWidgets.find(
        (widget) => widget.id === selectedWidget.id,
      );
      if (savedWidget) {
        const normalizedWidget = normalizeWidgetReport(savedWidget);
        void (async () => {
          try {
            await persistDashboard(nextWidgets);
            await refreshWidget(normalizedWidget, true);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Unable to save dashboard widget",
            );
          }
        })();
      }
      return normalizeLayout(nextWidgets, undefined, layoutColumns);
    });
  };

  const refreshWidget = async (widget: Widget, force = false) => {
    const reportId = getWidgetReportId(widget);
    if (!dashboard || !widgetExists(widget.id) || !reportId) return;
    if (!force && widgetRequests.current.has(widget.id)) return;
    widgetRequests.current.add(widget.id);
    setWidgetLoading((current) => new Set(current).add(widget.id));
    setWidgetErrors((current) => {
      const next = { ...current };
      delete next[widget.id];
      return next;
    });
    try {
      const response = await readResponse<WidgetDataResponse>(
        await fetch(
          `/api/proxy/api/dashboards/${dashboard.id}/widgets/${widget.id}/data`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filters }),
          },
        ),
      );
      setWidgetData((current) => ({ ...current, [widget.id]: response.data }));
      setLastRefreshed(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setWidgetErrors((current) => ({
        ...current,
        [widget.id]:
          message === "Saved report not found" || message === "Report not found"
            ? "Report unavailable"
            : "Unable to load report",
      }));
    } finally {
      widgetRequests.current.delete(widget.id);
      setWidgetLoading((current) => {
        const next = new Set(current);
        next.delete(widget.id);
        return next;
      });
    }
  };
  const refreshAll = async () => {
    setRefreshing(true);
    try {
      if (dashboard) {
        await readResponse(
          await fetch(`/api/proxy/api/dashboards/${dashboard.id}/refresh`, {
            method: "POST",
          }),
        );
      }
      await Promise.all(widgets.map((widget) => refreshWidget(widget, true)));
    } catch (err) {
      // Auto-refresh must fail quietly once per tick: no unhandled rejection,
      // no retry loop or request storm on a persistent API error.
      console.error("Dashboard refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };
  // The interval below keeps a stable handle; this ref always points at the
  // latest closure so the timer never refreshes a stale widget list.
  const refreshAllRef = React.useRef(refreshAll);
  React.useEffect(() => {
    refreshAllRef.current = refreshAll;
  });
  const drillInto = async (widget: Widget, field: string, value: unknown) => {
    if (!dashboard) return;
    try {
      const result = await readResponse<ReportResult>(
        await fetch(
          `/api/proxy/api/dashboards/${dashboard.id}/widgets/${widget.id}/drilldown`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field, value }),
          },
        ),
      );
      setDrilldown(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to open filtered report",
      );
    }
  };
  const applyFilter = () => {
    if (!draftFilter.value.trim()) {
      setError("Filter value is required.");
      return;
    }
    setFilters((current) => [
      ...current,
      { ...draftFilter, value: draftFilter.value.trim() },
    ]);
    setFilterOpen(false);
    setDraftFilter({ field: "projectName", operator: "equals", value: "" });
  };
  const removeFilter = (index: number) =>
    setFilters((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  React.useEffect(() => {
    const minutes: Record<string, number> = {
      "5_MINUTES": 5,
      "15_MINUTES": 15,
      "30_MINUTES": 30,
      "1_HOUR": 60,
    };
    if (!autoRefreshWhileEditing || !minutes[refreshInterval]) return;
    const timer = window.setInterval(
      () => void refreshAllRef.current(),
      minutes[refreshInterval] * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [autoRefreshWhileEditing, refreshInterval]);
  React.useEffect(() => {
    widgets
      .filter(
        (widget) =>
          persistedWidgetIds.has(widget.id) &&
          Boolean(getWidgetReportId(widget)),
      )
      .forEach((widget) => {
        const requestKey = `${widget.id}:${getWidgetReportId(widget)}:${JSON.stringify(filters)}`;
        if (autoLoadedWidgets.current.has(requestKey)) return;
        autoLoadedWidgets.current.add(requestKey);
        void refreshWidget(widget);
      }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedWidgetIds, widgets, filters]);

  const widgetExists = React.useCallback(
    (widgetId: string | undefined) =>
      Boolean(widgetId && widgets.some((widget) => widget.id === widgetId)),
    [widgets],
  );

  const moveWidget = (sourceId: string, targetId: string) => {
    const source = widgets.find((widget) => widget.id === sourceId);
    const target = widgets.find((widget) => widget.id === targetId);
    if (!source || !target || sourceId === targetId) return;
    commit(
      normalizeLayout(
        widgets.map((widget) =>
          widget.id === sourceId
            ? {
                ...widget,
                position: {
                  ...widget.position,
                  x: target.position.x,
                  y: target.position.y,
                },
              }
            : widget,
        ),
        sourceId,
        layoutColumns,
        layoutConfig.autoArrange,
      ),
    );
  };
  const resizeWidget = (widget: Widget, delta: number, heightDelta = 0) =>
    updateWidget(widget.id, {
      position: {
        ...widget.position,
        w: Math.max(
          widget.minW || 2,
          Math.min(GRID_COLUMNS, widget.position.w + delta),
        ),
        h: Math.max(widget.minH || 2, widget.position.h + heightDelta),
      },
    });
  const toggleMinimize = (widget: Widget) =>
    updateWidget(widget.id, { minimized: !widget.minimized });
  const updateLayoutConfig = (patch: Partial<LayoutConfig>) => {
    const nextConfig = { ...layoutConfig, ...patch };
    setLayoutConfig(nextConfig);
    if (patch.gridColumns) {
      setLayoutColumns(patch.gridColumns);
      setWidgets((current) =>
        normalizeLayout(
          current,
          undefined,
          patch.gridColumns || layoutConfig.gridColumns,
        ),
      );
    }
    setDirty(true);
  };
  const resetLayout = () => {
    const resetWidgets = widgets.map((widget, index) => ({
      ...widget,
      position: {
        x: (index * 4) % layoutConfig.gridColumns,
        y: Math.floor(index / 3) * 3,
        w: Math.min(4, layoutConfig.gridColumns),
        h: 3,
      },
    }));
    setWidgets(
      normalizeLayout(resetWidgets, undefined, layoutConfig.gridColumns),
    );
    setHistory((current) => [...current.slice(-19), widgets]);
    setFuture([]);
    setDirty(true);
    setResetLayoutOpen(false);
  };
  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setFuture((current) => [...current, widgets]);
    setWidgets(previous);
    setHistory((current) => current.slice(0, -1));
  };
  const redo = () => {
    const next = future[future.length - 1];
    if (!next) return;
    setHistory((current) => [...current, widgets]);
    setWidgets(next);
    setFuture((current) => current.slice(0, -1));
  };

  if (loading)
    return (
      <div className="p-8">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-96 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  if (!dashboard)
    return (
      <div className="p-8 text-destructive">
        {error || "Dashboard not found"}
      </div>
    );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/20">
      {resetLayoutOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Reset Dashboard Layout?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will restore the default widget positions and sizes without
              deleting widgets or reports.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setResetLayoutOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={resetLayout}>
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Dashboard Settings</h2>
                <p className="text-sm text-muted-foreground">
                  Manage visibility and refresh behavior.
                </p>
              </div>
              <button onClick={() => setSettingsOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <label className="mb-4 block text-sm font-medium">
              Visibility
              <select
                value={dashboard.visibility || "PRIVATE"}
                onChange={(event) =>
                  setDashboard((current) =>
                    current
                      ? { ...current, visibility: event.target.value }
                      : current,
                  )
                }
                className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="PRIVATE">Private</option>
                <option value="SHARED">Shared</option>
                <option value="PUBLIC">Public</option>
              </select>
            </label>
            <label className="mb-5 block text-sm font-medium">
              Refresh settings
              <select
                value={refreshInterval}
                onChange={(event) => setRefreshInterval(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="MANUAL">Manual</option>
                <option value="5_MINUTES">Every 5 minutes</option>
                <option value="15_MINUTES">Every 15 minutes</option>
                <option value="30_MINUTES">Every 30 minutes</option>
                <option value="1_HOUR">Every hour</option>
              </select>
            </label>
            <label className="mb-5 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={autoRefreshWhileEditing}
                onChange={(event) =>
                  setAutoRefreshWhileEditing(event.target.checked)
                }
              />
              Allow automatic refresh while editing
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setSettingsOpen(false);
                  void save();
                }}
              >
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      )}
      {filterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Dashboard Filter</h2>
                <p className="text-sm text-muted-foreground">
                  Filters are applied server-side to report widgets.
                </p>
              </div>
              <button onClick={() => setFilterOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <label className="mb-3 block text-sm font-medium">
              Field
              <select
                value={draftFilter.field}
                onChange={(event) =>
                  setDraftFilter((current) => ({
                    ...current,
                    field: event.target.value,
                  }))
                }
                className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="projectName">Project</option>
                <option value="ownerName">Owner</option>
                <option value="status">Status</option>
                <option value="source">Source</option>
                <option value="createdAt">Created Date</option>
              </select>
            </label>
            <label className="mb-3 block text-sm font-medium">
              Operator
              <select
                value={draftFilter.operator}
                onChange={(event) =>
                  setDraftFilter((current) => ({
                    ...current,
                    operator: event.target.value,
                  }))
                }
                className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="equals">Equals</option>
                <option value="notEquals">Not Equals</option>
                <option value="contains">Contains</option>
                <option value="startsWith">Starts With</option>
                <option value="gt">Greater Than</option>
                <option value="lt">Less Than</option>
                <option value="gte">Greater Than or Equal</option>
                <option value="lte">Less Than or Equal</option>
                <option value="isBlank">Is Blank</option>
                <option value="isNotBlank">Is Not Blank</option>
                <option value="in">In</option>
                <option value="notIn">Not In</option>
              </select>
            </label>
            <label className="mb-5 block text-sm font-medium">
              Value
              <Input
                value={draftFilter.value}
                onChange={(event) =>
                  setDraftFilter((current) => ({
                    ...current,
                    value: event.target.value,
                  }))
                }
                placeholder="Haven Crest"
                className="mt-1.5"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setFilters([]);
                  setFilterOpen(false);
                }}
              >
                Reset
              </Button>
              <Button variant="outline" onClick={() => setFilterOpen(false)}>
                Cancel
              </Button>
              <Button onClick={applyFilter}>Apply</Button>
            </div>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 overflow-x-auto border-b bg-background px-5 py-3 shadow-sm">
        <div className="flex min-w-max items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboards")}
            title="Back to dashboards"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold">{dashboard.name}</h1>
              {canEdit && (
                <button
                  title="Edit name"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    const name = window.prompt("Dashboard name", dashboard.name);
                    if (name?.trim() && name.trim() !== dashboard.name) {
                      setDashboard({ ...dashboard, name: name.trim() });
                      setDirty(true);
                    }
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Dashboard builder · 12-column layout
            </p>
          </div>
        </div>
        <div
          className={`flex min-w-max shrink-0 items-center gap-1.5 ${isEditing ? "" : "hidden"}`}
        >
          <Button
            variant="default"
            size="sm"
            onClick={() => addWidget("chart")}
            disabled={widgets.length >= MAX_WIDGETS}
            title={
              widgets.length >= MAX_WIDGETS
                ? "Maximum of 20 dashboard components reached."
                : "Add widget"
            }
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Widget
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={!history.length}
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={redo}
            disabled={!future.length}
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="ghost" onClick={cancelEditing}>
            Cancel
          </Button>
        </div>
        {!isEditing && canEdit && (
          <Button
            variant="outline"
            onClick={() => {
              enterEditing();
            }}
          >
            Edit
          </Button>
        )}
      </header>
      <main className="mx-auto max-w-[1500px] p-5 md:p-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Live dashboard</p>
            <h2 className="text-2xl font-semibold">{dashboard.name}</h2>
          </div>
        </div>
        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
            <button className="float-right" onClick={() => setError("")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div
          className={`grid auto-rows-[90px] p-2 md:p-3 ${layoutConfig.spacing === "compact" ? "gap-1" : layoutConfig.spacing === "wide" ? "gap-5" : "gap-3"} ${isEditing && layoutConfig.showGridLines ? "bg-slate-50/80 [background-image:linear-gradient(to_right,rgba(148,163,184,0.22)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.22)_1px,transparent_1px)]" : "bg-background/60"}`}
          style={{
            gridTemplateColumns: `repeat(${layoutColumns}, minmax(0, 1fr))`,
            backgroundSize:
              isEditing && layoutConfig.showGridLines && layoutColumns > 1
                ? `calc((100% - ${(layoutColumns - 1) * (layoutConfig.spacing === "compact" ? 4 : layoutConfig.spacing === "wide" ? 20 : 12)}px) / ${layoutColumns}) 90px`
                : "auto",
          }}
        >
          {widgets.length === 0 && (
            <div className="col-span-full flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center">
              <p className="text-lg font-semibold text-slate-700">
                Start building your dashboard
              </p>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                Add components to visualize your CRM data.
              </p>
              <Button
                className="mt-5"
                onClick={() => addWidget("chart")}
                disabled={widgets.length >= MAX_WIDGETS}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Widget
              </Button>
            </div>
          )}
          {widgets.map((widget) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              result={widgetData[widget.id]}
              loading={widgetLoading.has(widget.id)}
              error={widgetErrors[widget.id]}
              columns={layoutColumns}
              onDragStart={(event) => {
                if (!isEditing) return;
                event.preventDefault();
                setDraggedId(widget.id);
                setDragState({
                  id: widget.id,
                  mode: "drag",
                  startPointer: { x: event.clientX, y: event.clientY },
                  startPosition: { ...widget.position },
                });
              }}
              onDrop={() => {
                if (draggedId) moveWidget(draggedId, widget.id);
                setDraggedId(null);
                setDragState(null);
              }}
              isEditing={isEditing}
              onRemove={() => {
                if (window.confirm("Delete this dashboard component?"))
                  commit(widgets.filter((item) => item.id !== widget.id));
              }}
              onRefresh={() => void refreshWidget(widget, true)}
              onDrilldown={(field, value) =>
                void drillInto(widget, field, value)
              }
              onExpand={() => setExpandedWidget(widget)}
              onEdit={() => {
                setSelectedWidget(widget);
                const reportId = getWidgetReportId(widget);
                if (reportId) {
                  setSelectedReport({
                    id: reportId,
                    name: widget.config?.reportName || widget.title,
                    type: widget.config?.reportType,
                    objectName: widget.config?.reportObject || "",
                    createdAt:
                      widget.config?.reportCreatedAt ||
                      new Date(0).toISOString(),
                  });
                  setWidgetDraft({
                    ...widget.config,
                    reportId,
                    reportName: widget.config?.reportName || widget.title,
                  });
                  setPickerOpen(false);
                  setWidgetConfigOpen(true);
                } else {
                  setSelectedReport(null);
                  setPickerOpen(true);
                  void loadReports();
                }
              }}
              onResize={(handle, event) => {
                if (!isEditing || !event) return;
                event.preventDefault();
                event.stopPropagation();
                setDragState({
                  id: widget.id,
                  mode: "resize",
                  handle,
                  startPointer: { x: event.clientX, y: event.clientY },
                  startPosition: { ...widget.position },
                });
              }}
              onSetWidth={(width) =>
                updateWidget(widget.id, {
                  position: { ...widget.position, w: width },
                })
              }
              onResizeHeight={(delta) => resizeWidget(widget, 0, delta)}
              onDuplicate={() => duplicateWidget(widget)}
              onToggleMinimize={() => toggleMinimize(widget)}
            />
          ))}
        </div>
      </main>
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="flex max-h-[min(720px,90vh)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl md:flex-row">
            <aside className="hidden w-56 shrink-0 border-r bg-muted/20 p-5 md:block">
              <p className="mb-5 text-sm font-semibold">Reports</p>
              {[
                "Recent",
                "Created by Me",
                "Private Reports",
                "Public Reports",
                "All Reports",
              ].map((item, index) => (
                <button
                  key={item}
                  className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm ${index === 0 ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {item}
                </button>
              ))}
              <p className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Folders
              </p>
              <p className="px-3 text-sm text-muted-foreground">
                Created by Me
              </p>
              <p className="px-3 py-2 text-sm text-muted-foreground">
                Shared with Me
              </p>
              <p className="px-3 text-sm text-muted-foreground">All Folders</p>
            </aside>
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold">Select Report</h2>
                  <p className="text-xs text-muted-foreground">
                    Choose a saved report to power this widget.
                  </p>
                </div>
                <button
                  onClick={() => {
                    closeWidgetPicker();
                  }}
                >
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
              <div className="flex gap-2 border-b bg-muted/10 p-4">
                <div className="relative flex-1">
                  <BarChart3 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={reportSearch}
                    onChange={(event) => setReportSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void loadReports();
                    }}
                    placeholder="Search Reports and Folders..."
                    className="pl-9"
                  />
                </div>
                <Button variant="outline" onClick={() => void loadReports()}>
                  Search
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {reportLoadError ? (
                  <div className="p-12 text-center text-sm text-destructive">
                    <p>{reportLoadError}</p>
                    <button
                      type="button"
                      onClick={() => void loadReports()}
                      className="mt-2 font-medium text-primary hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : reports.length === 0 ? (
                  <div className="p-12 text-center text-sm text-muted-foreground">
                    No saved reports found.
                  </div>
                ) : (
                  reports.map((report) => (
                    <button
                      key={report.id}
                      onClick={() => selectReport(report)}
                      className={`flex w-full items-center justify-between border-b px-5 py-3.5 text-left transition-colors hover:bg-muted/50 ${
                        selectedReport?.id === report.id
                          ? "bg-red-50 ring-1 ring-inset ring-red-500"
                          : ""
                      }`}
                    >
                      <span>
                        <span className="block font-medium">{report.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {report.type || report.objectName} ·{" "}
                          {report.objectName} ·{" "}
                          {report.folder?.name || "Private Reports"}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(report.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <div className="flex justify-end gap-2 border-t bg-background p-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    closeWidgetPicker();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!selectedReport}
                  onClick={() => {
                    setPickerOpen(false);
                    setWidgetConfigOpen(true);
                  }}
                >
                  Select
                </Button>
              </div>
            </section>
          </div>
        </div>
      )}
      {drilldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-lg border bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Filtered report</h2>
                <p className="text-sm text-muted-foreground">
                  {drilldown.report?.name || "Report"}
                </p>
              </div>
              <button onClick={() => setDrilldown(null)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            {(drilldown.result?.rows || []).length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No data available
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {Object.keys(drilldown.result?.rows?.[0] || {}).map(
                      (key) => (
                        <th key={key} className="border-b px-3 py-2 text-left">
                          {key}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(drilldown.result?.rows || []).map((row, index) => (
                    <tr key={index}>
                      {Object.keys(drilldown.result?.rows?.[0] || {}).map(
                        (key) => (
                          <td key={key} className="border-b px-3 py-2">
                            {String(row[key] ?? "")}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {expandedWidget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-lg border bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{expandedWidget.title}</h2>
              <button onClick={() => setExpandedWidget(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <WidgetCard
              widget={expandedWidget}
              result={widgetData[expandedWidget.id]}
              loading={widgetLoading.has(expandedWidget.id)}
              error={widgetErrors[expandedWidget.id]}
              columns={layoutColumns}
              isEditing={false}
              onDragStart={() => undefined}
              onDrop={() => undefined}
              onRemove={() => setExpandedWidget(null)}
              onRefresh={() => void refreshWidget(expandedWidget, true)}
              onEdit={() => {
                setSelectedWidget(expandedWidget);
                setWidgetDraft(expandedWidget.config || {});
                setWidgetConfigOpen(true);
              }}
              onResize={() => undefined}
              onSetWidth={() => undefined}
              onResizeHeight={() => undefined}
              onDuplicate={() => undefined}
              onToggleMinimize={() => undefined}
              onDrilldown={(field, value) =>
                void drillInto(expandedWidget, field, value)
              }
              onExpand={() => undefined}
            />
          </div>
        </div>
      )}
      {widgetConfigOpen && selectedWidget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="flex max-h-[min(820px,94vh)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
            <div className="relative border-b px-6 py-4 text-center">
              <h2 className="text-2xl font-semibold">
                {getWidgetReportId(selectedWidget)
                  ? "Edit Widget"
                  : "Add Widget"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Configure how {widgetDraft.reportName || "this report"} appears
                on the dashboard.
              </p>
              <button
                className="absolute right-5 top-5"
                onClick={() => {
                  setWidgetConfigOpen(false);
                  setSelectedWidget(null);
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 md:grid-cols-[360px_minmax(0,1fr)]">
              <div className="min-h-0 overflow-y-auto border-r p-5">
                <p className="mb-4 text-sm font-medium text-muted-foreground">
                  Report
                </p>
                <div className="mb-5 flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-sm">
                  <span className="truncate font-medium">
                    {widgetDraft.reportName || "Selected report"}
                  </span>
                  <button
                    type="button"
                    className="ml-2 text-xs font-medium text-primary hover:underline"
                    onClick={() => {
                      setWidgetConfigOpen(false);
                      setPickerOpen(true);
                      void loadReports();
                    }}
                  >
                    Change
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-1">
                  <label className="text-sm font-medium">
                    Title
                    <Input
                      value={widgetDraft.title || ""}
                      onChange={(event) =>
                        setWidgetDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="text-sm font-medium">
                    <p className="mb-2">Display As</p>
                    <div className="grid grid-cols-4 gap-2">
                      {DISPLAY_OPTIONS.map((option) => {
                        const active =
                          (widgetDraft.chartType || "bar") === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            title={option.label}
                            aria-label={option.label}
                            aria-pressed={active}
                            onClick={() =>
                              setWidgetDraft((current) => ({
                                ...current,
                                chartType: option.value,
                              }))
                            }
                            className={`flex h-16 items-center justify-center rounded-lg border-2 transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-slate-200 bg-background text-slate-500 hover:border-primary/50 hover:bg-primary/5"}`}
                          >
                            {option.icon === "number" ? (
                              <span className="text-xl font-bold">123</span>
                            ) : option.icon === "table" ? (
                              <Table2 className="h-8 w-8" />
                            ) : option.icon === "pie" ? (
                              <PieChartIcon className="h-8 w-8" />
                            ) : (
                              <BarChart3 className="h-8 w-8" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="text-sm font-medium">
                    Measure
                    <select
                      value={widgetDraft.aggregation || "count"}
                      onChange={(event) =>
                        setWidgetDraft((current) => ({
                          ...current,
                          aggregation: event.target.value,
                        }))
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-red-200 bg-background px-4 text-base"
                    >
                      <option value="count">Record Count</option>
                      <option value="sum">Sum</option>
                      <option value="avg">Average</option>
                      <option value="min">Minimum</option>
                      <option value="max">Maximum</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    X-Axis
                    <Input
                      value={widgetDraft.xAxis || ""}
                      onChange={(event) =>
                        setWidgetDraft((current) => ({
                          ...current,
                          xAxis: event.target.value,
                        }))
                      }
                      placeholder="status"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Y-Axis
                    <Input
                      value={widgetDraft.yAxis || ""}
                      onChange={(event) =>
                        setWidgetDraft((current) => ({
                          ...current,
                          yAxis: event.target.value,
                        }))
                      }
                      placeholder="count"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Legend
                    <select
                      value={widgetDraft.legend || "bottom"}
                      onChange={(event) =>
                        setWidgetDraft((current) => ({
                          ...current,
                          legend: event.target.value,
                        }))
                      }
                      className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                    >
                      <option value="right">Right</option>
                      <option value="left">Left</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                      <option value="none">None</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(widgetDraft.showValues)}
                      onChange={(event) =>
                        setWidgetDraft((current) => ({
                          ...current,
                          showValues: event.target.checked,
                        }))
                      }
                    />{" "}
                    Show values
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(widgetDraft.showReferenceLine)}
                      onChange={(event) =>
                        setWidgetDraft((current) => ({
                          ...current,
                          showReferenceLine: event.target.checked,
                        }))
                      }
                    />{" "}
                    Show reference line
                  </label>
                  {widgetDraft.showReferenceLine && (
                    <label className="flex items-center gap-2 text-sm font-medium">
                      Reference value
                      <Input
                        type="number"
                        value={widgetDraft.referenceValue || ""}
                        onChange={(event) =>
                          setWidgetDraft((current) => ({
                            ...current,
                            referenceValue: event.target.value,
                          }))
                        }
                        className="h-8 w-24"
                        placeholder="100"
                      />
                    </label>
                  )}
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(widgetDraft.showReportLink)}
                      onChange={(event) =>
                        setWidgetDraft((current) => ({
                          ...current,
                          showReportLink: event.target.checked,
                        }))
                      }
                    />{" "}
                    Show report link
                  </label>
                </div>
              </div>
              <div className="min-h-0 overflow-auto bg-muted/20 p-5">
                <p className="mb-3 text-sm font-medium text-muted-foreground">
                  Preview
                </p>
                <div className="min-h-[360px] rounded-2xl border bg-background p-5 shadow-sm">
                  <div className="mb-4 text-lg font-semibold">
                    {widgetDraft.title ||
                      widgetDraft.reportName ||
                      "Report widget"}
                  </div>
                  <ReportVisualization
                    rows={widgetData[selectedWidget.id]?.result?.rows || []}
                    chartType={widgetDraft.chartType || "bar"}
                    config={widgetDraft}
                    onDrilldown={() => undefined}
                  />
                  <p className="mt-5 text-xs text-muted-foreground">
                    View Report ({widgetDraft.reportName || "Selected report"})
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t bg-background p-4">
              <Button
                variant="outline"
                onClick={() => {
                  setWidgetConfigOpen(false);
                  setSelectedWidget(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={saveWidgetConfig}
                disabled={!widgetDraft.reportId}
              >
                {getWidgetReportId(selectedWidget) ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {saveAsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Save As</h2>
              <button onClick={() => setSaveAsOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <Input
              autoFocus
              value={saveAsName}
              onChange={(event) => setSaveAsName(event.target.value)}
              placeholder="New dashboard name"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSaveAsOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!saveAsName.trim()}
                onClick={() => void saveAs()}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WidgetCard({
  widget,
  result,
  loading,
  error,
  columns,
  isEditing,
  onDragStart,
  onDrop,
  onRemove,
  onRefresh,
  onEdit,
  onResize,
  onResizeHeight,
  onSetWidth,
  onDuplicate,
  onToggleMinimize,
  onDrilldown,
  onExpand,
}: {
  widget: Widget;
  result?: ReportResult | null;
  loading?: boolean;
  error?: string;
  columns: number;
  isEditing: boolean;
  onDragStart: (
    event: React.DragEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
  ) => void;
  onDrop: () => void;
  onRemove: () => void;
  onRefresh: () => void;
  onEdit: () => void;
  onResize: (
    handle: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw",
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  onResizeHeight: (delta: number) => void;
  onSetWidth: (width: number) => void;
  onDuplicate: () => void;
  onToggleMinimize: () => void;
  onDrilldown: (field: string, value: unknown) => void;
  onExpand: () => void;
}) {
  const width = Math.min(columns, Math.max(1, widget.position.w));
  const style = {
    gridColumn: `${widget.position.x + 1} / span ${width}`,
    gridRow: `${widget.position.y + 1} / span ${widget.position.h}`,
  };
  const reportGroups = result?.result?.groups || [];
  const rows = reportGroups.length
    ? reportGroups.map((group) => {
        const categoryKey =
          widget.config?.xAxis || Object.keys(group.groupValues || {})[0] || "category";
        const groupCategoryKey = Object.keys(group.groupValues || {}).find(
          (key) => key.toLowerCase() === String(categoryKey).toLowerCase(),
        );
        const valueKey = widget.config?.yAxis || "value";
        const summaryValue = Object.values(group.summary || {}).find(
          (value) => typeof value === "number" && Number.isFinite(value),
        );
        const value =
          widget.config?.aggregation === "count" || !widget.config?.aggregation
            ? group.count || 0
            : summaryValue ?? group.count ?? 0;
        return {
          [categoryKey]:
            (groupCategoryKey && group.groupValues?.[groupCategoryKey]) ||
            "(Blank)",
          [valueKey]: value,
        };
      })
    : result?.result?.rows || [];
  const chartType = widget.config?.chartType || "bar";
  const tableRows = processReportData(rows, {
    categoryKey: widget.config?.xAxis,
    valueKey: widget.config?.yAxis,
    aggregation: widget.config?.aggregation || "count",
    preAggregated: reportGroups.length > 0,
    toNumeric: (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
        return Number(value);
      return null;
    },
  });
  const reportId = getWidgetReportId(widget);
  const updatedAt = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  return (
    <article
      style={style}
      draggable={isEditing}
      onMouseDown={
        isEditing
          ? (event) => {
              if (
                (event.target as HTMLElement).closest(
                  "button, a, input, select",
                )
              )
                return;
              onDragStart(event);
            }
          : undefined
      }
      onDragStart={
        isEditing
          ? (event) => {
              if (
                (event.target as HTMLElement).closest(
                  "button, a, input, select",
                )
              ) {
                event.preventDefault();
                return;
              }
              onDragStart(event);
            }
          : undefined
      }
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="group relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-background shadow-[0_2px_5px_rgba(15,23,42,0.16)]"
    >
      {isEditing && (
        <>
          <button
            type="button"
            aria-label="Resize from top-left"
            onMouseDown={(event) => onResize("nw", event)}
            className="absolute left-[-5px] top-[-5px] z-20 h-3 w-3 cursor-nwse-resize rounded-full border border-slate-500 bg-white"
          />
          <button
            type="button"
            aria-label="Resize from top"
            onMouseDown={(event) => onResize("n", event)}
            className="absolute left-1/2 top-[-5px] z-20 h-2 w-8 -translate-x-1/2 cursor-ns-resize rounded-full border border-slate-500 bg-white"
          />
          <button
            type="button"
            aria-label="Resize from top-right"
            onMouseDown={(event) => onResize("ne", event)}
            className="absolute right-[-5px] top-[-5px] z-20 h-3 w-3 cursor-nesw-resize rounded-full border border-slate-500 bg-white"
          />
          <button
            type="button"
            aria-label="Resize from right"
            onMouseDown={(event) => onResize("e", event)}
            className="absolute bottom-1/2 right-[-5px] z-20 h-8 w-2 translate-y-1/2 cursor-ew-resize rounded-full border border-slate-500 bg-white"
          />
          <button
            type="button"
            aria-label="Resize from bottom-right"
            onMouseDown={(event) => onResize("se", event)}
            className="absolute bottom-[-5px] right-[-5px] z-20 h-3 w-3 cursor-nwse-resize rounded-full border border-slate-500 bg-white"
          />
          <button
            type="button"
            aria-label="Resize from bottom"
            onMouseDown={(event) => onResize("s", event)}
            className="absolute bottom-[-5px] left-1/2 z-20 h-2 w-8 -translate-x-1/2 cursor-ns-resize rounded-full border border-slate-500 bg-white"
          />
          <button
            type="button"
            aria-label="Resize from bottom-left"
            onMouseDown={(event) => onResize("sw", event)}
            className="absolute bottom-[-5px] left-[-5px] z-20 h-3 w-3 cursor-nesw-resize rounded-full border border-slate-500 bg-white"
          />
          <button
            type="button"
            aria-label="Resize from left"
            onMouseDown={(event) => onResize("w", event)}
            className="absolute bottom-1/2 left-[-5px] z-20 h-8 w-2 translate-y-1/2 cursor-ew-resize rounded-full border border-slate-500 bg-white"
          />
        </>
      )}
      <div className="flex items-start justify-between gap-2 px-4 pb-1 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          {isEditing && (
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" />
          )}
          <div className="truncate text-sm font-semibold">{widget.title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 text-red-700">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Edit widget"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                title="Remove widget"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md hover:bg-red-50 hover:text-red-800"
                title="Refresh widget"
                onClick={(event) => {
                  event.stopPropagation();
                  onRefresh();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md hover:bg-red-50 hover:text-red-800"
                title="Expand widget"
                onClick={(event) => {
                  event.stopPropagation();
                  onExpand();
                }}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
      {!widget.minimized && (
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-3 pt-1">
          {widget.type === "text" ? (
            <div className="prose prose-sm">
              <h3>{widget.config?.title || "Text widget"}</h3>
              <p>
                {widget.config?.body || "Double-click to add text content."}
              </p>
            </div>
          ) : widget.type === "image" ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <ImagePlus className="mr-2 h-5 w-5" /> Add an image URL in widget
              settings
            </div>
          ) : !getWidgetReportId(widget) ? (
            <div className="flex h-full min-h-24 flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Table2 className="mb-2 h-6 w-6" />
              <p>No report selected</p>
              <button
                onClick={onEdit}
                className="mt-1 text-primary hover:underline"
              >
                Select a report
              </button>
            </div>
          ) : loading ? (
            <div className="flex h-full min-h-24 items-center justify-center text-sm text-muted-foreground">
              Loading report...
            </div>
          ) : error ? (
            <div className="flex h-full min-h-24 flex-col items-center justify-center text-center text-sm text-destructive">
              {error === "Report unavailable" ? (
                <>
                  <p className="font-medium">Report unavailable</p>
                  <p className="mt-1 text-muted-foreground">
                    The selected report could not be loaded.
                  </p>
                  <button
                    type="button"
                    onClick={onEdit}
                    className="mt-2 font-medium text-primary hover:underline"
                  >
                    Select another report
                  </button>
                </>
              ) : (
                <p>{error}</p>
              )}
              <button
                type="button"
                onClick={onRefresh}
                className="mt-2 font-medium text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          ) : chartType === "table" ? (
            tableRows.length === 0 ? (
              <div className="flex h-full min-h-24 items-center justify-center text-sm text-muted-foreground">
                No data to display
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {Object.keys(tableRows[0] || {}).map((key) => (
                      <th
                        key={key}
                        className="border-b px-2 py-2 text-left font-medium text-muted-foreground"
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.slice(0, 8).map((row, index) => (
                    <tr key={index}>
                      {Object.keys(tableRows[0] || {}).map((key) => (
                        <td key={key} className="border-b px-2 py-2">
                          <button
                            type="button"
                            className="text-left hover:text-primary"
                            onClick={() => onDrilldown(key, row[key])}
                          >
                            {String(row[key] ?? "—")}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : rows.length === 0 ? (
            <div className="flex h-full min-h-24 items-center justify-center text-sm text-muted-foreground">
              No data available
            </div>
          ) : (
            <ReportVisualization
              rows={rows}
              chartType={chartType}
              config={widget.config}
              preAggregated={reportGroups.length > 0}
              summary={result?.result?.summary}
              totalRows={result?.result?.totalRows}
              onDrilldown={onDrilldown}
            />
          )}
        </div>
      )}
      <div className="flex items-center justify-between border-t px-4 py-2 text-[11px]">
        {reportId ? (
          <Link
            href={`/reports/${reportId}`}
            className="font-medium text-red-700 hover:underline"
          >
              View Report ({widget.config?.reportName || widget.title})
          </Link>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="font-medium text-red-700 hover:underline"
          >
            View Report...
          </button>
        )}
        <span className="text-right leading-tight text-muted-foreground">
          {widget.config?.footer || `As of ${updatedAt}`}
        </span>
      </div>
    </article>
  );
}

function ReportVisualization({
  rows,
  chartType,
  config,
  summary,
  totalRows,
  onDrilldown,
  preAggregated = false,
}: {
  rows: Record<string, any>[];
  chartType: string;
  config?: Record<string, any>;
  summary?: Record<string, any>;
  totalRows?: number;
  onDrilldown: (field: string, value: unknown) => void;
  preAggregated?: boolean;
}) {
  const [hoveredCategory, setHoveredCategory] = React.useState<string | null>(
    null,
  );
  const toNumeric = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(Number(value))
    )
      return Number(value);
    if (value && typeof value === "object") {
      const serialized = String(value);
      if (serialized.trim() !== "" && Number.isFinite(Number(serialized)))
        return Number(serialized);
    }
    return null;
  };
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const numericKeys = keys.filter((key) =>
    rows.some((row) => toNumeric(row[key]) !== null),
  );
  const resolveColumnKey = (requested: unknown) => {
    if (typeof requested !== "string" || !requested.trim()) return undefined;
    const normalized = requested.trim().toLowerCase();
    return keys.find((key) => key.toLowerCase() === normalized);
  };
  const categoryKey =
    resolveColumnKey(config?.xAxis) ||
    keys.find((key) => !numericKeys.includes(key)) ||
    keys[0];
  const valueKey =
    resolveColumnKey(config?.yAxis) || numericKeys[0] || keys[1] || keys[0];
  const groupedRows = processReportData(rows, {
    categoryKey,
    valueKey,
    aggregation: config?.aggregation || "count",
    toNumeric,
    preAggregated,
  });
  if (!groupedRows.length && chartType !== "number")
    return <p className="text-sm text-muted-foreground">No data to display</p>;
  const groupKey = config?.groupBy;
  const colors = [
    "#dc2626",
    "#2563eb",
    "#16a34a",
    "#d97706",
    "#7c3aed",
    "#0891b2",
    "#db2777",
    "#65a30d",
  ];
  const pointClick = (entry?: Record<string, any>) => {
    const row = entry?.payload || entry;
    const field = categoryKey || keys[0];
    const value = row?.[field];
    if (field && value !== undefined && value !== null && value !== "") {
      onDrilldown(field, value);
    }
  };
  const chartData: Record<string, any>[] = groupedRows.map((row) => ({
    ...row,
    [valueKey]: Number(row[valueKey]) || 0,
  }));
  const summaryValue = summary
    ? Object.values(summary)
        .map(toNumeric)
        .find((value): value is number => value !== null)
    : undefined;
  const numberValue =
    summaryValue ??
    (config?.aggregation === "count"
      ? chartData.reduce((sum, row) => sum + (toNumeric(row[valueKey]) || 0), 0)
      : chartData.reduce(
          (sum, row) => sum + (toNumeric(row[valueKey]) || 0),
          0,
        ));
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey={categoryKey} />
      <YAxis />
      <Tooltip />
      <Legend />
    </>
  );
  if (chartType === "number" && !rows.length && summaryValue === undefined)
    return <p className="text-sm text-muted-foreground">No data available</p>;
  if (chartType === "number")
    return (
      <div
        className={`flex h-full items-center justify-center text-6xl font-medium tracking-tight ${config?.accentColor === "red" ? "text-red-700" : "text-teal-700"}`}
      >
        {Number(numberValue || 0).toLocaleString()}
      </div>
    );
  if (chartType === "gauge")
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="60%"
          outerRadius="90%"
          data={[
            {
              name: valueKey,
              value: Number(numberValue || 0),
              fill: colors[0],
            },
          ]}
          startAngle={180}
          endAngle={0}
        >
          <RadialBar dataKey="value" cornerRadius={8} />
          <Tooltip />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  if (chartType === "pie" || chartType === "donut")
    return (
      <div className="relative h-full min-h-[240px] w-full">
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 text-center text-sm font-medium text-foreground">
          {config?.aggregation === "count" || !config?.aggregation
            ? "Record Count"
            : String(config.aggregation).replace(/^./, (value) =>
                value.toUpperCase(),
              )}
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 30, right: 8, bottom: 8, left: 8 }}>
            <Tooltip />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              width={220}
              content={() => (
                <div className="flex max-h-[90%] flex-col justify-center gap-2 overflow-hidden pl-2 text-sm leading-5">
                  <p className="mb-1 truncate text-base font-medium text-foreground">
                    {String(config?.xAxis || categoryKey || "Category")
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (value) => value.toUpperCase())}
                  </p>
                  {chartData.map((row, index) => (
                    <span
                      key={`${String(row[categoryKey])}-${index}`}
                      className={`flex min-w-0 items-center gap-2 rounded-sm px-2 py-0.5 ${hoveredCategory === String(row[categoryKey]) ? "bg-slate-100" : ""}`}
                      title={String(row[categoryKey])}
                      onMouseEnter={() =>
                        setHoveredCategory(String(row[categoryKey]))
                      }
                      onMouseLeave={() => setHoveredCategory(null)}
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: colors[index % colors.length] }}
                      />
                      <span className="truncate">
                        {String(row[categoryKey])}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            />
            <Pie
              data={chartData}
              dataKey={valueKey}
              nameKey={categoryKey}
              cx="31%"
              cy="58%"
              innerRadius="48%"
              outerRadius="68%"
              minAngle={4}
              paddingAngle={1}
              label={({ value }) => String(value ?? "")}
              labelLine={false}
              onClick={(entry) => pointClick(entry as Record<string, any>)}
            >
              {chartData.map((row, index) => (
                <Cell key={index} fill={colors[index % colors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute left-[31%] top-[58%] z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background px-2 py-1 text-center">
          <span className="whitespace-nowrap text-2xl font-medium leading-none text-foreground">
            {chartData
              .reduce((sum, row) => sum + (Number(row[valueKey]) || 0), 0)
              .toLocaleString()}
          </span>
        </div>
      </div>
    );
  if (chartType === "funnel")
    return (
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip />
          <Funnel
            dataKey={valueKey}
            data={chartData}
            isAnimationActive
            onClick={(entry) => pointClick(entry as Record<string, any>)}
          >
            {chartData.map((row, index) => (
              <Cell key={index} fill={colors[index % colors.length]} />
            ))}
            <LabelList
              position="right"
              fill="#111827"
              stroke="none"
              dataKey={categoryKey}
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    );
  if (chartType === "scatter")
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart>
          {common}
          <Scatter
            data={chartData}
            fill={colors[0]}
            onClick={(entry) => pointClick(entry as Record<string, any>)}
          />
        </ScatterChart>
      </ResponsiveContainer>
    );
  if (chartType === "line")
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          {common}
          <Line
            type="monotone"
            dataKey={valueKey}
            stroke={colors[0]}
            onClick={(entry: any) => pointClick(entry?.payload)}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  if (chartType === "area")
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          {common}
          <Area
            type="monotone"
            dataKey={valueKey}
            stroke={colors[0]}
            fill={colors[0]}
            fillOpacity={0.25}
            onClick={(entry: any) => pointClick(entry?.payload)}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  if (
    chartType === "column" ||
    chartType === "stackedColumn" ||
    chartType === "bar" ||
    chartType === "stackedBar"
  )
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 12, right: 42, bottom: 24, left: 96 }}
          layout={
            chartType === "bar" || chartType === "stackedBar"
              ? "vertical"
              : "horizontal"
          }
          onClick={(state: any) =>
            pointClick(state?.activePayload?.[0]?.payload)
          }
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis
            dataKey={categoryKey}
            type="category"
            width={96}
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => String(value).slice(0, 18)}
          />
          <Tooltip />
          <Legend />
          {config?.showReferenceLine &&
            Number.isFinite(Number(config.referenceValue)) && (
              <ReferenceLine
                x={Number(config.referenceValue)}
                stroke="#dc2626"
                strokeDasharray="4 4"
              />
            )}
          <Bar
            dataKey={valueKey}
            fill={colors[0]}
            stackId={
              chartType.includes("stacked") ? groupKey || "stack" : undefined
            }
            onClick={(entry: any) => pointClick(entry?.payload)}
          >
            {config?.showValues && (
              <LabelList
                dataKey={valueKey}
                position="right"
                fill="#111827"
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  return (
    <p className="text-sm text-muted-foreground">Unsupported chart type</p>
  );
}

function processReportData(
  rows: Record<string, any>[],
  options: {
    categoryKey?: string;
    valueKey?: string;
    aggregation: string;
    toNumeric: (value: unknown) => number | null;
    preAggregated?: boolean;
  },
) {
  if (!rows.length) return [];
  if (options.preAggregated) return rows;
  const keys = Object.keys(rows[0]);
  const resolveKey = (requested: string | undefined) =>
    requested
      ? keys.find((key) => key.toLowerCase() === requested.toLowerCase())
      : undefined;
  const categoryKey =
    resolveKey(options.categoryKey) ||
    keys.find((key) => rows.some((row) => typeof row[key] === "string")) ||
    keys[0] ||
    "category";
  const valueKey =
    resolveKey(options.valueKey) ||
    keys.find((key) => rows.some((row) => options.toNumeric(row[key]) !== null)) ||
    keys[1] ||
    "value";
  const groups = new Map<string, Record<string, any>[]>();
  rows.forEach((row) => {
    const category = String(row[categoryKey] ?? "(Blank)");
    const group = groups.get(category) || [];
    group.push(row);
    groups.set(category, group);
  });
  return Array.from(groups, ([category, group]) => {
    const values = group
      .map((row) => options.toNumeric(row[valueKey]))
      .filter((value): value is number => value !== null);
    let value = group.length;
    if (options.aggregation !== "count" && values.length) {
      if (options.aggregation === "sum") value = values.reduce((a, b) => a + b, 0);
      if (options.aggregation === "avg") value = values.reduce((a, b) => a + b, 0) / values.length;
      if (options.aggregation === "min") value = Math.min(...values);
      if (options.aggregation === "max") value = Math.max(...values);
    }
    return { [categoryKey]: category, [valueKey]: value };
  });
}
