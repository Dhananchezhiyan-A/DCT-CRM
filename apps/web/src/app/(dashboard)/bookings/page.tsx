"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/crm/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, MoreHorizontal, Eye, Edit, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { bookingApi } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";

interface Booking {
  id: string;
  bookingNumber: string;
  leadName: string;
  projectName: string;
  unitNumber: string;
  amount: number;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  bookingDate: string;
  paymentStatus: "pending" | "partial" | "complete";
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  completed: "bg-blue-100 text-blue-800",
};

const paymentStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  partial: "bg-orange-100 text-orange-800",
  complete: "bg-green-100 text-green-800",
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

const columns: ColumnDef<Booking>[] = [
  {
    accessorKey: "bookingNumber",
    header: "Booking #",
    cell: ({ row }) => (
      <Link href={`/bookings/${row.original.id}`} className="hover:underline font-medium">
        {row.getValue("bookingNumber")}
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
  {
    accessorKey: "unitNumber",
    header: "Unit",
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <span className="font-medium">{formatCurrency(row.getValue("amount") as number)}</span>
    ),
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
    accessorKey: "paymentStatus",
    header: "Payment",
    cell: ({ row }) => {
      const status = row.getValue("paymentStatus") as string;
      return (
        <Badge className={paymentStatusColors[status]}>
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "bookingDate",
    header: "Booking Date",
    cell: ({ row }) => formatDate(row.getValue("bookingDate") as string),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const booking = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/bookings/${booking.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Cancel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function BookingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { hasEffectivePermission } = useAuth();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchBookings = async () => {
      try {
        setIsLoading(true);
        const res = await bookingApi.list({ page: currentPage, limit: 20 });
        if (res.data.success && res.data.data) {
          const mapped = res.data.data.map((item: any) => ({
            id: item.id,
            bookingNumber: item.number || item.id.slice(-8).toUpperCase(),
            leadName: item.lead
              ? `${item.lead.firstName} ${item.lead.lastName}`.trim()
              : "—",
            projectName: item.project?.name || "—",
            unitNumber: item.unit?.number || "—",
            amount: item.totalAmount || 0,
            status: (item.status || "pending").toLowerCase() as Booking["status"],
            bookingDate: item.bookingDate || item.createdAt,
            paymentStatus: (item.payments?.length
              ? item.payments.every((p: any) => p.status === "COMPLETED")
                ? "complete"
                : item.payments.some((p: any) => p.status === "VERIFIED" || p.status === "COMPLETED")
                  ? "partial"
                  : "pending"
              : "pending") as Booking["paymentStatus"],
          }));
          setBookings(mapped);
          setTotalItems(res.data.pagination?.total ?? mapped.length);
        } else {
          setBookings([]);
          setTotalItems(0);
        }
      } catch {
        toast({ title: "Error", description: "Failed to load bookings", variant: "destructive" as any });
        setBookings([]);
        setTotalItems(0);
      } finally {
        setIsLoading(false);
      }
    };
    fetchBookings();
  }, [currentPage, toast]);

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
          <h1 className="text-xl font-semibold">Bookings</h1>
          <p className="text-muted-foreground">
            Manage project unit bookings and reservations
          </p>
        </div>
        <Button onClick={() => router.push("/bookings/new")} disabled={!hasEffectivePermission("BOOKING_CREATE")}>
          <Plus className="mr-2 h-4 w-4" />
          New Booking
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={bookings}
        searchKey="bookingNumber"
        searchPlaceholder="Search by booking number..."
          totalItems={totalItems}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          serverPagination
        />
    </div>
  );
}