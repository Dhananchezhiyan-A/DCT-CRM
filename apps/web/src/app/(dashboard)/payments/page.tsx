"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/crm/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Download, MoreHorizontal, Eye, Receipt } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { paymentApi, bookingApi, leadApi, projectApi, quotationApi, unitApi } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Payment {
  id: string;
  paymentNumber: string;
  leadName: string;
  bookingNumber: string;
  bookingId?: string;
  amount: number;
  method: string;
  status: "pending" | "verified" | "partial" | "completed" | "rejected" | "failed" | "refunded";
  paymentDate: string;
  reference?: string;
  quotationId?: string;
  quotationNumber?: string;
  receiptNumber?: string;
  projectName?: string;
  unitNumber?: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-purple-100 text-purple-800",
  verified: "bg-green-100 text-green-800",
  partial: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
};

const methodColors: Record<string, string> = {
  cash: "bg-green-100 text-green-800",
  cheque: "bg-blue-100 text-blue-800",
  online: "bg-purple-100 text-purple-800",
  emi: "bg-orange-100 text-orange-800",
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

const columns: ColumnDef<Payment>[] = [
  {
    accessorKey: "paymentNumber",
    header: "Payment #",
    cell: ({ row }) => (
      <Link href={`/payments/${row.original.id}`} className="hover:underline font-medium">
        {row.getValue("paymentNumber")}
      </Link>
    ),
  },
  {
    accessorKey: "leadName",
    header: "Lead",
  },
  {
    accessorKey: "bookingNumber",
    header: "Booking",
    cell: ({ row }) =>
      row.original.bookingId ? (
        <Link href={`/bookings/${row.original.bookingId}`} className="hover:underline">
          {row.getValue("bookingNumber")}
        </Link>
      ) : (
        <span>{row.getValue("bookingNumber")}</span>
      ),
  },
  {
    accessorKey: "quotationNumber",
    header: "Quotation",
    cell: ({ row }) => row.original.quotationId
      ? <Link href={`/quotations/${row.original.quotationId}`} className="text-primary hover:underline">{row.original.quotationNumber || "View"}</Link>
      : row.original.quotationNumber || "—",
  },
  { accessorKey: "projectName", header: "Project" },
  { accessorKey: "unitNumber", header: "Unit" },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <span className="font-medium">{formatCurrency(row.getValue("amount") as number)}</span>
    ),
  },
  {
    accessorKey: "method",
    header: "Method",
    cell: ({ row }) => {
      const method = row.getValue("method") as string;
      return (
        <Badge className={methodColors[method] || "bg-gray-100 text-gray-800"}>
          {method}
        </Badge>
      );
    },
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
    accessorKey: "paymentDate",
    header: "Date",
    cell: ({ row }) => formatDate(row.getValue("paymentDate") as string),
  },
  {
    accessorKey: "reference",
    header: "Reference",
    cell: ({ row }) => row.getValue("reference") || "-",
  },
  {
    accessorKey: "receiptNumber",
    header: "Receipt",
    cell: ({ row }) => row.original.receiptNumber
      ? <Link href={`/receipts?search=${encodeURIComponent(row.original.receiptNumber)}`} className="text-primary hover:underline">{row.original.receiptNumber}</Link>
      : "—",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const payment = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/payments/${payment.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Receipt className="mr-2 h-4 w-4" />
              Receipt
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function PaymentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { hasEffectivePermission } = useAuth();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const [summary, setSummary] = React.useState({ successfulAmount: 0, pendingAmount: 0, rejectedAmount: 0, reversedAmount: 0, reversedCount: 0 });
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [leadFilter, setLeadFilter] = React.useState("");
  const [unitFilter, setUnitFilter] = React.useState("");
  const [quotationFilter, setQuotationFilter] = React.useState("");
  const [modeFilter, setModeFilter] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string }>>([]);
  const [leads, setLeads] = React.useState<Array<{ id: string; firstName?: string | null; lastName?: string | null }>>([]);
  const [units, setUnits] = React.useState<Array<{ id: string; number: string; project?: { name: string } | null }>>([]);
  const [quotations, setQuotations] = React.useState<Array<{ id: string; number: string }>>([]);
  const [recordPaymentOpen, setRecordPaymentOpen] = React.useState(false);
  const [isSavingPayment, setIsSavingPayment] = React.useState(false);
  const [isLoadingBookings, setIsLoadingBookings] = React.useState(false);
  const [availableBookings, setAvailableBookings] = React.useState<any[]>([]);
  const [paymentBookingId, setPaymentBookingId] = React.useState("");
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState("");
  const [paymentReference, setPaymentReference] = React.useState("");
  const [paymentNotes, setPaymentNotes] = React.useState("");

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    Promise.all([
      projectApi.list({ page: 1, limit: 100, isActive: true }),
      leadApi.list({ page: 1, limit: 100 }),
      unitApi.list({ page: 1, limit: 200 }),
      quotationApi.list({ page: 1, limit: 100 }),
    ]).then(([projectResponse, leadResponse, unitResponse, quotationResponse]) => {
      setProjects(projectResponse.data.data || []);
      setLeads(leadResponse.data.data || []);
      setUnits(unitResponse.data.data || []);
      setQuotations(quotationResponse.data.data || []);
    }).catch((error: any) => toast({
      title: "Some payment filters are unavailable",
      description: error?.response?.data?.error || "Could not load all filter options.",
      variant: "destructive" as any,
    }));
  }, [toast]);

  const openRecordPayment = async () => {
    setIsLoadingBookings(true);
    try {
      const response = await bookingApi.list({ page: 1, limit: 100 });
      const bookings = (response.data.data || []).filter(
        (booking: any) => !["CANCELLED", "COMPLETED"].includes(booking.status),
      );
      setAvailableBookings(bookings);
      setPaymentBookingId("");
      setRecordPaymentOpen(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.response?.data?.error || "Failed to load accessible bookings",
        variant: "destructive" as any,
      });
    } finally {
      setIsLoadingBookings(false);
    }
  };

  const handleRecordPayment = async () => {
    const amount = Number(paymentAmount);
    if (!paymentBookingId || !Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Validation", description: "Select a booking and enter a valid amount", variant: "destructive" as any });
      return;
    }

    setIsSavingPayment(true);
    try {
      const response = await paymentApi.create({
        bookingId: paymentBookingId,
        amount,
        paymentDate: paymentDate ? new Date(`${paymentDate}T00:00:00`).toISOString() : undefined,
        reference: paymentReference.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
      });
      const created = response.data.data;
      const booking = availableBookings.find((item) => item.id === paymentBookingId);
      const payment: Payment = {
        id: created.id,
        paymentNumber: created.reference || created.id.slice(-8).toUpperCase(),
        leadName: booking?.lead
          ? `${booking.lead.firstName} ${booking.lead.lastName}`.trim()
          : "—",
        bookingNumber: booking?.number || "—",
        bookingId: booking?.id,
        amount: created.amount,
        method: "online",
        status: (created.status || "PENDING").toLowerCase() as Payment["status"],
        paymentDate: created.paymentDate || created.createdAt,
        reference: created.reference,
      };
      setPayments((items) => [payment, ...items].slice(0, 20));
      setTotalItems((total) => total + 1);
      setRecordPaymentOpen(false);
      setPaymentAmount("");
      setPaymentDate("");
      setPaymentReference("");
      setPaymentNotes("");
      toast({ title: "Success", description: "Payment recorded successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.response?.data?.error || "Failed to record payment",
        variant: "destructive" as any,
      });
    } finally {
      setIsSavingPayment(false);
    }
  };

  React.useEffect(() => {
    const fetchPayments = async () => {
      try {
        setIsLoading(true);
        const res = await paymentApi.list({
          page: currentPage,
          limit: 20,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(statusFilter ? { status: statusFilter.toUpperCase() } : {}),
          ...(projectFilter ? { projectId: projectFilter } : {}),
          ...(leadFilter ? { leadId: leadFilter } : {}),
          ...(unitFilter ? { unitId: unitFilter } : {}),
          ...(quotationFilter ? { quotationId: quotationFilter } : {}),
          ...(modeFilter ? { paymentMode: modeFilter } : {}),
          ...(startDate ? { startDate: new Date(`${startDate}T00:00:00`).toISOString() } : {}),
          ...(endDate ? { endDate: new Date(`${endDate}T23:59:59.999`).toISOString() } : {}),
        });
        if (res.data.success && res.data.data) {
          const mapped = res.data.data.map((item: any) => ({
            id: item.id,
            paymentNumber: item.reference || item.id.slice(-8).toUpperCase(),
            leadName: item.booking?.lead
              ? `${item.booking.lead.firstName} ${item.booking.lead.lastName}`.trim()
              : "—",
            bookingNumber: item.booking?.number || "—",
            bookingId: item.booking?.id,
            amount: item.amount || 0,
            method: String(item.notes?.match(/^Payment mode:\s*(.+)$/im)?.[1] || item.method || "—").toLowerCase(),
            status: String(item.status || "pending").toLowerCase() as Payment["status"],
            paymentDate: item.paymentDate || item.createdAt,
            reference: item.reference,
            quotationId: item.booking?.quotation?.id,
            quotationNumber: item.booking?.quotation?.number,
            receiptNumber: item.receipt?.receiptNumber,
            projectName: item.booking?.project?.name || "—",
            unitNumber: item.booking?.unit?.number || "—",
          }));
          setPayments(mapped);
          setTotalItems(res.data.pagination?.total ?? mapped.length);
          setSummary({
            successfulAmount: Number(res.data.summary?.successfulAmount || 0),
            pendingAmount: Number(res.data.summary?.pendingAmount || 0),
            rejectedAmount: Number(res.data.summary?.rejectedAmount || 0),
            reversedAmount: Number(res.data.summary?.reversedAmount || 0),
            reversedCount: Number(res.data.summary?.reversedCount || 0),
          });
        } else {
          setPayments([]);
          setTotalItems(0);
        }
      } catch {
        toast({ title: "Error", description: "Failed to load payments", variant: "destructive" as any });
        setPayments([]);
        setTotalItems(0);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPayments();
  }, [currentPage, debouncedSearch, statusFilter, projectFilter, leadFilter, unitFilter, quotationFilter, modeFilter, startDate, endDate, toast]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
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
          <h1 className="text-xl font-semibold">Payment History</h1>
          <p className="text-muted-foreground">
            Search payment transactions and follow them back to their quotations and receipts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => toast({ title: "Export", description: "Export feature coming soon" })}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          {hasEffectivePermission("PAYMENT_CREATE") && (
            <Button onClick={openRecordPayment} disabled={isLoadingBookings}>
              <Plus className="mr-2 h-4 w-4" />
              {isLoadingBookings ? "Loading bookings..." : "Record Payment"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Input className="lg:col-span-2" value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} placeholder="Search customer, project, unit, booking, quotation, receipt, or reference" aria-label="Search payment history" />
        <select aria-label="Filter payments by project" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={projectFilter} onChange={(event) => { setProjectFilter(event.target.value); setCurrentPage(1); }}>
          <option value="">All projects</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <select aria-label="Filter payments by customer" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={leadFilter} onChange={(event) => { setLeadFilter(event.target.value); setCurrentPage(1); }}>
          <option value="">All customers</option>
          {leads.map((lead) => <option key={lead.id} value={lead.id}>{`${lead.firstName || ""} ${lead.lastName || ""}`.trim()}</option>)}
        </select>
        <select aria-label="Filter payments by unit" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={unitFilter} onChange={(event) => { setUnitFilter(event.target.value); setCurrentPage(1); }}>
          <option value="">All units</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.number}{unit.project?.name ? ` · ${unit.project.name}` : ""}</option>)}
        </select>
        <select aria-label="Filter payments by quotation" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={quotationFilter} onChange={(event) => { setQuotationFilter(event.target.value); setCurrentPage(1); }}>
          <option value="">All quotations</option>
          {quotations.map((quotation) => <option key={quotation.id} value={quotation.id}>{quotation.number}</option>)}
        </select>
        <select aria-label="Filter payments by status" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setCurrentPage(1); }}>
          <option value="">All payment statuses</option>
          <option value="pending">Pending</option><option value="verified">Verified</option><option value="completed">Completed</option><option value="partial">Partial</option><option value="rejected">Rejected</option>
        </select>
        <select aria-label="Filter payments by payment mode" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={modeFilter} onChange={(event) => { setModeFilter(event.target.value); setCurrentPage(1); }}>
          <option value="">All payment modes</option>
          {["Cash", "Bank Transfer", "UPI", "Cheque", "Card", "Online"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
        </select>
        <div className="flex gap-2 lg:col-span-5">
          <Input aria-label="Payment start date" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setCurrentPage(1); }} />
          <Input aria-label="Payment end date" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setCurrentPage(1); }} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Verified received", summary.successfulAmount],
          ["Pending verification", summary.pendingAmount],
          ["Rejected payments", summary.rejectedAmount],
          ["Reversed receipts", summary.reversedAmount],
        ].map(([label, amount]) => (
          <Card key={String(label)}><CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold">{formatCurrency(Number(amount))}</p>
            {label === "Reversed receipts" && <p className="text-xs text-muted-foreground">{summary.reversedCount} cancelled receipt(s)</p>}
          </CardContent></Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={payments}
          totalItems={totalItems}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          serverPagination
        />

        <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>Select an accessible active booking and enter its payment details.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="payment-booking">Booking *</Label>
                <Select value={paymentBookingId} onValueChange={setPaymentBookingId}>
                  <SelectTrigger id="payment-booking" disabled={availableBookings.length === 0}>
                    <SelectValue placeholder="Select a booking" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBookings.map((booking) => (
                      <SelectItem key={booking.id} value={booking.id}>
                        {booking.number} · {booking.project?.name || "Project"} · Unit {booking.unit?.number || "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableBookings.length === 0 && (
                  <p className="text-sm text-muted-foreground">No accessible active bookings are available.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-amount">Amount *</Label>
                <Input id="payment-amount" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-date">Payment Date</Label>
                <Input id="payment-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-reference">Reference</Label>
                <Input id="payment-reference" maxLength={200} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-notes">Notes</Label>
                <Textarea id="payment-notes" maxLength={2000} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRecordPaymentOpen(false)} disabled={isSavingPayment}>Cancel</Button>
              <Button onClick={handleRecordPayment} disabled={isSavingPayment || !availableBookings.length}>
                {isSavingPayment ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}
