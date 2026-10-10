"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";
import { crmDateTimeInputValue, crmLocalDateTimeToDate } from "@dct-crm/shared";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import Link from "next/link";

import { leadApi, siteVisitApi } from "@/lib/api";
import { getCurrentCoordinates, getGeolocationPermission, getLocationSettingsInstructions } from "@/lib/geolocation";

import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Separator } from "@/components/ui/separator";

import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

import {
  ArrowLeft,
  Calendar,
  User,
  MapPin,
  CheckCircle2,
  Clock,
  FileText,
  History,
  StickyNote,
  MessageSquare,
} from "lucide-react";

interface SiteVisitData {
  id: string;
  siteVisitNumber?: string | null;
  status: string;
  scheduledAt?: string;
  notes?: string;
  feedback?: string | null;
  customerFeedback?: string | null;
  completionNotes?: string | null;
  completedAt?: string | null;
  completedBy?: { id: string; firstName: string; lastName: string; profile?: { name: string } | null } | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: { id: string; firstName: string; lastName: string; profile?: { name: string } | null } | null;
  rating?: number | null;
  createdAt: string;
  updatedAt: string;
  lead?: { id: string; leadNumber?: string | null; firstName: string; lastName: string; phone?: string | null; company?: string | null; email?: string | null; status?: string; owner?: { firstName: string; lastName: string; email?: string | null; profile?: { name: string } | null } | null };
  leadName?: string;
  project?: { id: string; name: string; allowedRadiusMeters?: number };
  projectName?: string;
  assignee?: { id: string; firstName: string; lastName: string };
  creator?: { id: string; firstName: string; lastName: string; email?: string; profile?: { name: string } | null };
  assignedTo?: string;
  visitDate?: string;
  previousSiteVisitId?: string | null;
  previousSiteVisit?: { id: string; siteVisitNumber?: string | null; status?: string; scheduledAt?: string } | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
  SCHEDULED: "info",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const normalizeStatus = (status: string) => {
  const upper = String(status || "").toUpperCase();
  if (upper === "RESCHEDULED") return "SCHEDULED";
  if (["SCHEDULED", "COMPLETED", "CANCELLED"].includes(upper)) return upper;
  return upper || "SCHEDULED";
};

const deriveLeadName = (sv: SiteVisitData) =>
  sv.leadName ||
  (sv.lead ? `${sv.lead.firstName} ${sv.lead.lastName}`.trim() : "—");

const deriveProjectName = (sv: SiteVisitData) =>
  sv.projectName || sv.project?.name || "N/A";

const deriveAssignedTo = (sv: SiteVisitData) =>
  sv.assignedTo ||
  (sv.assignee ? `${sv.assignee.firstName} ${sv.assignee.lastName}`.trim() : "Unassigned");

const deriveVisitDate = (sv: SiteVisitData) =>
  sv.visitDate || sv.scheduledAt || sv.createdAt;

export default function SiteVisitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user, profile, hasEffectivePermission } = useAuth();
  const [siteVisit, setSiteVisit] = React.useState<SiteVisitData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("details");
  const [isActionLoading, setIsActionLoading] = React.useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [completeDialogOpen, setCompleteDialogOpen] = React.useState(false);
  const [locationAccessDialogOpen, setLocationAccessDialogOpen] = React.useState(false);
  const [locationDialogState, setLocationDialogState] = React.useState<"denied" | "unavailable" | "outside" | "inaccurate" | "error" | null>(null);
  const [locationFailure, setLocationFailure] = React.useState("");
  const [locationInstructions, setLocationInstructions] = React.useState("");
  const [isCheckingLocationPermission, setIsCheckingLocationPermission] = React.useState(false);
  const [outsideLocation, setOutsideLocation] = React.useState<{ distanceMeters: number; radiusMeters: number; projectName: string } | null>(null);
  const [completionTime, setCompletionTime] = React.useState("");
  const [customerFeedback, setCustomerFeedback] = React.useState("");
  const [completionNotes, setCompletionNotes] = React.useState("");
  const [revisitDialogOpen, setRevisitDialogOpen] = React.useState(false);
  const [revisitReason, setRevisitReason] = React.useState("");
  const [revisitDate, setRevisitDate] = React.useState("");
  const [revisitTime, setRevisitTime] = React.useState("");

  const fetchSiteVisit = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await siteVisitApi.get(params.id as string);
      if (res.data.success && res.data.data) {
        setSiteVisit(res.data.data);
      } else {
        toast({ title: "Error", description: "Site visit not found", variant: "destructive" as any });
        router.push("/site-visits");
      }
    } catch {
      toast({ title: "Error", description: "Failed to load site visit", variant: "destructive" as any });
    } finally {
      setIsLoading(false);
    }
  }, [params.id, router, toast]);

  React.useEffect(() => {
    fetchSiteVisit();
  }, [fetchSiteVisit]);

  const handleComplete = async () => {
    if (!completionTime || !customerFeedback.trim() || !completionNotes.trim()) {
      toast({ title: "Validation", description: "Completion time, customer feedback, and notes are required", variant: "destructive" as any });
      return;
    }
    setLocationFailure("");
    setOutsideLocation(null);
    await requestAndVerifySiteVisitLocation();
  };

  const requestAndVerifySiteVisitLocation = async () => {
    setIsActionLoading(true);
    try {
      const coordinates = await getCurrentCoordinates();
      await siteVisitApi.verifyLocation(params.id as string, coordinates);
      const response = await siteVisitApi.complete(params.id as string, {
        completedAt: crmLocalDateTimeToDate(completionTime.split("T")[0], completionTime.split("T")[1]).toISOString(),
        customerFeedback: customerFeedback.trim(),
        completionNotes: completionNotes.trim(),
        ...coordinates,
      });
      if (response.data.success) {
        setLocationAccessDialogOpen(false);
        setLocationDialogState(null);
        setLocationInstructions("");
        setOutsideLocation(null);
        toast({ title: "Success", description: "Site visit completed successfully." });
        setCompleteDialogOpen(false);
        await fetchSiteVisit();
      }
      setLocationFailure("");
    } catch (err: any) {
      const code = err?.response?.data?.code;
      setLocationFailure(err?.response?.data?.error || err?.message || "Failed to verify your location");
      const failureData = err?.response?.data?.data;
      if (code === "OUTSIDE_RADIUS" && Number.isFinite(failureData?.distanceMeters)) {
        setOutsideLocation({
          distanceMeters: failureData.distanceMeters,
          radiusMeters: failureData.radiusMeters,
          projectName: failureData.projectName || (siteVisit ? deriveProjectName(siteVisit) : "the project"),
        });
      } else {
        setOutsideLocation(null);
      }
      const permissionBlocked = err?.code === 1;
      const locationUnavailable = err?.code === 2;
      setLocationAccessDialogOpen(permissionBlocked || locationUnavailable);
      if (permissionBlocked) {
        setLocationInstructions(`The browser still reports Location as blocked. This page cannot change that setting. ${getLocationSettingsInstructions(navigator.userAgent)}`);
      } else if (locationUnavailable) {
        setLocationInstructions("Browser permission may be allowed, but the device did not provide a location. Turn on device Location Services and allow your browser to use location, then retry.");
      }
      setLocationDialogState(
        permissionBlocked ? "denied"
          : locationUnavailable ? "unavailable"
          : code === "OUTSIDE_RADIUS" ? "outside"
            : code === "INACCURATE" ? "inaccurate"
              : "error",
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAllowLocation = async () => {
    setIsCheckingLocationPermission(true);
    try {
      const permission = await getGeolocationPermission();
      if (permission === "granted") {
        setLocationInstructions("The browser confirms Location is allowed. Close this message and select Complete Site Visit to get a fresh position. If GPS is unavailable, enable Location Services in your device settings.");
      } else if (permission === "prompt") {
        setLocationInstructions("Location permission is not decided yet. Close this message and select Complete Site Visit to open the browser's normal permission prompt.");
      } else {
        setLocationInstructions(`The browser currently reports Location as blocked. This page cannot change that setting. ${getLocationSettingsInstructions(navigator.userAgent)}`);
      }
    } finally {
      setIsCheckingLocationPermission(false);
    }
  };

  const handleConvertLead = async () => {
    if (!siteVisit?.lead || !hasEffectivePermission("OPPORTUNITY_CREATE")) return;
    setIsActionLoading(true);
    try {
      const leadName = `${siteVisit.lead.firstName} ${siteVisit.lead.lastName}`.trim();
      const response = await leadApi.convert(siteVisit.lead.id, {
        name: `${siteVisit.lead.company || leadName} Opportunity`,
        projectId: siteVisit.project?.id,
      });
      const opportunity = response.data.data?.opportunity;
      if (!opportunity?.id) throw new Error("Opportunity was not returned by the server");
      toast({ title: "Lead converted", description: "Opportunity created successfully" });
      router.push("/opportunities");
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || err?.message || "Failed to convert lead", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast({ title: "Validation", description: "A reason is required to cancel", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const res = await siteVisitApi.cancel(params.id as string, cancelReason.trim());
      if (res.data.success) {
        toast({ title: "Success", description: "Site visit cancelled" });
        setCancelDialogOpen(false);
        setCancelReason("");
        await fetchSiteVisit();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to cancel site visit", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRevisit = async () => {
    if (!revisitReason.trim() || !revisitDate || !revisitTime) {
      toast({ title: "Validation", description: "A reason is required for revisit", variant: "destructive" as any });
      return;
    }
    const projectId = siteVisit?.project?.id;
    if (!projectId) {
      toast({ title: "Error", description: "No project found on this site visit", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const scheduledAt = crmLocalDateTimeToDate(revisitDate, revisitTime).toISOString();
      const res = await siteVisitApi.revisit(params.id as string, {
        reason: revisitReason.trim(),
        scheduledAt,
        projectId,
        notes: revisitReason.trim(),
      });
      if (res.data.success) {
        toast({ title: "Success", description: "Revisit site visit created" });
        setRevisitDialogOpen(false);
        setRevisitReason("");
        setRevisitDate("");
        setRevisitTime("");
        await fetchSiteVisit();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to create revisit", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!siteVisit) return null;

  const status = normalizeStatus(siteVisit.status);
  const leadName = deriveLeadName(siteVisit);
  const projectName = deriveProjectName(siteVisit);
  const assignedTo = deriveAssignedTo(siteVisit);
  const visitDate = deriveVisitDate(siteVisit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/site-visits">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Site Visit - {leadName}</h1>
            <p className="text-muted-foreground">
              {siteVisit.siteVisitNumber ? `Site Visit ${siteVisit.siteVisitNumber}` : `Site Visit #${siteVisit.id.slice(-8).toUpperCase()}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {status === "SCHEDULED" && (
            <>
              <Button onClick={() => {
                setCompletionTime(crmDateTimeInputValue());
                setCustomerFeedback("");
                setCompletionNotes("");
                setCompleteDialogOpen(true);
              }} disabled={isActionLoading}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark Completed
              </Button>
              <Button variant="outline" onClick={() => setRevisitDialogOpen(true)} disabled={isActionLoading}>
                <Clock className="mr-2 h-4 w-4" />
                Revisit
              </Button>
              <Button variant="destructive" onClick={() => setCancelDialogOpen(true)} disabled={isActionLoading}>
                Cancel Site Visit
              </Button>
            </>
          )}
          {status === "COMPLETED" && (
            <>
              {siteVisit.lead?.status === "SITE_VISIT_HAPPENED" && hasEffectivePermission("OPPORTUNITY_CREATE") && (
                <Button onClick={handleConvertLead} disabled={isActionLoading}>
                  {isActionLoading ? "Converting..." : "Convert"}
                </Button>
              )}
              <Button variant="outline" onClick={() => setRevisitDialogOpen(true)} disabled={isActionLoading}>
                <Clock className="mr-2 h-4 w-4" />
                Revisit
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={STATUS_VARIANT[status] || "default"}>
                  {STATUS_LABEL[status] || status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Visit Date</p>
                <p className="text-sm font-medium">
                  {formatDate(visitDate)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <User className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Assigned To</p>
                <p className="text-sm font-medium">{assignedTo}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <MapPin className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Project</p>
                <p className="text-sm font-medium">{projectName}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <FileText className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <History className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-2">
            <StickyNote className="h-4 w-4" />
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Site Visit Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Site Visit Number</span>
                  <span className="text-sm font-medium font-mono">{siteVisit.siteVisitNumber || "—"}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lead Name</span>
                  <span className="text-sm font-medium">{leadName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lead Number</span>
                  <span className="text-sm font-medium font-mono">{siteVisit.lead?.leadNumber || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Phone</span>
                  <span className="text-sm font-medium">{siteVisit.lead?.phone || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Company</span>
                  <span className="text-sm font-medium">{siteVisit.lead?.company || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Email</span>
                  <span className="text-sm font-medium">{siteVisit.lead?.email || "—"}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Project</span>
                  <span className="text-sm font-medium">{projectName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Assigned To</span>
                  <span className="text-sm font-medium">{assignedTo}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={STATUS_VARIANT[status] || "default"}>
                    {STATUS_LABEL[status] || status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Created By</span>
                  <span className="text-sm font-medium">
                    {siteVisit.creator
                      ? `${siteVisit.creator.firstName} ${siteVisit.creator.lastName}${siteVisit.creator.profile?.name ? ` (${siteVisit.creator.profile.name})` : ""}`
                      : "—"}
                  </span>
                </div>
                {siteVisit.previousSiteVisit && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Previous Visit</span>
                      <span className="text-sm font-medium font-mono">
                        {siteVisit.previousSiteVisit.siteVisitNumber || siteVisit.previousSiteVisit.id.slice(-8).toUpperCase()}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Visit Date</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(visitDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Created</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(siteVisit.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Last Updated</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(siteVisit.updatedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Notes</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {siteVisit.notes || "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {siteVisit.feedback && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Feedback
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <p className="text-sm whitespace-pre-wrap">{siteVisit.feedback}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No activity recorded</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <StickyNote className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{siteVisit.notes || "No notes added"}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Site Visit</DialogTitle>
            <DialogDescription>A cancellation reason is required.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="site-visit-cancel-reason">Reason *</Label>
            <Textarea id="site-visit-cancel-reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={isActionLoading}>Close</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isActionLoading || !cancelReason.trim()}>
              {isActionLoading ? "Cancelling..." : "Cancel Site Visit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeDialogOpen && !locationAccessDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Site Visit</DialogTitle>
            <DialogDescription>Completion time, customer feedback, and notes are required. Location access is also required, and you must be within {siteVisit.project?.allowedRadiusMeters || 100} meters of the project. To avoid repeated prompts, choose Allow while visiting this site or set Location to Allow in your browser settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="site-visit-completion-time">Completion Time *</Label>
              <Input id="site-visit-completion-time" type="datetime-local" value={completionTime} onChange={(event) => setCompletionTime(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-visit-customer-feedback">Customer Feedback *</Label>
              <Textarea id="site-visit-customer-feedback" value={customerFeedback} onChange={(event) => setCustomerFeedback(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-visit-completion-notes">Notes *</Label>
              <Textarea id="site-visit-completion-notes" value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} />
            </div>
            {locationDialogState && locationDialogState !== "denied" && (
              <div role="alert" className="flex flex-col gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0">
                  <span aria-hidden="true">⚠ </span>
                  {locationDialogState === "outside"
                    ? locationFailure || "Site Visit cannot be completed. You are not at the required location."
                    : locationFailure}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleComplete()}
                  disabled={isActionLoading}
                  className="shrink-0 border-red-300 text-red-800 hover:bg-red-100"
                >
                  {isActionLoading ? "Checking..." : "Check Location Again"}
                </Button>
              </div>
            )}
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Completed By</p>
              <p className="text-muted-foreground">{user ? `${user.firstName} ${user.lastName}` : "Authenticated user"}</p>
              <p className="text-muted-foreground">{profile?.name || "Current profile"}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleComplete} disabled={isActionLoading || !completionTime || !customerFeedback.trim() || !completionNotes.trim()}>
              {isActionLoading ? "Checking Location..." : "Complete Site Visit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={locationAccessDialogOpen}
        onOpenChange={(open) => {
          if (isActionLoading) return;
          setLocationAccessDialogOpen(open);
          if (!open) {
            setLocationDialogState(null);
            setLocationInstructions("");
          }
        }}
      >
        <DialogContent showClose={false}>
          <DialogHeader>
            <DialogTitle>Location Access Required</DialogTitle>
            <DialogDescription>
              {locationDialogState === "unavailable"
                ? "Your device could not provide a location. Enable device Location Services and allow your browser to access location to complete this site visit."
                : "Your location access is blocked. Enable location permission in your browser settings to complete this site visit."}
            </DialogDescription>
          </DialogHeader>
          {locationInstructions && (
            <p role="status" className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              {locationInstructions}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => void handleAllowLocation()} disabled={isActionLoading || isCheckingLocationPermission}>
              {isCheckingLocationPermission ? "Checking Permission..." : "Allow Location"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setLocationAccessDialogOpen(false);
                setLocationDialogState(null);
                setLocationInstructions("");
              }}
              disabled={isActionLoading || isCheckingLocationPermission}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revisitDialogOpen} onOpenChange={setRevisitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Revisit Site Visit</DialogTitle>
            <DialogDescription>Project, note/reason, date, and time are required.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p><strong>Lead Number:</strong> {siteVisit.lead?.leadNumber || "—"}</p>
              <p><strong>Lead Name:</strong> {leadName}</p>
              <p><strong>Phone:</strong> {siteVisit.lead?.phone || "—"}</p>
              <p><strong>Company:</strong> {siteVisit.lead?.company || "—"}</p>
              <p><strong>Email:</strong> {siteVisit.lead?.email || "—"}</p>
              <p><strong>Project:</strong> {projectName}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-visit-revisit-reason">Note / Reason *</Label>
              <Textarea id="site-visit-revisit-reason" value={revisitReason} onChange={(event) => setRevisitReason(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="site-visit-revisit-date">Visit Date *</Label>
                <Input id="site-visit-revisit-date" type="date" value={revisitDate} onChange={(event) => setRevisitDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-visit-revisit-time">Visit Time *</Label>
                <Input id="site-visit-revisit-time" type="time" value={revisitTime} onChange={(event) => setRevisitTime(event.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisitDialogOpen(false)} disabled={isActionLoading}>Close</Button>
            <Button onClick={handleRevisit} disabled={isActionLoading || !revisitReason.trim() || !revisitDate || !revisitTime}>
              {isActionLoading ? "Creating..." : "Create Revisit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}