"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/auth-context";

import { companyApi } from "@/lib/api";

import { Button } from "@/components/ui/button";

import { Card, CardContent } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { useToast } from "@/hooks/use-toast";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  Plus,
  Eye,
  Edit,
  Trash2,
  Power,
  PowerOff,
  Building2,
  Search,
  AlertCircle,
  Loader2,
  ImageOff,
} from "lucide-react";

interface Company {
  id: string;
  name: string;
  companyCode: string;
  slug: string;
  email?: string;
  phone?: string;
  logo?: string;
  isActive: boolean;
  lifecycleStatus?: string;
  companyStartDate?: string | null;
  companyExpiryDate?: string | null;
  createdAt: string;
  _count: { users: number };
}

export default function CompaniesPage() {
  const { isSuperAdmin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [sortBy, setSortBy] = React.useState("createdAt");
  const [sortOrder, setSortOrder] = React.useState("desc");
  const [deleteTarget, setDeleteTarget] = React.useState<Company | null>(null);
  const [statusTarget, setStatusTarget] = React.useState<Company | null>(null);

  const fetchCompanies = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        page: currentPage,
        limit: 20,
        sortBy,
        sortOrder,
      };
      if (search) params.search = search;
      if (statusFilter) params.isActive = statusFilter;

      const res = await companyApi.list(params);
      if (res.data.success) {
        setCompanies(res.data.data || []);
        setTotalItems(res.data.pagination?.total || 0);
        setTotalPages(res.data.pagination?.totalPages || 1);
      } else {
        setError(res.data.error || "Failed to load companies");
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load companies");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, search, statusFilter, sortBy, sortOrder]);

  React.useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await companyApi.delete(deleteTarget.id);
      if (res.data.success) {
        toast({ title: "Company deleted", description: `${deleteTarget.name} has been deleted.` });
        setDeleteTarget(null);
        fetchCompanies();
      } else {
        toast({ title: "Delete failed", description: res.data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.response?.data?.error || "Failed to delete company", variant: "destructive" });
    }
  };

  const handleStatusToggle = async () => {
    if (!statusTarget) return;
    try {
      const res = statusTarget.isActive
        ? await companyApi.deactivate(statusTarget.id)
        : await companyApi.activate(statusTarget.id);
      if (res.data.success) {
        toast({
          title: statusTarget.isActive ? "Company deactivated" : "Company activated",
          description: `${statusTarget.name} has been ${statusTarget.isActive ? "deactivated" : "activated"}.`,
        });
        setStatusTarget(null);
        fetchCompanies();
      } else {
        toast({ title: "Status change failed", description: res.data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Status change failed", description: err?.response?.data?.error || "Failed", variant: "destructive" });
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground mt-2">Super Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Companies</h1>
          <p className="text-muted-foreground">Manage platform companies and tenants</p>
        </div>
        <Button onClick={() => router.push("/admin/companies/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Create Company
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Search companies..."
              className="h-9 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm"
            />
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive / Expired</option>
        </select>
        <select
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [field, order] = e.target.value.split("-");
            setSortBy(field);
            setSortOrder(order);
            setCurrentPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="createdAt-desc">Newest First</option>
          <option value="createdAt-asc">Oldest First</option>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
          <option value="companyCode-asc">Code A-Z</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : companies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No companies found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || statusFilter ? "Try adjusting your filters" : "Create your first company to get started"}
            </p>
            {!search && !statusFilter && (
              <Button className="mt-4" onClick={() => router.push("/admin/companies/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Create Company
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Logo</th>
                <th className="px-4 py-3 text-left font-medium">Company</th>
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Users</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3">
                    {company.logo ? (
                      <img
                        src={`/api/proxy/api/super-admin/logos/${company.logo}`}
                        alt={company.name}
                        className="h-8 w-8 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                        <ImageOff className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/companies/${company.id}`)}
                      className="font-medium text-left underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"
                    >
                      {company.name}
                    </button>
                    {company.email && (
                      <p className="text-xs text-muted-foreground">{company.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{company.companyCode}</code>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={
                      company.lifecycleStatus === "active" ? "bg-green-100 text-green-800" :
                      company.lifecycleStatus === "pending" ? "bg-blue-100 text-blue-800" :
                      company.lifecycleStatus === "expired" ? "bg-red-100 text-red-800" :
                      "bg-gray-100 text-gray-800"
                    }>
                      {company.lifecycleStatus === "active" ? "Active" :
                       company.lifecycleStatus === "pending" ? "Pending" :
                       company.lifecycleStatus === "expired" ? "Expired" :
                       company.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{company._count?.users || 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(company.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/admin/companies/${company.id}`)}
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/admin/companies/${company.id}/edit`)}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setStatusTarget(company)}
                        title={company.isActive ? "Deactivate" : "Activate"}
                      >
                        {company.isActive ? (
                          <PowerOff className="h-4 w-4 text-amber-600" />
                        ) : (
                          <Power className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(company)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * 20 + 1}-{Math.min(currentPage * 20, totalItems)} of {totalItems}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Company</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!statusTarget} onOpenChange={() => setStatusTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.isActive ? "Deactivate" : "Activate"} Company
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {statusTarget?.isActive ? "deactivate" : "activate"}{" "}
              <strong>{statusTarget?.name}</strong>?
              {statusTarget?.isActive
                ? " Company users will be blocked from logging in."
                : " Company users will be able to log in again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStatusToggle}>
              {statusTarget?.isActive ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
