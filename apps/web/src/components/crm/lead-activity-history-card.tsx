"use client";

import * as React from "react";
import { CheckCircle2, ChevronDown, History, Loader2, RefreshCw } from "lucide-react";
import { leadApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface LeadActivityHistoryCardProps {
  leadId: string;
  leadName: string;
  refreshKey?: string;
  canViewAuditHistory?: boolean;
}

interface ActivityEntry {
  id: string;
  type: string;
  subject: string;
  description?: string | null;
  notes?: string | null;
  status?: string;
  createdAt: string;
  user?: { firstName: string; lastName: string } | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  objectType?: string;
  objectId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  createdAt: string;
  user?: { firstName: string; lastName: string } | null;
}

type FeedEntry =
  | { kind: "activity"; id: string; date: string; activity: ActivityEntry }
  | { kind: "history"; id: string; date: string; history: HistoryEntry };

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fieldLabel(field: string): string {
  return field
    .replace(/Id$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function historyDescription(entry: HistoryEntry): string {
  if (entry.action === "CREATE") return "Lead is created.";
  if (entry.action === "TASK_CREATED") {
    return `Task created${entry.newValues?.title ? `: ${displayValue(entry.newValues.title)}` : ""}.`;
  }
  if (entry.action === "FOLLOW_UP_CREATED") {
    return `Follow-up created${entry.newValues?.title ? `: ${displayValue(entry.newValues.title)}` : ""}.`;
  }
  if (entry.action === "NOTE_CREATED") return "Note added to the lead.";
  if (entry.action === "MOVE_TO_RECOVERY") return "Lead marked as Lost and moved to Recovery.";
  if (entry.action === "STATUS_CHANGE") {
    const status = entry.newValues?.status;
    return status ? `Lead status changed to ${displayValue(status).replace(/_/g, " ")}.` : "Lead status changed.";
  }

  const oldValues = entry.oldValues || {};
  const newValues = entry.newValues || {};
  const fields = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  const changes = [...fields]
    .filter((field) => !["reason", "note", "leadId", "recoveryReason", "recoveryNote"].includes(field) && !field.endsWith("Name"))
    .filter((field) => JSON.stringify(oldValues[field] ?? null) !== JSON.stringify(newValues[field] ?? null))
    .map((field) => {
      const nameField = field.endsWith("Id") ? `${field.slice(0, -2)}Name` : "";
      const newValue = nameField && newValues[nameField] ? newValues[nameField] : newValues[field];
      const oldValue = nameField && oldValues[nameField] ? oldValues[nameField] : oldValues[field];
      const label = fieldLabel(field);
      return oldValues[field] === undefined
        ? `${label} has been updated to ${displayValue(newValue)}.`
        : `${label} has been updated from ${displayValue(oldValue)} to ${displayValue(newValue)}.`;
    });

  return changes.length ? changes.join(" ") : `${fieldLabel(entry.action)}.`;
}

function activityDescription(activity: ActivityEntry): string {
  const prefix = activity.type.replace(/_/g, " ").toLowerCase();
  const description = activity.description || activity.notes;
  return [...new Set([
    activity.subject || `${prefix} activity`,
    description,
    activity.status ? `Status: ${activity.status.replace(/_/g, " ").toLowerCase()}` : null,
  ])]
    .filter(Boolean)
    .join(" · ");
}

function activityLabel(type: string): string {
  if (type === "FOLLOW_UP") return "Follow-up";
  if (type === "TASK") return "Task";
  if (type === "NOTE") return "Note";
  return type.replace(/_/g, " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
}

function timelineTitle(title: string): string {
  if (title.includes("_") && title === title.toUpperCase()) {
    return title.replace(/_/g, " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
  }
  return title;
}

function historyTitle(entry: HistoryEntry): string {
  const knownTitles: Record<string, string> = {
    CREATE: "Lead Created",
    OWNER_CHANGED: "Lead Re-Assigned",
    MOVE_TO_RECOVERY: "Lead marked as lost",
    PUSH_TO_SVC: "RR Allocation to Pre-Sales",
    STATUS_CHANGE: "Lead Status Changed",
    TASK_CREATED: "Task Created",
    FOLLOW_UP_CREATED: "Follow-up Created",
    NOTE_CREATED: "Note Added",
    SITE_VISIT_SCHEDULED: "Site Visit Scheduled",
    LEAD_CONVERTED_TO_OPPORTUNITY: "Lead Converted to Opportunity",
  };
  return knownTitles[entry.action] || timelineTitle(entry.action.replace(/_/g, " "));
}

function timelineMonth(date: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(date));
}

function timelineDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(new Date(date));
}

function actorSummary(entry: FeedEntry, userName: string): string {
  if (entry.kind === "activity") {
    const label = activityLabel(entry.activity.type).toLowerCase();
    return `${userName} had a ${label}`;
  }
  if (entry.history.action === "TASK_CREATED") return `${userName} had a task`;
  if (entry.history.action === "FOLLOW_UP_CREATED") return `${userName} had a follow-up`;
  return `${userName} updated this lead`;
}

export default function LeadActivityHistoryCard({
  leadId,
  leadName,
  refreshKey,
  canViewAuditHistory = false,
}: LeadActivityHistoryCardProps) {
  const [activities, setActivities] = React.useState<ActivityEntry[]>([]);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activityError, setActivityError] = React.useState<string | null>(null);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setActivityError(null);
    setHistoryError(null);

    const [activityResult, historyResult] = await Promise.all([
      Promise.allSettled([leadApi.getActivityHistory(leadId, { page: 1, limit: 100 })]),
      canViewAuditHistory
        ? Promise.allSettled([leadApi.getAuditHistory(leadId, { page: 1, limit: 100 })])
        : Promise.resolve([]),
    ]);

    const activity = activityResult[0];
    if (activity.status === "fulfilled" && activity.value.data.success) {
      setActivities(activity.value.data.data || []);
    } else {
      setActivities([]);
      setActivityError(
        activity.status === "rejected"
          ? activity.reason?.response?.data?.error || activity.reason?.message || "Activity entries could not be loaded."
          : activity.value.data.error || "Activity entries could not be loaded.",
      );
    }

    const auditHistory = historyResult[0];
    if (auditHistory?.status === "fulfilled" && auditHistory.value.data.success) {
      setHistory(auditHistory.value.data.data || []);
    } else if (auditHistory) {
      setHistory([]);
      setHistoryError(
        auditHistory.status === "rejected"
          ? auditHistory.reason?.response?.data?.error || auditHistory.reason?.message || "History entries could not be loaded."
          : auditHistory.value.data.error || "History entries could not be loaded.",
      );
    } else {
      setHistory([]);
    }
    setLoading(false);
  }, [canViewAuditHistory, leadId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const entries = React.useMemo<FeedEntry[]>(() => {
    const activityEntries: FeedEntry[] = activities.map((activity) => ({
      kind: "activity",
      id: `activity-${activity.id}`,
      date: activity.createdAt,
      activity,
    }));
    const activityIds = new Set(activities.map((activity) => activity.id));
    const visibleHistory = history.filter((entry) => {
      const representedAsActivity =
        entry.action === "TASK_CREATED" || entry.action === "FOLLOW_UP_CREATED";
      return !representedAsActivity || !entry.objectId || !activityIds.has(entry.objectId);
    });
    const historyEntries: FeedEntry[] = visibleHistory.map((entry) => ({
      kind: "history",
      id: `history-${entry.id}`,
      date: entry.createdAt,
      history: entry,
    }));
    return [...activityEntries, ...historyEntries].sort(
      (first, second) => new Date(second.date).getTime() - new Date(first.date).getTime(),
    );
  }, [activities, history]);

  const groupedEntries = React.useMemo(() => {
    const groups = new Map<string, FeedEntry[]>();
    for (const entry of entries) {
      const month = timelineMonth(entry.date);
      groups.set(month, [...(groups.get(month) || []), entry]);
    }
    return [...groups.entries()];
  }, [entries]);
  const hasVisibleSourceError = Boolean(activityError || historyError);

  return (
    <Card className="my-0 box-border w-full rounded-md border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3 border-b border-slate-200 bg-white p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#13a9d2]">
            <History className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          <h2 className="text-[12px] font-semibold">Lead Activity and History</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full bg-[#08749f] text-white hover:bg-[#066487] hover:text-white"
            aria-label="Refresh lead activity and history"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="border-t p-3">
        <div className="max-h-[350px] space-y-0 overflow-y-auto" aria-live="polite" aria-busy={loading}>
          {loading && entries.length === 0 ? (
            <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading activity and history...
            </div>
          ) : entries.length ? (
            groupedEntries.map(([month, monthEntries]) => (
              <section key={month} className="mb-2">
                <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-sky-100 bg-white py-1.5 text-[11px] text-blue-700">
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  <span className="font-medium">{month}</span>
                </div>
                <div className="pt-2">
                  {monthEntries.map((entry, index) => {
                    const user = entry.kind === "activity" ? entry.activity.user : entry.history.user;
                    const userName = user ? `${user.firstName} ${user.lastName}`.trim() : "System";
                    const title = entry.kind === "activity"
                      ? timelineTitle(entry.activity.subject || `${activityLabel(entry.activity.type)} Activity`)
                      : historyTitle(entry.history);
                    const details = entry.kind === "activity"
                      ? activityDescription(entry.activity)
                      : historyDescription(entry.history);
                    const titleId = `${entry.id}-title`;

                    return (
                      <div key={entry.id} className="relative min-h-14 pb-3 pl-7 last:pb-0">
                        {index < monthEntries.length - 1 && (
                          <span className="absolute bottom-0 left-[7px] top-4 border-l-2 border-emerald-500" aria-hidden="true" />
                        )}
                        <span className="absolute left-0 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-background" aria-hidden="true">
                          <CheckCircle2 className="h-3 w-3" />
                        </span>
                        <details className="group">
                          <summary className="flex cursor-pointer list-none items-start gap-2 rounded-sm pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <span className="min-w-0 flex-1">
                              <span id={titleId} className="block text-[11px] font-medium leading-4 text-rose-700 underline decoration-dotted underline-offset-2">
                                {title}
                              </span>
                              <span className="block text-[10px] leading-4 text-muted-foreground">
                                <span className="text-rose-700 underline decoration-dotted underline-offset-2">{userName}</span>
                                {" "}{actorSummary(entry, userName).slice(userName.length)}
                              </span>
                            </span>
                            <time
                              dateTime={entry.date}
                              title={new Date(entry.date).toLocaleString()}
                              className="shrink-0 pt-0.5 text-[9px] text-muted-foreground"
                            >
                              {timelineDate(entry.date)}
                            </time>
                            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/60 text-muted-foreground">
                              <ChevronDown className="h-2.5 w-2.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                            </span>
                          </summary>
                          <div className="mt-2 rounded-sm border-l-2 border-emerald-500 bg-muted/30 py-2 pl-3 pr-2 text-[11px]">
                            <p className="font-medium">{leadName}</p>
                            <p className="mt-1 text-muted-foreground">{details}</p>
                            <p className="mt-1 text-muted-foreground">{new Date(entry.date).toLocaleString()}</p>
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          ) : hasVisibleSourceError ? (
            <p role="alert" className="py-5 text-center text-sm text-destructive">
              {activityError && historyError
                ? `Unable to load activity or history: ${activityError} ${historyError}`
                : `Unable to load ${activityError ? "activity" : "history"}: ${activityError || historyError}`}
            </p>
          ) : (
            <p className="py-5 text-center text-sm text-muted-foreground">
              No activity or history entries found.
            </p>
          )}
          {hasVisibleSourceError && entries.length > 0 && (
            <p role="alert" className="py-2 text-xs text-destructive">
              {`Some entries could not be loaded: ${activityError || historyError}`}
            </p>
          )}
          {!loading && !hasVisibleSourceError && entries.length > 0 && (
            <p className="py-2 text-center text-[10px] text-muted-foreground">
              No more past activities to load.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
