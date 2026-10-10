"use client";

import * as React from "react";

import { useAuth } from "@/contexts/auth-context";

import { useRouter } from "next/navigation";

import { leadApi } from "@/lib/api";

import { Button } from "@/components/ui/button";

import { LeadList, Lead } from "@/components/crm/lead-list";

import { Plus, AlertCircle, RotateCcw } from "lucide-react";

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

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("");
    setSourceFilter("");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Leads</h1>
          <p className="text-muted-foreground">
            Manage your leads and track their progress
          </p>
        </div>
        {canCreateLead && (
          <Button onClick={() => router.push("/leads/new")}>
            <Plus className="mr-2 h-4 w-4" />
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <label className="text-sm font-medium">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads..."
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px]"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px]"
          >
            <option value="">All Statuses</option>
            {allowedStatuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] || s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Source</label>
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px]"
          >
            <option value="">All Sources</option>
            {SOURCE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setCurrentPage(1);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setCurrentPage(1);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      {(search || statusFilter || sourceFilter || dateFrom || dateTo) && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Clear filters
          </Button>
        </div>
      )}

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
