"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, TrendingUp, Briefcase, FolderKanban, LayoutDashboard, FileText, CalendarCheck, Plus, ArrowRight, Pencil, Sparkles } from "lucide-react";
import { analyticsApi, opportunityApi, taskApi, activityApi, homepageApi, profileApi } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";

const profileConfig: Record<string, { title: string; description: string; accent: string; modules: string[] }> = {
  marketing: {
    title: "Marketing",
    description: "Lead intake and follow-up pipeline for marketing-driven opportunities.",
    accent: "bg-blue-100 text-blue-700",
    modules: ["Leads", "Contacts", "Customers", "Campaign Follow-ups"],
  },
  presales: {
    title: "Presales",
    description: "Pre-sales qualification, discovery, and site-visit preparation.",
    accent: "bg-violet-100 text-violet-700",
    modules: ["Leads", "Site Visits", "Opportunities", "Reports"],
  },
  svc: {
    title: "SVC",
    description: "Site visit coordination and field activity readiness.",
    accent: "bg-emerald-100 text-emerald-700",
    modules: ["Site Visits", "Projects", "Tasks", "Reports"],
  },
  sales: {
    title: "Sales",
    description: "Revenue conversion, quotation tracking, and deal progression.",
    accent: "bg-amber-100 text-amber-700",
    modules: ["Opportunities", "Quotations", "Bookings", "Payments"],
  },
  crm: {
    title: "CRM",
    description: "Cross-functional lead operations and channel coordination.",
    accent: "bg-cyan-100 text-cyan-700",
    modules: ["Leads", "Accounts", "Customers", "Tasks"],
  },
  finance: {
    title: "Finance",
    description: "Revenue control, payment tracking, and financial review.",
    accent: "bg-emerald-100 text-emerald-700",
    modules: ["Payments", "Bookings", "Reports", "Quotations"],
  },
  recovery: {
    title: "Recovery",
    description: "Renewal recovery, lost-deal follow-up, and account re-engagement.",
    accent: "bg-rose-100 text-rose-700",
    modules: ["Leads", "Customers", "Tasks", "Reports"],
  },
  manager: {
    title: "Manager",
    description: "Performance visibility and high-level operational oversight.",
    accent: "bg-indigo-100 text-indigo-700",
    modules: ["Dashboard", "Leads", "Reports", "Projects"],
  },
  admin: {
    title: "Admin",
    description: "System configuration, profile control, and administrative access.",
    accent: "bg-slate-100 text-slate-700",
    modules: ["Users", "Profiles", "Permissions", "Settings"],
  },
  "standard-user": {
    title: "Standard User",
    description: "Daily CRM activity and role-specific operational overview.",
    accent: "bg-blue-100 text-blue-700",
    modules: ["Leads", "Opportunities", "Tasks", "Reports"],
  },
  "system-administrator": {
    title: "System Administrator",
    description: "System configuration, user access, and organization-wide oversight.",
    accent: "bg-slate-100 text-slate-700",
    modules: ["Users", "Profiles", "Permissions", "Settings"],
  },
  "crm-admin": {
    title: "CRM Admin",
    description: "CRM administration, governance, and operational support.",
    accent: "bg-slate-100 text-slate-700",
    modules: ["Users", "Profiles", "Permissions", "Settings"],
  },
};

function normalizeProfileKey(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function profileSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function responseItems(response: any) {
  const data = response?.data?.data ?? response?.data;
  return Array.isArray(data) ? data : data?.profiles ?? data?.homepages ?? [];
}

function getModuleIcon(module: string) {
  switch (module) {
    case "Leads":
      return Users;
    case "Reports":
      return FolderKanban;
    case "Tasks":
      return Briefcase;
    case "Dashboard":
      return LayoutDashboard;
    case "Payments":
      return TrendingUp;
    case "Site Visits":
      return CalendarCheck;
    case "Opportunities":
      return TrendingUp;
    case "Bookings":
      return FileText;
    default:
      return Users;
  }
}

const formatAmount = (amount: number) => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
};

const formatTimeAgo = (value: string) => {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const profileHomeWidgets = [
  { id: "total-leads", label: "Total Leads" },
  { id: "opportunities", label: "Opportunities" },
  { id: "pipeline-value", label: "Pipeline Value" },
  { id: "active-tasks", label: "Active Tasks" },
  { id: "recent-opportunities", label: "Recent Opportunities" },
  { id: "pipeline-summary", label: "Pipeline Summary" },
  { id: "upcoming-tasks", label: "Upcoming Tasks" },
  { id: "recent-activity", label: "Recent Activity" },
  { id: "leads-by-source", label: "Leads by Source" },
  { id: "open-tasks", label: "Open Tasks" },
  { id: "overdue-tasks", label: "Overdue Tasks" },
  { id: "tasks-completed", label: "Tasks Completed" },
  { id: "tasks-by-users", label: "Tasks by Users" },
  { id: "calls-by-purpose", label: "Calls by Purpose" },
  { id: "my-calls-today", label: "My Calls Today" },
];

function getProfileKpiStyle(label: string) {
  const styles: Record<string, { card: string; icon: string; glow: string }> = {
    "Total Leads": { card: "border-sky-200 bg-gradient-to-br from-white via-white to-sky-50", icon: "bg-gradient-to-br from-sky-400 to-blue-700 text-white", glow: "bg-sky-100/70" },
    Opportunities: { card: "border-teal-200 bg-gradient-to-br from-white via-white to-teal-50", icon: "bg-gradient-to-br from-cyan-400 to-teal-600 text-white", glow: "bg-teal-100/70" },
    "Pipeline Value": { card: "border-violet-200 bg-gradient-to-br from-white via-white to-violet-50", icon: "bg-gradient-to-br from-violet-400 to-purple-700 text-white", glow: "bg-violet-100/70" },
    "Active Tasks": { card: "border-blue-200 bg-gradient-to-br from-white via-white to-blue-50", icon: "bg-gradient-to-br from-blue-400 to-indigo-700 text-white", glow: "bg-blue-100/70" },
  };
  return styles[label] || { card: "border-sky-100 bg-white", icon: "bg-blue-600 text-white", glow: "bg-sky-100/50" };
}

const isProfileHomepageWidget = (id: unknown): id is string =>
  typeof id === "string" && id.length > 0;

function profileHomepageWidgetLabel(id: string) {
  return profileHomeWidgets.find((widget) => widget.id === id)?.label ||
    (id.startsWith("report-")
      ? `Report ${id.slice("report-".length)}`
      : id.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
}

export default function ProfileLandingPage() {
  const params = useParams<{ profileName: string }>();
  const searchParams = useSearchParams();
  const { hasPermission, isAdmin, isSuperAdmin, profile } = useAuth();
  const canEditProfileHome = isAdmin || isSuperAdmin;
  const requestedProfileId = searchParams.get("profileId");
  const requestedProfileLabel = searchParams.get("profileLabel");
  const [loading, setLoading] = React.useState(true);
  const [selectedProfileId, setSelectedProfileId] = React.useState<string | null>(requestedProfileId);
  const [selectedHomepageId, setSelectedHomepageId] = React.useState<string | null>(null);
  const [hasSavedHomepage, setHasSavedHomepage] = React.useState(false);
  const [profileHomeLoading, setProfileHomeLoading] = React.useState(true);
  const [selectedComponents, setSelectedComponents] = React.useState<string[]>(
    profileHomeWidgets.map((widget) => widget.id),
  );
  const [savedLayouts, setSavedLayouts] = React.useState<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  const [editError, setEditError] = React.useState("");
  const [kpis, setKpis] = React.useState<any[]>([]);
  const [recentOpportunities, setRecentOpportunities] = React.useState<any[]>([]);
  const [pipelineStages, setPipelineStages] = React.useState<any[]>([]);
  const [upcomingTasks, setUpcomingTasks] = React.useState<any[]>([]);
  const [recentActivities, setRecentActivities] = React.useState<any[]>([]);

  const [localPage, setLocalPage] = React.useState({
    title: "",
    description: "",
  });
  const profileEditParams = new URLSearchParams({ profile: localPage.title });
  if (selectedProfileId) profileEditParams.set("profileId", selectedProfileId);
  if (selectedHomepageId) profileEditParams.set("homepageId", selectedHomepageId);
  const profileEditHref = `/admin/customize-home/create?${profileEditParams}`;

  React.useEffect(() => {
    const rawName = requestedProfileLabel || (params.profileName || "").replace(/-/g, " ");
    const key = normalizeProfileKey(rawName);
    const knownConfig = profileConfig[key] || profileConfig[params.profileName || ""];

    const defaultTitle = knownConfig?.title || rawName || "Profile";
    const defaultDescription = knownConfig?.description || "Profile overview and operational summary.";

    const page = {
      title: defaultTitle,
      description: defaultDescription,
    };
    setLocalPage(page);

    setLoading(false);
  }, [params.profileName, requestedProfileLabel]);

  React.useEffect(() => {
    let active = true;
    setProfileHomeLoading(true);
    const viewingAssignedProfile =
      Boolean(profile?.id) &&
      (!canEditProfileHome ||
        !requestedProfileId ||
        requestedProfileId === profile?.id);
    Promise.all([
      viewingAssignedProfile || requestedProfileId
        ? Promise.resolve(null)
        : canEditProfileHome
          ? profileApi.list({ limit: 100 })
          : Promise.resolve(null),
      viewingAssignedProfile && profile?.id
        ? homepageApi.assigned()
        : homepageApi.list(),
    ])
      .then(([profilesResponse, homepagesResponse]) => {
        const profileName = profileSlug((params.profileName || "").replace(/-/g, " "));
        const selectedProfile = viewingAssignedProfile && profile?.id
          ? profile
          : requestedProfileId
            ? { id: requestedProfileId, name: requestedProfileLabel || localPage.title }
            : responseItems(profilesResponse).find(
                (profile: any) => profileSlug(profile.name || "") === profileName,
              );
        const homepageResponseData =
          homepagesResponse?.data?.data ?? homepagesResponse?.data;
        const homepage = viewingAssignedProfile && profile?.id
          ? homepageResponseData
          : selectedProfile && responseItems(homepagesResponse).find((item: any) =>
              (item.sharedProfiles || []).some(
                (share: any) => (share.profile?.id || share.profileId) === selectedProfile.id,
              ),
            );
        const savedLayout = Array.isArray(homepage?.layout) ? homepage.layout : [];
        const savedComponentIds = savedLayout
          .map((item: any) => typeof item === "string" ? item : item?.id)
          .filter(isProfileHomepageWidget);
        const savedLayoutById = Object.fromEntries(
          savedLayout
            .filter((item: any) =>
              typeof item !== "string" &&
              isProfileHomepageWidget(item.id) &&
              [item.x, item.y, item.width, item.height].every(Number.isFinite),
            )
            .map((item: any) => [item.id, item]),
        );
        if (active) {
          setSelectedProfileId(selectedProfile?.id || null);
          setSelectedHomepageId(homepage?.id || null);
          setHasSavedHomepage(Boolean(homepage && savedComponentIds.length));
          setSavedLayouts(savedLayoutById);
          setEditError(selectedProfile ? "" : "Unable to find this profile in Setup Home → Profiles.");
          setSelectedComponents(homepage && savedComponentIds.length
            ? savedComponentIds
            : profileHomeWidgets.map((widget) => widget.id));
          if (selectedProfile?.name) {
            const page = {
              title: selectedProfile.name,
              description: homepage?.description ?? "Profile overview and operational summary.",
            };
            setLocalPage(page);
          }
        }
      })
      .catch(() => {
        if (active) {
          setEditError("Unable to load this profile's homepage settings.");
        }
      })
      .finally(() => {
        if (active) setProfileHomeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    canEditProfileHome,
    params.profileName,
    profile?.id,
    profile?.name,
    requestedProfileId,
    requestedProfileLabel,
  ]);

  React.useEffect(() => {
    let active = true;

    const fetchData = async () => {
      try {
        const [leadsRes, oppRes, pipelineRes, tasksRes, activitiesRes, recentOppRes] = await Promise.allSettled([
          analyticsApi.getLeads(),
          analyticsApi.getOpportunities(),
          analyticsApi.getPipeline(),
          taskApi.list({ limit: 3, sortBy: "dueDate", sortOrder: "asc" }),
          activityApi.list({ limit: 3 }),
          opportunityApi.list({ limit: 3, sortBy: "createdAt", sortOrder: "desc" }),
        ]);
        if (!active) return;

        const leadsData = leadsRes.status === "fulfilled" ? leadsRes.value.data?.data : null;
        const oppData = oppRes.status === "fulfilled" ? oppRes.value.data?.data : null;
        const pipelineData = pipelineRes.status === "fulfilled" ? pipelineRes.value.data?.data : null;
        const tasksData = tasksRes.status === "fulfilled" ? tasksRes.value.data?.data : [];
        const activitiesData = activitiesRes.status === "fulfilled" ? activitiesRes.value.data?.data : [];
        const recentOppData = recentOppRes.status === "fulfilled" ? recentOppRes.value.data?.data : [];

        setKpis([
          { label: "Total Leads", value: String(leadsData?.total ?? 0), icon: Users },
          { label: "Opportunities", value: String(oppData?.total ?? 0), icon: TrendingUp },
          { label: "Pipeline Value", value: formatAmount(pipelineData?.totalPipeline ?? 0), icon: TrendingUp },
          { label: "Active Tasks", value: String(Array.isArray(tasksData) ? tasksData.length : 0), icon: Briefcase },
        ]);

        if (Array.isArray(recentOppData)) setRecentOpportunities(recentOppData.slice(0, 3));
        if (Array.isArray(tasksData)) setUpcomingTasks(tasksData.slice(0, 3));
        if (Array.isArray(activitiesData)) setRecentActivities(activitiesData.slice(0, 3));
        if (Array.isArray(pipelineData?.stages)) {
          setPipelineStages(
            pipelineData.stages
              .filter((s: any) => !["CLOSED_WON", "CLOSED_LOST"].includes(s.stage))
              .slice(0, 4)
              .map((s: any) => ({ stage: s.stage, count: s.count, amount: s.amount ?? 0 })),
          );
        }
      } catch {
        if (active) {
          setKpis([]);
          setRecentOpportunities([]);
          setUpcomingTasks([]);
          setRecentActivities([]);
        }
      }
    };

    fetchData();
    return () => {
      active = false;
    };
  }, []);

  const getEditableWidgetContent = (id: string) => {
    const kpi = kpis.find((item) => {
      const widgetIds: Record<string, string> = {
        "Total Leads": "total-leads",
        Opportunities: "opportunities",
        "Pipeline Value": "pipeline-value",
        "Active Tasks": "active-tasks",
      };
      return widgetIds[item.label] === id;
    });
    if (kpi) {
      const Icon = kpi.icon || getModuleIcon(kpi.label);
      const style = getProfileKpiStyle(kpi.label);
      return (
        <div className={`relative isolate flex h-full min-h-[136px] items-center justify-between overflow-hidden rounded-xl border p-4 shadow-sm sm:p-5 ${style.card}`}>
          <div aria-hidden="true" className={`pointer-events-none absolute -bottom-9 right-5 h-24 w-24 rounded-full ${style.glow}`} />
          <div className="relative z-10">
            <div className="text-[13px] font-medium text-slate-700">{kpi.label}</div>
            <div className="mt-2 text-3xl font-bold leading-none tracking-tight text-slate-900">{kpi.value}</div>
          </div>
          <div className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-md ring-1 ring-white/40 ${style.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      );
    }

    if (id === "recent-opportunities") {
      return (
        <div className="h-full overflow-auto rounded-xl border border-sky-100 bg-white p-4 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-[16px] font-semibold tracking-tight">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Recent Opportunities
          </h2>
          {recentOpportunities.length === 0 ? (
            <div className="flex min-h-[120px] items-center justify-center text-muted-foreground">No recent opportunities</div>
          ) : (
            <div className="space-y-3">
              {recentOpportunities.map((opp: any) => (
                <div key={opp.id} className="flex items-center justify-between rounded-lg border border-sky-100 bg-gradient-to-r from-blue-50/80 to-white p-3 transition-colors hover:border-blue-200 hover:from-blue-50">
                  <div>
                    <div className="font-medium text-slate-800">{opp.name || "Untitled Opportunity"}</div>
                    <div className="text-sm uppercase tracking-wide text-muted-foreground">{opp.stage || "—"}</div>
                  </div>
                  <div className="font-semibold text-slate-800">{formatAmount(opp.amount || 0)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (id === "pipeline-summary") {
      return (
        <div className="h-full overflow-auto rounded-xl border border-sky-100 bg-white p-4 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-[16px] font-semibold tracking-tight">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Pipeline Summary
          </h2>
          <div className="space-y-4">
            {pipelineStages.length === 0 ? (
              <div className="flex min-h-[120px] items-center justify-center text-muted-foreground">No pipeline data</div>
            ) : pipelineStages.map((stage) => (
              <div key={stage.stage} className="space-y-2">
                <div className="flex items-center justify-between text-sm text-slate-700">
                  <span className="capitalize">{stage.stage.toLowerCase().replace(/_/g, " ")}</span>
                  <span>{stage.count} • {formatAmount(stage.amount)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-blue-100">
                  <div className="h-2.5 rounded-full bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400" style={{ width: `${Math.min(100, Math.max(8, stage.count * 20))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (id === "upcoming-tasks") {
      return (
        <div className="h-full overflow-auto rounded-xl border border-sky-100 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-[16px] font-semibold tracking-tight text-slate-800">Upcoming Tasks</h2>
          {upcomingTasks.length === 0 ? (
            <div className="flex min-h-[170px] items-center justify-center text-muted-foreground">No upcoming tasks</div>
          ) : (
            <div className="space-y-3">
              {upcomingTasks.map((task: any) => (
                <div key={task.id} className="flex items-center justify-between rounded-lg border border-sky-100 bg-gradient-to-r from-blue-50/80 to-white p-3">
                  <div>
                    <div className="font-medium text-slate-800">{task.title || "Untitled Task"}</div>
                    <div className="text-sm uppercase tracking-wide text-muted-foreground">{task.status || "—"}</div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "No due date"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (id === "recent-activity") return (
      <div className="h-full overflow-auto rounded-xl border border-sky-100 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-[16px] font-semibold tracking-tight text-slate-800">Recent Activity</h2>
        {recentActivities.length === 0 ? (
          <div className="flex min-h-[170px] items-center justify-center text-muted-foreground">No recent activity</div>
        ) : (
          <div className="space-y-3">
            {recentActivities.map((activity: any) => (
              <div key={activity.id} className="rounded-lg border border-sky-100 bg-gradient-to-r from-blue-50/80 to-white p-3">
                <div className="text-sm font-medium text-slate-800">{activity.message || "Activity"}</div>
                <div className="text-xs text-muted-foreground">
                  {activity.type || "Update"} • {activity.createdAt ? formatTimeAgo(activity.createdAt) : "Now"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-sky-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-[16px] font-semibold tracking-tight">
          {profileHomepageWidgetLabel(id)}
        </h2>
        {id.startsWith("report-") ? (
          <Link
            href={`/reports/${encodeURIComponent(id.slice("report-".length))}`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            Open report
          </Link>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Dashboard component
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <Skeleton className="h-64 xl:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/home" className="inline-flex items-center gap-2 hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
        </div>
      </div>

      <div className="relative isolate flex min-h-[120px] items-center justify-between gap-4 overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-r from-[#2145b8] via-[#2865e7] to-[#35b9e8] px-6 py-5 text-white shadow-md">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-[42%] h-56 w-56 rounded-full border-[18px] border-white/10" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/60 bg-white/90 text-xl font-bold text-blue-700 shadow-sm">
            {localPage.title.slice(0, 2).toUpperCase() || "PR"}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Welcome {localPage.title}</h1>
            <p className="mt-1 text-sm text-white/85">{localPage.description}</p>
            <div className="mt-3 h-1 w-9 rounded-full bg-cyan-200" />
          </div>
        </div>
        <div className="relative z-10 flex flex-wrap justify-end gap-2">
          {canEditProfileHome && (
            <Button
              variant="outline"
              className="border-white/50 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              asChild={Boolean(selectedProfileId)}
              disabled={!selectedProfileId}
            >
              {selectedProfileId ? (
                <Link href={profileEditHref}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              ) : (
                <span className="inline-flex items-center">
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </span>
              )}
            </Button>
          )}
          <Button variant="outline" className="border-white/50 bg-white/10 text-white hover:bg-white/20 hover:text-white" asChild>
            <Link href="/reports">View Reports</Link>
          </Button>
          {hasPermission("Lead", "create") && (
            <Button className="bg-slate-950 text-white shadow-md hover:bg-slate-800" asChild>
              <Link href="/leads/new">
                <Plus className="mr-2 h-4 w-4" />
                New Lead
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
        <p className="flex items-center gap-2 font-semibold text-slate-700">
          <Sparkles className="h-4 w-4 text-blue-500" />
          Here&apos;s what&apos;s happening today.
        </p>
        <div className="rounded-lg border border-sky-100 bg-white px-3 py-2 font-medium text-blue-700 shadow-sm">
          {localPage.title}&apos;s Home
        </div>
      </div>

      {editError && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {editError}
        </p>
      )}

      {profileHomeLoading ? (
        <div className="space-y-4" aria-label="Loading profile dashboard">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : <>
      {hasSavedHomepage && (
      <div className="overflow-x-auto">
        <div
          className="grid gap-2 p-2"
          data-testid="profile-homepage-layout"
          style={{
            width: "100%",
            minWidth: "100%",
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            gridAutoRows: 116,
          }}
        >
          {selectedComponents.map((id, index) => {
            const layout = savedLayouts[id];
            const columnSpan = layout
              ? Math.max(1, Math.min(12, Math.round((layout.width + 8) / 93)))
              : 3;
            const rowSpan = layout
              ? Math.max(1, Math.round((layout.height + 8) / 124))
              : 2;
            const column = layout
              ? Math.min(12 - columnSpan, Math.max(0, Math.round((layout.x - 8) / 93)))
              : (index * 3) % 12;
            const row = layout
              ? Math.max(0, Math.round((layout.y - 8) / 124))
              : Math.floor(index / 4) * 2;
            return (
              <div
                key={id}
                data-widget-id={id}
                data-layout-x={layout?.x}
                data-layout-y={layout?.y}
                style={{
                  gridColumn: `${column + 1} / span ${columnSpan}`,
                  gridRow: `${row + 1} / span ${rowSpan}`,
                  minWidth: 0,
                }}
              >
                {getEditableWidgetContent(id)}
              </div>
            );
          })}
        </div>
      </div>
      )}
      {!hasSavedHomepage && selectedComponents.some((id) =>
        ["total-leads", "opportunities", "pipeline-value", "active-tasks"].includes(id),
      ) && (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.length === 0
          ? Array.from({ length: selectedComponents.filter((id) =>
              ["total-leads", "opportunities", "pipeline-value", "active-tasks"].includes(id),
            ).length }).map((_, index) => (
              <div key={index} className="rounded-xl border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4 shadow-sm">
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-8 w-20" />
              </div>
            ))
          : kpis.filter((kpi) => {
              const widgetIds: Record<string, string> = {
                "Total Leads": "total-leads",
                Opportunities: "opportunities",
                "Pipeline Value": "pipeline-value",
                "Active Tasks": "active-tasks",
              };
              return selectedComponents.includes(widgetIds[kpi.label]);
            }).map((kpi) => {
              const Icon = kpi.icon || getModuleIcon(kpi.label);
                const style = getProfileKpiStyle(kpi.label);
                return (
                <div key={kpi.label} className={`relative isolate flex min-h-[136px] items-center justify-between overflow-hidden rounded-xl border p-4 shadow-sm sm:p-5 ${style.card}`}>
                    <div aria-hidden="true" className={`pointer-events-none absolute -bottom-9 right-5 h-24 w-24 rounded-full ${style.glow}`} />
                    <div className="relative z-10">
                      <div className="text-[13px] font-medium text-slate-700">{kpi.label}</div>
                      <div className="mt-2 text-3xl font-bold leading-none tracking-tight text-slate-900">{kpi.value}</div>
                    </div>
                    <div className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-md ring-1 ring-white/40 ${style.icon}`}>
                        <Icon className="h-5 w-5" />
                    </div>
                </div>
              );
            })}
      </div>
      )}

      {!hasSavedHomepage && (selectedComponents.includes("recent-opportunities") || selectedComponents.includes("pipeline-summary")) && (
      <div className="grid gap-6 xl:grid-cols-3">
        {selectedComponents.includes("recent-opportunities") && (
        <div className={selectedComponents.includes("pipeline-summary") ? "xl:col-span-2" : "xl:col-span-3"}>
          <div className="rounded-xl border border-sky-100 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-tight">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                Recent Opportunities
              </h2>
              <Link href="/opportunities" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-3">
              {recentOpportunities.length === 0 ? (
                <div className="flex min-h-[120px] items-center justify-center text-lg text-muted-foreground">
                  No recent opportunities
                </div>
              ) : (
                recentOpportunities.map((opp: any) => (
                  <Link
                    key={opp.id}
                    href={`/opportunities/${opp.id}`}
                    className="flex items-center justify-between rounded-lg border border-sky-100 bg-gradient-to-r from-blue-50/80 to-white p-4 transition-colors hover:border-blue-200 hover:from-blue-50"
                  >
                    <div>
                      <div className="text-lg font-medium text-slate-800">{opp.name || "Untitled Opportunity"}</div>
                      <div className="text-sm uppercase tracking-wide text-muted-foreground">{opp.stage || "—"}</div>
                    </div>
                    <div className="text-right text-lg font-semibold text-slate-800">{formatAmount(opp.amount || 0)}</div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
        )}

        {selectedComponents.includes("pipeline-summary") && (
        <div className={selectedComponents.includes("recent-opportunities") ? "rounded-xl border border-sky-100 bg-white p-4 shadow-sm" : "xl:col-span-3 rounded-xl border border-sky-100 bg-white p-4 shadow-sm"}>
          <h2 className="mb-4 flex items-center gap-2 text-[16px] font-semibold tracking-tight">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Pipeline Summary
          </h2>
          <div className="space-y-4">
            {pipelineStages.length === 0 ? (
              <div className="flex min-h-[120px] items-center justify-center text-lg text-muted-foreground">
                No pipeline data
              </div>
            ) : (
              pipelineStages.map((stage) => (
                <div key={stage.stage} className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-700">
                    <span className="capitalize">{stage.stage.toLowerCase().replace(/_/g, " ")}</span>
                    <span>{stage.count} • {formatAmount(stage.amount)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-blue-100">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400"
                      style={{ width: `${Math.min(100, Math.max(8, stage.count * 20))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        )}
      </div>
      )}

      {!hasSavedHomepage && (selectedComponents.includes("upcoming-tasks") || selectedComponents.includes("recent-activity")) && (
      <div className="grid gap-6 xl:grid-cols-3">
        {selectedComponents.includes("upcoming-tasks") && (
        <div className={selectedComponents.includes("recent-activity") ? "xl:col-span-2 rounded-xl border border-sky-100 bg-white p-4 shadow-sm" : "xl:col-span-3 rounded-xl border border-sky-100 bg-white p-4 shadow-sm"}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold tracking-tight">Upcoming Tasks</h2>
            <Link href="/tasks" className="text-sm font-medium text-blue-600">View All</Link>
          </div>
          {upcomingTasks.length === 0 ? (
            <div className="flex min-h-[170px] items-center justify-center text-xl text-muted-foreground">No upcoming tasks</div>
          ) : (
            <div className="space-y-3">
              {upcomingTasks.map((task: any) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center justify-between rounded-lg border border-sky-100 bg-gradient-to-r from-blue-50/80 to-white p-4 transition-colors hover:border-blue-200 hover:from-blue-50"
                >
                  <div>
                    <div className="text-lg font-medium text-slate-800">{task.title || "Untitled Task"}</div>
                    <div className="text-sm uppercase tracking-wide text-muted-foreground">{task.status || "—"}</div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "No due date"}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        )}

        {selectedComponents.includes("recent-activity") && (
        <div className={selectedComponents.includes("upcoming-tasks") ? "rounded-xl border border-sky-100 bg-white p-4 shadow-sm" : "xl:col-span-3 rounded-xl border border-sky-100 bg-white p-4 shadow-sm"}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold tracking-tight">Recent Activity</h2>
          </div>
          {recentActivities.length === 0 ? (
            <div className="flex min-h-[170px] items-center justify-center text-xl text-muted-foreground">No recent activity</div>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((activity: any) => (
                <div key={activity.id} className="rounded-lg border border-sky-100 bg-gradient-to-r from-blue-50/80 to-white p-3">
                  <div className="text-sm font-medium text-slate-800">{activity.message || "Activity"}</div>
                  <div className="text-xs text-muted-foreground">
                    {activity.type || "Update"} • {activity.createdAt ? formatTimeAgo(activity.createdAt) : "Now"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
      )}
      </>}
    </div>
  );
}