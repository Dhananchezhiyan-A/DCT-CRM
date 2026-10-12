"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { bookingApi, projectApi, quotationApi, unitApi } from "@/lib/api";

type Project = { id: string; name: string };
type Unit = { id: string; number: string; type?: string | null; area?: number | null; price?: number | null; status?: string };

export default function NewBookingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { hasEffectivePermission } = useAuth();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [units, setUnits] = React.useState<Unit[]>([]);
  const [projectId, setProjectId] = React.useState("");
  const [unitId, setUnitId] = React.useState("");
  const [totalAmount, setTotalAmount] = React.useState("");
  const [leadId, setLeadId] = React.useState("");
  const [opportunityId, setOpportunityId] = React.useState("");
  const [quotationId, setQuotationId] = React.useState("");
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(true);
  const [isLoadingUnits, setIsLoadingUnits] = React.useState(false);
  const [isLoadingQuotation, setIsLoadingQuotation] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setProjectId(params.get("projectId") || "");
    setUnitId(params.get("unitId") || "");
    setTotalAmount(params.get("totalAmount") || "");
    setLeadId(params.get("leadId") || "");
    setOpportunityId(params.get("opportunityId") || "");
    setQuotationId(params.get("quotationId") || "");
  }, []);

  React.useEffect(() => {
    if (!quotationId) return;
    let cancelled = false;
    setIsLoadingQuotation(true);
    quotationApi.get(quotationId).then((response) => {
      const quotation = response.data?.data;
      if (!response.data?.success || !quotation) {
        throw new Error(response.data?.error || "Could not load the linked quotation");
      }
      const quotationUnitId = quotation.items?.[0]?.unit?.id;
      if (!cancelled) {
        setProjectId(quotation.projectId || "");
        setUnitId(quotationUnitId || "");
        setTotalAmount(String(quotation.totalAmount || ""));
      }
    }).catch((error: any) => {
      if (!cancelled) {
        toast({
          title: "Quotation could not be loaded",
          description: error?.response?.data?.error || error?.message || "Reload the opportunity and try again.",
          variant: "destructive" as any,
        });
      }
    }).finally(() => {
      if (!cancelled) setIsLoadingQuotation(false);
    });
    return () => { cancelled = true; };
  }, [quotationId, toast]);

  React.useEffect(() => {
    let cancelled = false;
    projectApi.list({ limit: 100, isActive: true }).then((response) => {
      if (!cancelled) setProjects(response.data?.success && Array.isArray(response.data.data) ? response.data.data : []);
    }).catch((error: any) => {
      if (!cancelled) toast({ title: "Error", description: error?.response?.data?.error || "Failed to load projects", variant: "destructive" as any });
    }).finally(() => {
      if (!cancelled) setIsLoadingProjects(false);
    });
    return () => { cancelled = true; };
  }, [toast]);

  React.useEffect(() => {
    if (!projectId) {
      setUnits([]);
      return;
    }
    let cancelled = false;
    setIsLoadingUnits(true);
    unitApi.list({ projectId, status: "AVAILABLE", limit: 200 }).then((response) => {
      if (cancelled) return;
      const availableUnits = response.data?.success && Array.isArray(response.data.data)
        ? response.data.data.filter((unit: Unit) => !unit.status || unit.status === "AVAILABLE")
        : [];
      setUnits(availableUnits);
    }).catch((error: any) => {
      if (!cancelled) {
        setUnits([]);
        toast({ title: "Error", description: error?.response?.data?.error || "Failed to load available units", variant: "destructive" as any });
      }
    }).finally(() => {
      if (!cancelled) setIsLoadingUnits(false);
    });
    return () => { cancelled = true; };
  }, [projectId, toast]);

  const selectedUnit = units.find((unit) => unit.id === unitId);

  const handleCreateBooking = async () => {
    const amount = Number(totalAmount);
    if (!projectId || !unitId || !Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Booking details required", description: "Select a project and available unit, then enter a valid amount.", variant: "destructive" as any });
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await bookingApi.create({
        leadId: leadId || undefined,
        opportunityId: opportunityId || undefined,
        quotationId: quotationId || undefined,
        projectId,
        unitId,
        totalAmount: amount,
      });
      const booking = response.data?.data;
      if (!response.data?.success || !booking?.id) throw new Error(response.data?.error || "Booking was not created");
      toast({ title: "Booking created", description: `${booking.number || "Booking"} is ready for payment recording.` });
      router.push(
        opportunityId
          ? `/opportunities/${opportunityId}?tab=create-receipt`
          : `/bookings/${booking.id}`,
      );
    } catch (error: any) {
      toast({ title: "Error", description: error?.response?.data?.error || error?.message || "Failed to create booking", variant: "destructive" as any });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/bookings" aria-label="Back to bookings"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Create Booking</h1>
          <p className="text-sm text-muted-foreground">Reserve an available project unit.</p>
        </div>
      </div>

      <section className="space-y-5 rounded-md border p-5">
        {quotationId && <p className="text-sm text-muted-foreground">This booking will be linked to the selected opportunity and quotation.</p>}
        <div className="space-y-2">
          <Label htmlFor="booking-project">Project *</Label>
          <select id="booking-project" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={projectId} disabled={isLoadingProjects || isLoadingQuotation || Boolean(quotationId)} onChange={(event) => {
            setProjectId(event.target.value);
            setUnitId("");
            if (!quotationId) setTotalAmount("");
          }}>
            <option value="">{isLoadingProjects ? "Loading projects..." : "Select a project"}</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="booking-unit">Available Unit *</Label>
          <select id="booking-unit" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={unitId} disabled={!projectId || isLoadingQuotation || isLoadingUnits || units.length === 0 || (Boolean(quotationId) && Boolean(unitId))} onChange={(event) => {
            const unit = units.find((item) => item.id === event.target.value);
            setUnitId(event.target.value);
            if (!quotationId && unit?.price) setTotalAmount(String(unit.price));
          }}>
            <option value="">{isLoadingUnits ? "Loading available units..." : units.length ? "Select a unit" : "No available units"}</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.number}{unit.type ? ` · ${unit.type}` : ""}{unit.area ? ` · ${unit.area} sq.ft` : ""}{unit.price ? ` · ₹${unit.price}` : ""}</option>)}
          </select>
        </div>
        {selectedUnit && <p className="text-sm text-muted-foreground">Selected: {selectedUnit.number}{selectedUnit.type ? ` · ${selectedUnit.type}` : ""}{selectedUnit.area ? ` · ${selectedUnit.area} sq.ft` : ""}</p>}
        <div className="space-y-2">
          <Label htmlFor="booking-total-amount">Total Amount (₹) *</Label>
          <Input id="booking-total-amount" type="number" min="0.01" step="0.01" value={totalAmount} disabled={Boolean(quotationId) || isLoadingQuotation} onChange={(event) => setTotalAmount(event.target.value)} />
          {quotationId && <p className="text-xs text-muted-foreground">This amount is taken from the linked quotation.</p>}
        </div>
        <div className="flex gap-3">
          <Button onClick={handleCreateBooking} disabled={isSubmitting || !hasEffectivePermission("BOOKING_CREATE")}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? "Creating..." : "Create Booking"}
          </Button>
          <Button variant="outline" asChild><Link href="/bookings">Cancel</Link></Button>
        </div>
      </section>
    </div>
  );
}