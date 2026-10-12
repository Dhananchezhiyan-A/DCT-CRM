"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Download, ExternalLink, Receipt } from "lucide-react";
import { DataTable } from "@/components/crm/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { projectApi, receiptApi } from "@/lib/api";
import { formatDate } from "@/lib/date-format";

interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  customerNameSnapshot: string;
  projectNameSnapshot: string;
  unitNumberSnapshot: string;
  amount: number;
  status: "ISSUED" | "CANCELLED";
  booking: { id: string; number: string };
  quotation?: { id: string; number: string } | null;
  payment: { id: string; reference: string | null };
  issuedBy: { firstName: string; lastName: string };
}

interface ProjectOption {
  id: string;
  name: string;
}

const formatCurrency = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReceiptsPage() {
  const { toast } = useToast();
  const [receipts, setReceipts] = React.useState<ReceiptRecord[]>([]);
  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [quotationId, setQuotationId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    setQuotationId(new URLSearchParams(window.location.search).get("quotationId") || "");
  }, []);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  React.useEffect(() => {
    let cancelled = false;
    projectApi.list({ page: 1, limit: 100, isActive: true }).then((response) => {
      if (response.data?.success && Array.isArray(response.data.data) && !cancelled) {
        setProjects(response.data.data);
      }
    }).catch((loadError: any) => {
      if (!cancelled) {
        toast({
          title: "Project filter unavailable",
          description: loadError?.response?.data?.error || "Could not load projects.",
          variant: "destructive",
        });
      }
    });
    return () => { cancelled = true; };
  }, [toast]);

  React.useEffect(() => {
    let cancelled = false;
    const fetchReceipts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await receiptApi.list({
          page,
          limit: 20,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(projectId ? { projectId } : {}),
          ...(quotationId ? { quotationId } : {}),
          ...(status ? { status } : {}),
          ...(startDate ? { startDate: new Date(`${startDate}T00:00:00`).toISOString() } : {}),
          ...(endDate ? { endDate: new Date(`${endDate}T23:59:59.999`).toISOString() } : {}),
        });
        if (!response.data?.success || !Array.isArray(response.data.data)) {
          throw new Error(response.data?.error || "Failed to load receipts");
        }
        if (!cancelled) {
          setReceipts(response.data.data);
          setTotal(response.data.pagination?.total ?? response.data.data.length);
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setReceipts([]);
          setTotal(0);
          setError(loadError?.response?.data?.error || loadError?.message || "Failed to load receipts.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchReceipts();
    return () => { cancelled = true; };
  }, [page, debouncedSearch, projectId, quotationId, status, startDate, endDate, reloadKey]);

  const downloadReceipt = React.useCallback(async (receipt: ReceiptRecord) => {
    try {
      const response = await receiptApi.downloadPdf(receipt.id);
      downloadBlob(response.data, `${receipt.receiptNumber}.pdf`);
    } catch (downloadError: any) {
      toast({
        title: "Download failed",
        description: downloadError?.response?.data?.error || "Unable to download this receipt.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const columns = React.useMemo<ColumnDef<ReceiptRecord>[]>(() => [
    {
      accessorKey: "receiptNumber",
      header: "Receipt",
      cell: ({ row }) => (
        <Link className="font-medium text-primary hover:underline" href={`/receipts/${row.original.id}`}>
          {row.original.receiptNumber}
        </Link>
      ),
    },
    { accessorKey: "receiptDate", header: "Date", cell: ({ row }) => formatDate(row.original.receiptDate) },
    {
      id: "quotation",
      header: "Quotation",
      cell: ({ row }) => row.original.quotation
        ? <Link className="text-primary hover:underline" href={`/quotations/${row.original.quotation.id}`}>{row.original.quotation.number}</Link>
        : "—",
    },
    { accessorKey: "customerNameSnapshot", header: "Customer" },
    { accessorKey: "projectNameSnapshot", header: "Project" },
    { accessorKey: "unitNumberSnapshot", header: "Unit" },
    {
      accessorKey: "booking.number",
      header: "Booking",
      cell: ({ row }) => <Link className="hover:underline" href={`/bookings/${row.original.booking.id}`}>{row.original.booking.number}</Link>,
    },
    { accessorKey: "payment.reference", header: "Payment Ref", cell: ({ row }) => row.original.payment.reference || "—" },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => formatCurrency(row.original.amount) },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge variant={row.original.status === "ISSUED" ? "success" : "destructive"}>{row.original.status}</Badge>,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/receipts/${row.original.id}`} aria-label={`View ${row.original.receiptNumber}`}>
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void downloadReceipt(row.original)} aria-label={`Download ${row.original.receiptNumber}`}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [downloadReceipt]);

  const resetFilters = () => {
    setSearch("");
    setProjectId("");
    setQuotationId("");
    setStatus("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><Receipt className="h-5 w-5" />Receipt Register</h1>
          <p className="mt-1 text-sm text-muted-foreground">Final receipts issued for verified payments.</p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Search and filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Input className="lg:col-span-2" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Receipt, customer, booking or payment ref" aria-label="Search receipts" />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={projectId} onChange={(event) => { setProjectId(event.target.value); setPage(1); }} aria-label="Filter by project">
            <option value="">All projects</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="ISSUED">Issued</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <Input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} aria-label="Receipt date from" />
          <Input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} aria-label="Receipt date to" />
          <Button className="sm:col-span-2 lg:col-span-6 lg:justify-self-end" variant="outline" onClick={resetFilters}>Clear filters</Button>
        </CardContent>
      </Card>
      {error && <Card role="alert" className="border-destructive"><CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-destructive">{error}<Button variant="outline" onClick={() => setReloadKey((current) => current + 1)}>Retry</Button></CardContent></Card>}
      {!isLoading && !error && receipts.length === 0 && (
        <Card><CardContent className="space-y-2 py-10 text-center text-sm text-muted-foreground">
          <p>No receipts match these filters.</p>
          <p>Only verified payments with an issued official receipt appear here. Pending payments are listed under Payments &amp; Installments on the Opportunity.</p>
        </CardContent></Card>
      )}
      <DataTable
        columns={columns}
        data={receipts}
        isLoading={isLoading}
        pageSize={20}
        currentPage={page}
        totalItems={total}
        onPageChange={setPage}
        serverPagination
      />
    </div>
  );
}
