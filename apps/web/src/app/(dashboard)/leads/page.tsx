"use client";

import * as React from "react";

import { useAuth } from "@/contexts/auth-context";

import { useRouter } from "next/navigation";

import { leadApi } from "@/lib/api";

import { Button } from "@/components/ui/button";

import { LeadList, Lead } from "@/components/crm/lead-list";

import { Plus, AlertCircle, Search, CalendarDays, Link2, Layers3, UsersRound } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  INCOMING: "Incoming",
  PROSPECT: "Prospect",
  SITE_VISIT_SCHEDULED: "Site Visit Scheduled",
  SITE_VISIT_HAPPENED: "Site Visit Happened",
  BOOKED: "Booked",
  LOST: "Lost",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS);

const SOURCE_OPTIONS = [
  { label: "Website", value: "WEBSITE" },
  { label: "Referral", value: "REFERRAL" },
  { label: "Cold Call", value: "COLD_CALL" },
  { label: "Advertisement", value: "ADVERTISEMENT" },
  { label: "Instagram", value: "INSTAGRAM" },
  { label: "WhatsApp", value: "WHATSAPP" },
  { label: "Walk-in", value: "WALK_IN" },
];

function getAllowedStatuses(_profileName: string | null | undefined): string[] {
  // Status filtering is server-side (record access + exact status match).
  // Every profile may filter by any status; results are always scoped to
  // the authenticated user's accessible leads by the API.
  return ALL_STATUSES;
}

function mapApiLeadToLead(apiLead: any): Lead {
  const statusLower = (apiLead.status || "NEW").toLowerCase();
  return {
    id: apiLead.id,
    leadNumber: apiLead.leadNumber || "",
    firstName: apiLead.firstName || "",
    lastName: apiLead.lastName || "",
    company: apiLead.company || "",
    email: apiLead.email || "",
    phone: apiLead.phone || "",
    source: apiLead.source || "",
    status: statusLower,
    rating: apiLead.rating || "",
    priority: "medium",
    assignedTo: apiLead.owner
      ? `${apiLead.owner.firstName} ${apiLead.owner.lastName}`
      : "",
    createdAt: apiLead.createdAt,
    updatedAt: apiLead.updatedAt,
  };
}

export default function LeadsPage() {
  const { profile, hasPermission } = useAuth();
  const router = useRouter();
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const allowedStatuses = React.useMemo(
    () => getAllowedStatuses(profile?.name),
    [profile?.name]
  );

  const canCreateLead = React.useMemo(() => hasPermission("Lead", "create"), [hasPermission]);
  const canDeleteLead = React.useMemo(() => hasPermission("Lead", "delete"), [hasPermission]);

  const fetchLeads = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        page: currentPage,
        limit: 20,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (sourceFilter) params.source = sourceFilter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const res = await leadApi.list(params);
      if (res.data.success && res.data.data) {
        const items = Array.isArray(res.data.data)
          ? res.data.data
          : res.data.data.leads || [];
        setLeads(items.map(mapApiLeadToLead));
        setTotalItems(res.data.pagination?.total || items.length);
      } else {
        setError(res.data.error || "Failed to load leads");
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load leads");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearch, statusFilter, sourceFilter, dateFrom, dateTo]);

  React.useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleDeleteLead = React.useCallback(async (lead: Lead) => {
    const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.leadNumber || "this lead";
    const confirmed = window.confirm(`Delete ${leadName}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      await leadApi.delete(lead.id);
      await fetchLeads();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete lead");
    }
  }, [fetchLeads]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const filterLabelClass = "mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#1479a8]";
  const filterControlClass = "h-9 w-full rounded-md border border-sky-200 bg-white px-3 text-[12px] text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1 py-1">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-gradient-to-br from-white to-sky-50 text-blue-600 shadow-sm">
            <UsersRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#075d91]">Leads</h1>
            <p className="text-[12px] text-[#1479a8]">
              Manage your leads and track their progress
            </p>
          </div>
        </div>
        {canCreateLead && (
          <Button className="h-9 bg-gradient-to-r from-blue-600 to-blue-500 px-3 text-[12px] text-white shadow-sm shadow-blue-200 hover:from-blue-700 hover:to-blue-600" onClick={() => router.push("/leads/new")}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create Lead
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-sky-100 bg-[#f5fbff] p-3 shadow-sm sm:grid-cols-2 md:grid-cols-5 md:items-end">
        <div className="min-w-0">
          <label className={filterLabelClass}><Search className="h-3.5 w-3.5" />Search</label>
          <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#278db8]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads..."
            className={`${filterControlClass} pl-8`}
          />
          </div>
        </div>
        <div className="min-w-0">
          <label className={filterLabelClass}><Layers3 className="h-3.5 w-3.5" />Status</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className={filterControlClass}
          >
            <option value="">All Statuses</option>
            {allowedStatuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] || s}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className={filterLabelClass}><Link2 className="h-3.5 w-3.5" />Source</label>
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setCurrentPage(1);
            }}
            className={filterControlClass}
          >
            <option value="">All Sources</option>
            {SOURCE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className={filterLabelClass}><CalendarDays className="h-3.5 w-3.5" />From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setCurrentPage(1);
            }}
            className={filterControlClass}
          />
        </div>
        <div className="min-w-0">
          <label className={filterLabelClass}><CalendarDays className="h-3.5 w-3.5" />To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setCurrentPage(1);
            }}
            className={filterControlClass}
          />
        </div>
      </div>

      <LeadList
        leads={leads}
        isLoading={isLoading}
        totalItems={totalItems}
        currentPage={currentPage}
        onPageChange={handlePageChange}
        canDelete={canDeleteLead}
        onDelete={handleDeleteLead}
      />
    </div>
  );
}
