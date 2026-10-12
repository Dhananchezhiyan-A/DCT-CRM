"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/crm/data-table";
import { FilterBar, FilterField } from "@/components/crm/filters";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, MoreHorizontal, Eye, Edit, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { siteVisitApi } from "@/lib/api";
import { formatDateTime } from "@/lib/date-format";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface SiteVisit {
  id: string;
  siteVisitNumber?: string;
  leadId: string;
  leadName: string;
  projectName: string;
  visitDate: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "MISSED";
  assignedTo: string;
  leadNumber?: string;
  createdAt: string;
  createdBy: string;
  feedback?: string;
  cancellationReason?: string;
}

// Business timezone: Asia/Kolkata (UTC+05:30)
const istDayKey = (value: string | Date): string => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const ist = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

const timingBadge = (
  visit: SiteVisit
): { label: string; className: string } | null => {
  if (visit.status === "COMPLETED") return null;
  if (visit.status === "MISSED") {
    return { label: "Missed", className: "bg-red-100 text-red-800" };
  }
  if (visit.status === "CANCELLED") {
    return visit.cancellationReason?.startsWith("Automatically cancelled")
      ? { label: "Overdue (Auto-cancelled)", className: "bg-amber-100 text-amber-800" }
      : null;
  }
  const visitDay = istDayKey(visit.visitDate);
  const today = istDayKey(new Date());
  if (!visitDay) return null;
  if (visitDay < today)
    return { label: "Overdue", className: "bg-amber-100 text-amber-800" };
  if (visitDay === today)
    return { label: "Today", className: "bg-blue-100 text-blue-800" };
  return { label: "Upcoming", className: "bg-slate-100 text-slate-700" };
};

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
  MISSED: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  MISSED: "Missed",
};

const columns: ColumnDef<SiteVisit>[] = [
  {
    accessorKey: "siteVisitNumber",
    header: "SV Number",
    cell: ({ row }) => (
      <Link
        href={`/site-visits/${row.original.id}`}
        className="font-mono text-sm text-primary hover:underline"
      >
        {row.getValue("siteVisitNumber") || "—"}
      </Link>
    ),
  },
  {
    accessorKey: "leadNumber",
    header: "Lead Number",
    cell: ({ row }) => (
      <Link
        href={`/leads/${row.original.leadId}`}
        className="font-mono text-sm text-primary hover:underline"
      >
        {row.getValue("leadNumber") || "—"}
      </Link>
    ),
  },
  {
    accessorKey: "leadName",
    header: "Lead",
    cell: ({ row }) => (
      <Link href={`/leads/${row.original.leadId}`} className="hover:underline font-medium">
        {row.getValue("leadName")}
      </Link>
    ),
  },
  {
    accessorKey: "projectName",
    header: "Project",
  },
  {
    accessorKey: "visitDate",
    header: "Visit Date",
    cell: ({ row }) => {
      const date = new Date(row.getValue("visitDate"));
      return formatDateTime(date);
    },
  },
  {
    id: "timing",
    header: "Timing",
    cell: ({ row }) => {
      const timing = timingBadge(row.original);
      if (!timing) return <span className="text-muted-foreground">—</span>;
      return <Badge className={timing.className}>{timing.label}</Badge>;
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge className={statusColors[status] || "bg-gray-100 text-gray-800"}>
          {statusLabels[status] || status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "assignedTo",
    header: "Assigned To",
  },
  {
    accessorKey: "createdAt",
    header: "Created At",
    cell: ({ row }) => formatDateTime(row.getValue("createdAt")),
  },
  {
    accessorKey: "createdBy",
    header: "Created By",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const visit = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/site-visits/${visit.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/leads/${visit.leadId}`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Lead
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function SiteVisitsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [filters, setFilters] = React.useState({ status: "" });
  const [search, setSearch] = React.useState("");
  const [siteVisits, setSiteVisits] = React.useState<SiteVisit[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchSiteVisits = async () => {
      try {
        setIsLoading(true);
        const params: Record<string, any> = { page: currentPage, limit: 20 };
        if (filters.status) params.status = filters.status;
        if (search.trim()) params.search = search.trim();
        const res = await siteVisitApi.list(params);
        if (res.data.success && res.data.data) {
          const mapped = res.data.data.map((item: any) => ({
            id: item.id,
            siteVisitNumber: item.siteVisitNumber || undefined,
            leadId: item.lead?.id || item.leadId || "",
            leadNumber: item.lead?.leadNumber || "—",
            leadName: item.lead
              ? `${item.lead.firstName} ${item.lead.lastName}`.trim()
              : "—",
            projectName: item.project?.name || "—",
            visitDate: item.scheduledAt || item.visitDate || item.createdAt,
            status: (item.status || "SCHEDULED") as SiteVisit["status"],
            assignedTo: item.assignee
              ? `${item.assignee.firstName} ${item.assignee.lastName}`.trim()
              : "—",
            createdAt: item.createdAt,
            createdBy: item.creator
              ? `${item.creator.firstName} ${item.creator.lastName}`.trim()
              : "—",
            feedback: item.feedback || undefined,
            cancellationReason: item.cancellationReason || undefined,
          }));
          setSiteVisits(mapped);
          setTotalItems(res.data.pagination?.total ?? mapped.length);
        } else {
          setSiteVisits([]);
          setTotalItems(0);
        }
      } catch {
        toast({ title: "Error", description: "Failed to load site visits", variant: "destructive" as any });
        setSiteVisits([]);
        setTotalItems(0);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSiteVisits();
  }, [currentPage, filters.status, search, toast]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Site Visits</h1>
          <p className="text-muted-foreground">
            Schedule and track project site visits
          </p>
        </div>
        <Button onClick={() => toast({ title: "Schedule Visit", description: "Schedule from Lead detail or Prospect status" })}>
          <Plus className="mr-2 h-4 w-4" />
          Schedule Visit
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search visits, leads, or companies..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
          </div>
          <FilterBar
            className="flex-none"
            onReset={() => {
              setFilters({ status: "" });
              setSearch("");
              setCurrentPage(1);
            }}
          >
            <FilterField
              label="Status"
              type="select"
              value={filters.status}
              onChange={(value) => {
                setFilters({ status: value as string });
                setCurrentPage(1);
              }}
              options={[
                { label: "Scheduled", value: "SCHEDULED" },
                { label: "Completed", value: "COMPLETED" },
                { label: "Cancelled", value: "CANCELLED" },
                { label: "Missed", value: "MISSED" },
              ]}
              placeholder="All Statuses"
            />
          </FilterBar>
        </div>

        <DataTable
          columns={columns}
          data={siteVisits}
            isLoading={isLoading}
            totalItems={totalItems}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            serverPagination
          />
      </div>
    </div>
  );
}
