"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarClock, CheckCircle2, Clock, RotateCcw, User } from "lucide-react";
import { followUpApi } from "@/lib/api";
import { formatDateTime } from "@/lib/date-format";
import { useToast } from "@/hooks/use-toast";
import { RecordPageHeader } from "@/components/crm/record-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface FollowUpDetail {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  isCompleted: boolean;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: { firstName: string; lastName: string } | null;
  lead?: {
    id: string;
    firstName?: string | null;
    lastName: string;
    phone?: string | null;
    email?: string | null;
  } | null;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid min-h-10 gap-1 border-b py-2 sm:grid-cols-[minmax(140px,2fr)_minmax(0,3fr)] sm:items-start">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

export default function FollowUpDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [followUp, setFollowUp] = React.useState<FollowUpDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const loadFollowUp = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await followUpApi.get(params.id);
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || "Follow-up could not be loaded.");
      }
      setFollowUp(response.data.data);
    } catch (error: any) {
      toast({
        title: "Unable to load follow-up",
        description: error?.response?.data?.error || error?.message || "Please try again.",
        variant: "destructive",
      });
      setFollowUp(null);
    } finally {
      setLoading(false);
    }
  }, [params.id, toast]);

  React.useEffect(() => {
    void loadFollowUp();
  }, [loadFollowUp]);

  const updateCompletion = async () => {
    if (!followUp || saving) return;
    setSaving(true);
    try {
      const response = followUp.isCompleted
        ? await followUpApi.reopen(followUp.id)
        : await followUpApi.complete(followUp.id);
      if (!response.data.success) {
        throw new Error(response.data.error || "Follow-up status could not be updated.");
      }
      toast({
        title: "Follow-up updated",
        description: followUp.isCompleted ? "Follow-up reopened." : "Follow-up marked complete.",
      });
      await loadFollowUp();
    } catch (error: any) {
      toast({
        title: "Unable to update follow-up",
        description: error?.response?.data?.error || error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!followUp) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Follow-up not found or you do not have access.
        </CardContent>
      </Card>
    );
  }

  const leadName = followUp.lead
    ? `${followUp.lead.firstName || ""} ${followUp.lead.lastName}`.trim()
    : "—";

  return (
    <div className="space-y-6">
      <RecordPageHeader
        objectLabel="Follow-up"
        title={followUp.title}
        subtitle={followUp.lead ? `Lead: ${leadName}` : "Follow-up record"}
        backHref="/follow-ups"
        icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
        badges={
          <Badge className={followUp.isCompleted ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
            {followUp.isCompleted ? "Completed" : "Scheduled"}
          </Badge>
        }
        actions={
          <Button variant={followUp.isCompleted ? "outline" : "default"} onClick={updateCompletion} disabled={saving}>
            {followUp.isCompleted
              ? <><RotateCcw className="mr-2 h-4 w-4" />Reopen</>
              : <><CheckCircle2 className="mr-2 h-4 w-4" />Mark Complete</>}
          </Button>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <Card>
          <CardHeader className="border-b bg-muted/50 py-3">
            <CardTitle className="text-sm font-semibold">Follow-up Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 pt-2 md:grid-cols-2">
            <dl>
              <DetailRow label="Follow-up" value={followUp.title} />
              <DetailRow label="Scheduled Date" value={formatDateTime(followUp.dueDate)} />
              <DetailRow label="Status" value={followUp.isCompleted ? "Completed" : "Scheduled"} />
              <DetailRow label="Completed Date" value={followUp.completedAt ? formatDateTime(followUp.completedAt) : "—"} />
            </dl>
            <dl>
              <DetailRow label="Owner" value={followUp.owner ? `${followUp.owner.firstName} ${followUp.owner.lastName}` : "—"} />
              <DetailRow
                label="Lead"
                value={followUp.lead ? <Link className="text-primary hover:underline" href={`/leads/${followUp.lead.id}`}>{leadName}</Link> : "—"}
              />
              <DetailRow label="Lead Phone" value={followUp.lead?.phone || "—"} />
              <DetailRow label="Lead Email" value={followUp.lead?.email || "—"} />
            </dl>
            {followUp.description && (
              <div className="md:col-span-2">
                <DetailRow label="Comments" value={followUp.description} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b bg-muted/50 py-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4" />
              System Information
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <dl>
              <DetailRow label="Created" value={formatDateTime(followUp.createdAt)} />
              <DetailRow label="Last Modified" value={formatDateTime(followUp.updatedAt)} />
              <DetailRow
                label="Lead Record"
                value={followUp.lead ? <Link className="text-primary hover:underline" href={`/leads/${followUp.lead.id}`}><User className="mr-1 inline h-3.5 w-3.5" />{leadName}</Link> : "—"}
              />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
