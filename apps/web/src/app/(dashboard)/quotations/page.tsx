"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/crm/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Download, MoreHorizontal, Eye, RotateCcw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { projectApi, quotationApi } from "@/lib/api";
import { Input } from "@/components/ui/input";

interface Quotation {
  id: string;
  quotationNumber: string;
  leadName: string;
  projectName: string;
  unitNumber: string;
  amount: number;
  receivedAmount: number;
  balanceAmount: number;
  status: "draft" | "submitted" | "approved" | "rejected" | "expired";
  validUntil: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-orange-100 text-orange-800",
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatDate = (value: string) => {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
};

async function downloadQuotationPdfFile(id: string, quotationNumber: string) {
  const response = await quotationApi.downloadPdf(id);
  const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${quotationNumber || "quotation"}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DownloadQuotationItem({ quotation }: { quotation: Quotation }) {
  const { toast } = useToast();

  return (
    <DropdownMenuItem onSelect={() => {
      void downloadQuotationPdfFile(quotation.id, quotation.quotationNumber).then(() => {
        toast({ title: "Quotation downloaded", description: `${quotation.quotationNumber} was saved to your downloads.` });
      }).catch(() => {
        toast({ title: "Error", description: "Failed to download quotation PDF", variant: "destructive" as any });
      });
    }}>
      <Download className="mr-2 h-4 w-4" />
      Download PDF
    </DropdownMenuItem>
  );
}

const columns: ColumnDef<Quotation>[] = [
  {
    accessorKey: "quotationNumber",
    header: "Quotation #",
    cell: ({ row }) => (
      <Link href={`/quotations/${row.original.id}`} className="hover:underline font-medium">
        {row.getValue("quotationNumber")}
      </Link>
    ),
  },
  {
    accessorKey: "leadName",
    header: "Lead",
  },
  {
    accessorKey: "projectName",
    header: "Project",
  },
  { accessorKey: "unitNumber", header: "Unit" },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <span className="font-medium">{formatCurrency(row.getValue("amount") as number)}</span>
    ),
  },
  {
    accessorKey: "receivedAmount",
    header: "Received",
    cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.receivedAmount)}</span>,
  },
  {
    accessorKey: "balanceAmount",
    header: "Balance",
    cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.balanceAmount)}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge className={statusColors[status]}>
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "validUntil",
    header: "Valid Until",
    cell: ({ row }) => formatDate(row.getValue("validUntil") as string),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const quotation = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/quotations/${quotation.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
            <DownloadQuotationItem quotation={quotation} />
            <DropdownMenuItem asChild>
              <Link href={`/receipts?quotationId=${encodeURIComponent(quotation.id)}`}>
                <RotateCcw className="mr-2 h-4 w-4" />
                View Receipts
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function QuotationsPage() {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [quotations, setQuotations] = React.useState<Quotation[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string }>>([]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    projectApi.list({ page: 1, limit: 100, isActive: true })
      .then((response) => setProjects(response.data.data || []))
      .catch(() => setProjects([]));
  }, []);

  React.useEffect(() => {
    const fetchQuotations = async () => {
      try {
        setIsLoading(true);
        const res = await quotationApi.list({
          page: currentPage,
          limit: 20,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(projectId ? { projectId } : {}),
          ...(status ? { status: status.toUpperCase() } : {}),
          ...(startDate ? { startDate: new Date(`${startDate}T00:00:00`).toISOString() } : {}),
          ...(endDate ? { endDate: new Date(`${endDate}T23:59:59.999`).toISOString() } : {}),
        });
        if (res.data.success && res.data.data) {
          const mapped = res.data.data.map((item: any) => ({
            id: item.id,
            quotationNumber: item.number || item.id.slice(-8).toUpperCase(),
            leadName: item.lead
              ? `${item.lead.firstName} ${item.lead.lastName}`.trim()
              : "—",
            projectName: item.project?.name || "—",
            unitNumber: item.unit?.number || item.items?.find((quotationItem: any) => quotationItem.unit)?.unit?.number || "—",
            amount: item.totalAmount || 0,
            receivedAmount: Number(item.receivedAmount || 0),
            balanceAmount: Number(item.balanceAmount ?? item.totalAmount ?? 0),
            status: (item.status || "draft").toLowerCase() as Quotation["status"],
            validUntil: item.validUntil || item.createdAt,
            createdAt: item.createdAt,
          }));
          setQuotations(mapped);
          setTotalItems(res.data.pagination?.total ?? mapped.length);
        } else {
          setQuotations([]);
          setTotalItems(0);
        }
      } catch {
        toast({ title: "Error", description: "Failed to load quotations", variant: "destructive" as any });
        setQuotations([]);
        setTotalItems(0);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuotations();
  }, [currentPage, debouncedSearch, projectId, status, startDate, endDate, toast]);

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
          <h1 className="text-xl font-semibold">Quotations</h1>
          <p className="text-muted-foreground">
            Create and manage sales quotations
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/opportunities">
          <Plus className="mr-2 h-4 w-4" />
            Generate from Opportunity
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Input className="lg:col-span-2" value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} placeholder="Search quotation, customer, phone, project, or unit" aria-label="Search quotations" />
        <select aria-label="Filter quotations by project" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={projectId} onChange={(event) => { setProjectId(event.target.value); setCurrentPage(1); }}>
          <option value="">All projects</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <select aria-label="Filter quotations by status" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setCurrentPage(1); }}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="expired">Expired</option>
        </select>
        <Input aria-label="Quotation start date" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setCurrentPage(1); }} />
        <Input aria-label="Quotation end date" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setCurrentPage(1); }} />
      </div>

      <DataTable
        columns={columns}
        data={quotations}
          totalItems={totalItems}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          serverPagination
        />
    </div>
  );
}
