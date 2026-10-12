"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/crm/data-table";
import { Input } from "@/components/ui/input";
import { unitApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Unit {
  id: string;
  number: string;
  type: string | null;
  floor: number | null;
  area: number | null;
  price: number | null;
  status: string;
  project: { id: string; name: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
}

const formatCurrency = (amount: number | null) =>
  amount == null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(amount);

const statusColors: Record<string, string> = {
  AVAILABLE: "bg-green-100 text-green-800",
  HOLD: "bg-amber-100 text-amber-800",
  RESERVED: "bg-blue-100 text-blue-800",
  BOOKED: "bg-violet-100 text-violet-800",
  SOLD: "bg-slate-100 text-slate-800",
  BLOCKED: "bg-red-100 text-red-800",
};

const columns: ColumnDef<Unit>[] = [
  {
    accessorKey: "number",
    header: "Unit",
    cell: ({ row }) => (
      <Link href={`/units/${row.original.id}`} className="font-medium text-primary hover:underline">
        {row.original.number}
      </Link>
    ),
  },
  {
    id: "project",
    header: "Project",
    cell: ({ row }) => {
      const project = row.original.project;
      return project ? (
        <Link href={`/projects/${project.id}`} className="text-primary hover:underline">
          {project.name}
        </Link>
      ) : "—";
    },
  },
  { accessorKey: "type", header: "Type", cell: ({ row }) => row.original.type || "—" },
  { accessorKey: "floor", header: "Floor", cell: ({ row }) => row.original.floor ?? "—" },
  {
    accessorKey: "area",
    header: "Area",
    cell: ({ row }) => row.original.area == null ? "—" : `${row.original.area} sq ft`,
  },
  {
    accessorKey: "price",
    header: "Price",
    cell: ({ row }) => formatCurrency(row.original.price),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge className={statusColors[row.original.status] || "bg-gray-100 text-gray-800"}>
        {row.original.status.replace(/_/g, " ")}
      </Badge>
    ),
  },
];

export default function UnitsPage() {
  const { toast } = useToast();
  const [units, setUnits] = React.useState<Unit[]>([]);
  const [pagination, setPagination] = React.useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const loadUnits = React.useCallback(async (page: number, query: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await unitApi.list({ page, limit: pagination.limit, search: query || undefined });
      setUnits(response.data.data || []);
      setPagination(response.data.pagination || { page, limit: pagination.limit, total: 0 });
    } catch (requestError: any) {
      const message = requestError?.response?.data?.error || "Unable to load units.";
      setError(message);
      toast({ title: "Unable to load units", description: message, variant: "destructive" as any });
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, toast]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      void loadUnits(1, search.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [loadUnits, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Units</h1>
        <p className="text-muted-foreground">Browse inventory across your projects.</p>
      </div>
      <Card>
        <CardContent className="space-y-4 p-4">
          <Input
            aria-label="Search units"
            placeholder="Search unit number or type..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-sm"
          />
          {error ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => void loadUnits(pagination.page, search.trim())}>
                Retry
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={units}
              isLoading={loading}
              pageSize={pagination.limit}
              currentPage={pagination.page}
              totalItems={pagination.total}
              serverPagination
              onPageChange={(page) => void loadUnits(page, search.trim())}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
