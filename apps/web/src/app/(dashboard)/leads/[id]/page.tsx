"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";
import { crmLocalDateTimeToDate } from "@dct-crm/shared";

import * as React from "react";

import Link from "next/link";

import { useParams, useRouter } from "next/navigation";

import { useAuth } from "@/contexts/auth-context";

import { leadApi, siteVisitApi, opportunityApi, activityApi, callDetailsApi, taskApi, followUpApi, objectManagerApi, projectApi, unitApi, quotationApi, bookingApi, enquiryApi, notesApi } from "@/lib/api";
import { formatPhoneWithCountryCode } from "@/lib/phone-display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { getCurrentCoordinates, getGeolocationPermission, getLocationSettingsInstructions } from "@/lib/geolocation";

import LayoutDrivenForm from "@/components/admin/layout-driven-form";
import LeadActivityHistoryCard from "@/components/crm/lead-activity-history-card";
import StickyNotesCard from "@/components/crm/sticky-notes-card";

import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Separator } from "@/components/ui/separator";

import { Skeleton } from "@/components/ui/skeleton";

import { Textarea } from "@/components/ui/textarea";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  CheckSquare,
  Clock,
  Map,
  TrendingUp,
  History,
  Inbox,
  ArrowLeft,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  StickyNote,
  Edit3,
  Save,
  X,
  Monitor,
  ChevronDown,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  INCOMING: "Incoming",
  PROSPECT: "Prospect",
  SITE_VISIT_SCHEDULED: "Site Visit Scheduled",
  SITE_VISIT_HAPPENED: "Site Visit Happened",
  BOOKED: "Converted",
  LOST: "Lost",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
  NEW: "info",
  INCOMING: "info",
  PROSPECT: "warning",
  SITE_VISIT_SCHEDULED: "warning",
  SITE_VISIT_HAPPENED: "success",
  BOOKED: "success",
  LOST: "destructive",
};

const RECOVERY_REASONS = [
  "Not Interested",
  "Budget Issue",
  "No Response",
  "Property Not Suitable",
  "Customer Request",
  "Other",
];

const LEAD_STATUS_PROGRESSION = [
  { key: "NEW", label: "New" },
  { key: "INCOMING", label: "Incoming" },
  { key: "PROSPECT", label: "Prospect" },
  { key: "SITE_VISIT_SCHEDULED", label: "Site Visit Scheduled" },
  { key: "SITE_VISIT_HAPPENED", label: "Site Visit Happened" },
  { key: "LOST", label: "Lost" },
  { key: "BOOKED", label: "Converted" },
];

interface LeadData {
  id: string;
  leadNumber: string;
  salutation?: string;
  firstName?: string;
  lastName: string;
  title?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  secondaryPhone?: string | null;
  tertiaryPhone?: string | null;
  website?: string;
  company: string;
  industry?: string;
  annualRevenue?: number;
  numberOfEmployees?: number;
  source: string;
  status: string;
  rating?: string;
  description?: string;
  score?: number;
  budget?: number;
  street?: string;
  city?: string;
  stateProvince?: string;
  country?: string;
  postalCode?: string;
  requirements?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
  owner?: { id: string; firstName: string; lastName: string };
  creator?: { id: string; firstName: string; lastName: string };
  project?: { id: string; name: string; allowedRadiusMeters?: number };
  projectId?: string | null;
  siteVisits?: any[];
  opportunities?: any[];
  activities?: any[];
  tasks?: any[];
  followUps?: any[];
  auditLogs?: any[];
  ownerHistory?: any[];
  lastModified?: {
    by?: { id: string; firstName: string; lastName: string; email?: string | null } | null;
    at?: string;
    action?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface LeadEnquiry {
  id: string;
  enquiryNumber: string;
  leadType: string;
  enquiryType: string;
  source: string;
  subSource?: string | null;
  phone?: string | null;
  countryCode?: string | null;
  secondaryPhone?: string | null;
  secondaryCountryCode?: string | null;
  tertiaryPhone?: string | null;
  tertiaryCountryCode?: string | null;
  email?: string | null;
  secondaryEmail?: string | null;
  tertiaryEmail?: string | null;
  campaign?: string | null;
  campaignId?: string | null;
  subCampaign?: string | null;
  subCampaignId?: string | null;
  medium?: string | null;
  description?: string | null;
  channelPartner?: string | null;
  project?: { id: string; name: string } | null;
  enquiryDate: string;
  createdAt: string;
}

interface EnquiryEditDraft {
  leadType: string;
  source: string;
  subSource: string;
  campaign: string;
  campaignId: string;
  subCampaign: string;
  subCampaignId: string;
  projectId: string;
  countryCode: string;
  phone: string;
  secondaryCountryCode: string;
  secondaryPhone: string;
  tertiaryCountryCode: string;
  tertiaryPhone: string;
  email: string;
  secondaryEmail: string;
  tertiaryEmail: string;
  medium: string;
  channelPartner: string;
  description: string;
  enquiryDate: string;
}

interface PushSvcLeadDraft {
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  email: string;
  projectId: string;
}

const LEAD_EDITABLE_FIELDS = [
  "salutation",
  "firstName",
  "lastName",
  "title",
  "email",
  "phone",
  "mobile",
  "website",
  "company",
  "industry",
  "annualRevenue",
  "numberOfEmployees",
  "source",
  "status",
  "rating",
  "description",
  "score",
  "budget",
  "street",
  "city",
  "stateProvince",
  "country",
  "postalCode",
  "requirements",
  "notes",
  "projectId",
] as const;

const formatLeadTypeLabel = (leadType?: string | null) => {
  switch (leadType) {
    case "ORIGINAL":
    case "ADDITIONAL":
      return "Fresh";
    case "RE_ENGAGED":
      return "Re-Engaged";
    case "RE_OPENED":
      return "Re-Opened";
    default:
      return leadType ? leadType.replaceAll("_", " ") : "—";
  }
};

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile, user, isLoading: authLoading, hasPermission, hasEffectivePermission, isAdmin, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const leadId = params.id as string;

  const [lead, setLead] = React.useState<LeadData | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isActionLoading, setIsActionLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("overview");
  const [recoveryDialogOpen, setRecoveryDialogOpen] = React.useState(false);
  const [recoveryReason, setRecoveryReason] = React.useState("");
  const [recoveryNote, setRecoveryNote] = React.useState("");
  const [layout, setLayout] = React.useState<any>(null);
  const [fields, setFields] = React.useState<any[]>([]);

  const [followUpDialogOpen, setFollowUpDialogOpen] = React.useState(false);
  const [followUpNote, setFollowUpNote] = React.useState("");
  const [followUpDate, setFollowUpDate] = React.useState("");
  const [followUpTime, setFollowUpTime] = React.useState("");
  const [callDialogOpen, setCallDialogOpen] = React.useState(false);
  const [callType, setCallType] = React.useState<"INBOUND" | "OUTBOUND">("OUTBOUND");
  const [callStartAt, setCallStartAt] = React.useState("");
  const [callEndAt, setCallEndAt] = React.useState("");
  const [callFrom, setCallFrom] = React.useState("");
  const [callTo, setCallTo] = React.useState("");
  const [callOpportunityId, setCallOpportunityId] = React.useState("");
  const [executiveContactNo, setExecutiveContactNo] = React.useState("");
  const [landingNumber, setLandingNumber] = React.useState("");
  const [recordingFile, setRecordingFile] = React.useState("");
  const [callStatus, setCallStatus] = React.useState("COMPLETED");
  const [callNotes, setCallNotes] = React.useState("");
  const [callSaving, setCallSaving] = React.useState(false);
  const [stickyNotesRefresh, setStickyNotesRefresh] = React.useState(0);

  const [taskDialogOpen, setTaskDialogOpen] = React.useState(false);
  const [taskNote, setTaskNote] = React.useState("");
  const [taskDueDate, setTaskDueDate] = React.useState("");
  const [taskTime, setTaskTime] = React.useState("");

  const [siteVisitDialogOpen, setSiteVisitDialogOpen] = React.useState(false);
  const [svProjectId, setSvProjectId] = React.useState("");
  const [svNote, setSvNote] = React.useState("");
  const [svDate, setSvDate] = React.useState("");
  const [svTime, setSvTime] = React.useState("");
  const [projects, setProjects] = React.useState<any[]>([]);
  const [projectsLoading, setProjectsLoading] = React.useState(false);
  const [projectsError, setProjectsError] = React.useState<string | null>(null);
  const projectsLoaded = React.useRef(false);
  const projectsRequest = React.useRef<Promise<void> | null>(null);

  const [noteDialogOpen, setNoteDialogOpen] = React.useState(false);
  const [noteContent, setNoteContent] = React.useState("");
  const [noteSubject, setNoteSubject] = React.useState("");

  const [pushSvcDialogOpen, setPushSvcDialogOpen] = React.useState(false);
  const [pushSvcReason, setPushSvcReason] = React.useState("");
  const [pushSvcLeadEditing, setPushSvcLeadEditing] = React.useState(false);
  const [pushSvcLeadDraft, setPushSvcLeadDraft] = React.useState<PushSvcLeadDraft>({
    firstName: "",
    lastName: "",
    phone: "",
    company: "",
    email: "",
    projectId: "",
  });

  const [auditLogs, setAuditLogs] = React.useState<any[]>([]);
  const [auditPage, setAuditPage] = React.useState(1);
  const [auditTotalPages, setAuditTotalPages] = React.useState(1);
  const [auditTotal, setAuditTotal] = React.useState(0);
  const [auditLoading, setAuditLoading] = React.useState(false);
  const [enquiries, setEnquiries] = React.useState<LeadEnquiry[]>([]);
  const [enquiriesLoading, setEnquiriesLoading] = React.useState(false);
  const [enquiriesError, setEnquiriesError] = React.useState<string | null>(null);
  const [showAllEnquiries, setShowAllEnquiries] = React.useState(false);
  const [leadBookings, setLeadBookings] = React.useState<any[]>([]);
  const [leadBookingsLoading, setLeadBookingsLoading] = React.useState(false);
  const [leadBookingsError, setLeadBookingsError] = React.useState<string | null>(null);
  const [callDetails, setCallDetails] = React.useState<any[]>([]);
  const [callDetailsLoading, setCallDetailsLoading] = React.useState(false);
  const [callDetailsError, setCallDetailsError] = React.useState<string | null>(null);
  const [showAllSiteVisits, setShowAllSiteVisits] = React.useState(false);
  const [showAllLeadBookings, setShowAllLeadBookings] = React.useState(false);
  const [showAllCallDetails, setShowAllCallDetails] = React.useState(false);
  const [showAllFeedbacks, setShowAllFeedbacks] = React.useState(false);
  const [editingEnquiry, setEditingEnquiry] = React.useState<LeadEnquiry | null>(null);
  const [enquiryEditDraft, setEnquiryEditDraft] = React.useState<EnquiryEditDraft | null>(null);
  const [enquiryEditProjects, setEnquiryEditProjects] = React.useState<Array<{ id: string; name: string }>>([]);
  const [enquiryEditProjectsLoading, setEnquiryEditProjectsLoading] = React.useState(false);
  const [enquiryEditError, setEnquiryEditError] = React.useState<string | null>(null);
  const [enquirySaveLoading, setEnquirySaveLoading] = React.useState(false);
  const [enquiryDeleteTarget, setEnquiryDeleteTarget] = React.useState<LeadEnquiry | null>(null);
  const [enquiryDeleteLoading, setEnquiryDeleteLoading] = React.useState(false);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editData, setEditData] = React.useState<Record<string, any>>({});
  const [editFieldErrors, setEditFieldErrors] = React.useState<Record<string, string>>({});

  const [revisitDialogOpen, setRevisitDialogOpen] = React.useState(false);
  const [revisitReason, setRevisitReason] = React.useState("");
  const [revisitDate, setRevisitDate] = React.useState("");
  const [revisitTime, setRevisitTime] = React.useState("");
  const [revisitProjectId, setRevisitProjectId] = React.useState("");
  const [revisitNote, setRevisitNote] = React.useState("");

  const [cancelSvDialogOpen, setCancelSvDialogOpen] = React.useState(false);
  const [cancelSvReason, setCancelSvReason] = React.useState("");

  const [completeSvDialogOpen, setCompleteSvDialogOpen] = React.useState(false);
  const [locationAccessDialogOpen, setLocationAccessDialogOpen] = React.useState(false);
  const [locationDialogState, setLocationDialogState] = React.useState<"denied" | "unavailable" | "outside" | "inaccurate" | "error" | null>(null);
  const [locationFailure, setLocationFailure] = React.useState("");
  const [locationInstructions, setLocationInstructions] = React.useState("");
  const [isCheckingLocationPermission, setIsCheckingLocationPermission] = React.useState(false);
  const [outsideLocation, setOutsideLocation] = React.useState<{ distanceMeters: number; radiusMeters: number; projectName: string } | null>(null);
  const [completeSvFeedback, setCompleteSvFeedback] = React.useState("");
  const [completeSvNotes, setCompleteSvNotes] = React.useState("");
  const [completeSvTime, setCompleteSvTime] = React.useState("");
  const [completeSvRating, setCompleteSvRating] = React.useState("");

  const [detailDialogOpen, setDetailDialogOpen] = React.useState(false);
  const [detailItem, setDetailItem] = React.useState<{ kind: "task" | "followup" | "note" | "activity"; data: any } | null>(null);

  const [createOppDialogOpen, setCreateOppDialogOpen] = React.useState(false);
  const [oppName, setOppName] = React.useState("");
  const [oppAmount, setOppAmount] = React.useState("");
  const [oppDescription, setOppDescription] = React.useState("");
  const [oppProjectId, setOppProjectId] = React.useState("");
  const [oppUnitId, setOppUnitId] = React.useState("");
  const [oppUnits, setOppUnits] = React.useState<any[]>([]);
  const [oppUnitsLoading, setOppUnitsLoading] = React.useState(false);
  const [oppUnitsError, setOppUnitsError] = React.useState<string | null>(null);

  const [createQuoteDialogOpen, setCreateQuoteDialogOpen] = React.useState(false);
  const [quoteConfirmationOpen, setQuoteConfirmationOpen] = React.useState(false);
  const [quoteDescription, setQuoteDescription] = React.useState("");
  const [quoteUnitPrice, setQuoteUnitPrice] = React.useState("");

  const [createBookingDialogOpen, setCreateBookingDialogOpen] = React.useState(false);
  const [bookingProjectId, setBookingProjectId] = React.useState("");
  const [bookingUnitId, setBookingUnitId] = React.useState("");
  const [bookingUnits, setBookingUnits] = React.useState<any[]>([]);
  const [bookingUnitsLoading, setBookingUnitsLoading] = React.useState(false);
  const [bookingUnitsError, setBookingUnitsError] = React.useState<string | null>(null);
  const [bookingAmount, setBookingAmount] = React.useState("");
  const [ownerDialogOpen, setOwnerDialogOpen] = React.useState(false);
  const [ownerCandidates, setOwnerCandidates] = React.useState<any[]>([]);
  const [newOwnerId, setNewOwnerId] = React.useState("");
  const [ownerChangeReason, setOwnerChangeReason] = React.useState("");

  const fetchLead = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const [leadResult, layoutResult, fieldsResult] = await Promise.allSettled([
        leadApi.get(leadId),
        objectManagerApi.getDefaultLayout("Lead"),
        objectManagerApi.listFields("Lead", { includeSystem: true }),
      ]);

      if (leadResult.status === "fulfilled" && leadResult.value.data?.success && leadResult.value.data.data) {
        setLoadError(null);
        setLead(leadResult.value.data.data);
      } else {
        const errorMessage = leadResult.status === "rejected"
          ? "Failed to load lead"
          : leadResult.value?.data?.error || "Lead not found";
        setLead(null);
        setLoadError(errorMessage);
        toast({ title: "Error", description: errorMessage, variant: "destructive" as any });
      }

      if (layoutResult.status === "fulfilled") {
        setLayout(layoutResult.value.data?.data ?? null);
      }

      if (fieldsResult.status === "fulfilled") {
        setFields(fieldsResult.value.data?.data || []);
      }
    } catch {
      setLead(null);
      setLoadError("Failed to load lead");
      toast({ title: "Error", description: "Failed to load lead", variant: "destructive" as any });
    } finally {
      setIsLoading(false);
    }
  }, [leadId, toast]);

  const fetchAuditHistory = React.useCallback(
    async (page = 1) => {
      setAuditLoading(true);
      try {
        const res = await leadApi.getAuditHistory(leadId, { page, limit: 20 });
        if (res.data.success) {
          setAuditLogs(res.data.data || []);
          const p = res.data.pagination;
          setAuditPage(p?.page || page);
          setAuditTotalPages(p?.totalPages || 1);
          setAuditTotal(p?.total || 0);
        }
      } catch {
        toast({
          title: "Error",
          description: "Failed to load audit history",
          variant: "destructive" as any,
        });
      } finally {
        setAuditLoading(false);
      }
    },
    [leadId, toast],
  );

  const fetchEnquiries = React.useCallback(async () => {
    setEnquiriesLoading(true);
    setEnquiriesError(null);
    try {
      const response = await leadApi.getEnquiries(leadId, { page: 1, limit: 100 });
      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to load enquiries");
      }
      setEnquiries(response.data.data || []);
    } catch (error: any) {
      setEnquiriesError(error?.response?.data?.error || error?.message || "Failed to load enquiries.");
    } finally {
      setEnquiriesLoading(false);
    }
  }, [leadId]);

  const fetchLeadBookings = React.useCallback(async () => {
    setLeadBookingsLoading(true);
    setLeadBookingsError(null);
    try {
      const response = await bookingApi.list({ leadId, page: 1, limit: 100 });
      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to load bookings");
      }
      setLeadBookings(response.data.data || []);
    } catch (error: any) {
      setLeadBookingsError(error?.response?.data?.error || error?.message || "Failed to load bookings.");
    } finally {
      setLeadBookingsLoading(false);
    }
  }, [leadId]);

  const fetchCallDetails = React.useCallback(async () => {
    setCallDetailsLoading(true);
    setCallDetailsError(null);
    try {
      const [activityResponse, callDetailsResponse] = await Promise.all([
        activityApi.list({ leadId, type: "CALL", page: 1, limit: 100 }),
        callDetailsApi.list(leadId),
      ]);
      if (!activityResponse.data.success || !callDetailsResponse.data.success) {
        throw new Error(activityResponse.data.error || callDetailsResponse.data.error || "Failed to load call details");
      }
      setCallDetails([
        ...(callDetailsResponse.data.data || []).map((call: any) => ({ ...call, recordType: "CALL_DETAIL" })),
        ...(activityResponse.data.data || []).map((call: any) => ({ ...call, recordType: "ACTIVITY" })),
      ].sort((left: any, right: any) => new Date(right.startAt || right.createdAt).getTime() - new Date(left.startAt || left.createdAt).getTime()));
    } catch (error: any) {
      setCallDetailsError(error?.response?.data?.error || error?.message || "Failed to load call details.");
    } finally {
      setCallDetailsLoading(false);
    }
  }, [leadId]);

  const openCallDialog = () => {
    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    setCallType("OUTBOUND");
    setCallStartAt(localNow);
    setCallEndAt("");
    setCallFrom("");
    setCallTo(lead?.phone || lead?.mobile || "");
    setCallOpportunityId(lead?.opportunities?.[0]?.id || "");
    setExecutiveContactNo(lead?.phone || lead?.mobile || "");
    setLandingNumber("");
    setRecordingFile("");
    setCallStatus("COMPLETED");
    setCallNotes("");
    setCallDialogOpen(true);
  };

  const handleLogCall = async () => {
    if (!callStartAt || !callEndAt) {
      toast({ title: "Call details required", description: "Enter both the call start time and end time.", variant: "destructive" });
      return;
    }
    const startAt = crmLocalDateTimeToDate(callStartAt.slice(0, 10), callStartAt.slice(11, 16));
    const endAt = crmLocalDateTimeToDate(callEndAt.slice(0, 10), callEndAt.slice(11, 16));
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
      toast({ title: "Invalid call time", description: "The end time must be after the start time.", variant: "destructive" });
      return;
    }

    setCallSaving(true);
    try {
      await callDetailsApi.create({
        leadId,
        caseId: leadId,
        ...(callOpportunityId ? { opportunityId: callOpportunityId } : {}),
        callType,
        callFrom: callFrom.trim(),
        callTo: callTo.trim(),
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        executiveContactNo: executiveContactNo.trim(),
        landingNumber: landingNumber.trim(),
        status: callStatus,
        parentId: leadId,
        parentUrl: new URL(`/leads/${leadId}`, window.location.origin).toString(),
        ...(recordingFile.trim() ? { recordingFile: recordingFile.trim() } : {}),
        notes: callNotes.trim() || undefined,
      });

      setCallDialogOpen(false);
      await fetchCallDetails();
      if (callNotes.trim()) {
        try {
          const noteResponse = await notesApi.add(leadId, `${callType === "INBOUND" ? "Inbound" : "Outbound"} call notes:\n${callNotes.trim()}`);
          if (!noteResponse.data.success) throw new Error(noteResponse.data.error || "Sticky Note could not be saved.");
          setStickyNotesRefresh((current) => current + 1);
          toast({ title: "Call logged", description: "Call details saved and notes added to Sticky Notes." });
        } catch (noteError: any) {
          toast({
            title: "Call saved, but Sticky Note was not added",
            description: noteError?.response?.data?.error || "Please add the call notes to Sticky Notes manually.",
            variant: "destructive",
          });
        }
      } else {
        toast({ title: "Call logged", description: "Call details saved successfully." });
      }
      setActiveTab("call-details");
    } catch (error: any) {
      toast({
        title: "Unable to log call",
        description: error?.response?.data?.error || error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCallSaving(false);
    }
  };

  React.useEffect(() => {
    if (activeTab === "bookings") void fetchLeadBookings();
    if (activeTab === "call-details") void fetchCallDetails();
  }, [activeTab, fetchCallDetails, fetchLeadBookings]);

  const openEnquiryEditor = React.useCallback(async (enquiry: LeadEnquiry) => {
    setEnquiryEditError(null);
    setEditingEnquiry(enquiry);
    setEnquiryEditDraft({
      leadType: enquiry.leadType === "ADDITIONAL" ? "ORIGINAL" : enquiry.leadType || "ORIGINAL",
      source: enquiry.source || "",
      subSource: enquiry.subSource || "",
      campaign: enquiry.campaign || "",
      campaignId: enquiry.campaignId || "",
      subCampaign: enquiry.subCampaign || "",
      subCampaignId: enquiry.subCampaignId || "",
      projectId: enquiry.project?.id || "",
      countryCode: enquiry.countryCode || "",
      phone: enquiry.phone || "",
      secondaryCountryCode: enquiry.secondaryCountryCode || "",
      secondaryPhone: enquiry.secondaryPhone || "",
      tertiaryCountryCode: enquiry.tertiaryCountryCode || "",
      tertiaryPhone: enquiry.tertiaryPhone || "",
      email: enquiry.email || "",
      secondaryEmail: enquiry.secondaryEmail || "",
      tertiaryEmail: enquiry.tertiaryEmail || "",
      medium: enquiry.medium || "",
      channelPartner: enquiry.channelPartner || "",
      description: enquiry.description || "",
      enquiryDate: enquiry.enquiryDate
        ? new Date(new Date(enquiry.enquiryDate).getTime() - new Date(enquiry.enquiryDate).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
        : "",
    });
    setEnquiryEditProjectsLoading(true);
    try {
      const projectList = await projectApi.listAll({ isActive: true });
      setEnquiryEditProjects(projectList);
    } catch (error: any) {
      setEnquiryEditError(error?.response?.data?.error || "Unable to load projects.");
    } finally {
      setEnquiryEditProjectsLoading(false);
    }
  }, []);

  const updateEnquiryDraft = <K extends keyof EnquiryEditDraft>(field: K, value: EnquiryEditDraft[K]) => {
    setEnquiryEditDraft((current) => current ? { ...current, [field]: value } : current);
    setEnquiryEditError(null);
  };

  const saveEnquiryEdits = async () => {
    if (!editingEnquiry || !enquiryEditDraft) return;
    setEnquirySaveLoading(true);
    setEnquiryEditError(null);
    try {
      const response = await enquiryApi.update(editingEnquiry.id, {
        ...enquiryEditDraft,
        campaignId: enquiryEditDraft.campaignId || null,
        campaign: enquiryEditDraft.campaign.trim() || null,
        subSource: enquiryEditDraft.subSource.trim() || null,
        subCampaignId: enquiryEditDraft.subCampaignId || null,
        subCampaign: enquiryEditDraft.subCampaign.trim() || null,
        projectId: enquiryEditDraft.projectId || null,
        countryCode: enquiryEditDraft.countryCode.trim() || null,
        phone: enquiryEditDraft.phone.trim() || null,
        secondaryCountryCode: enquiryEditDraft.secondaryCountryCode.trim() || null,
        secondaryPhone: enquiryEditDraft.secondaryPhone.trim() || null,
        tertiaryCountryCode: enquiryEditDraft.tertiaryCountryCode.trim() || null,
        tertiaryPhone: enquiryEditDraft.tertiaryPhone.trim() || null,
        email: enquiryEditDraft.email.trim() || null,
        secondaryEmail: enquiryEditDraft.secondaryEmail.trim() || null,
        tertiaryEmail: enquiryEditDraft.tertiaryEmail.trim() || null,
        medium: enquiryEditDraft.medium.trim() || null,
        channelPartner: enquiryEditDraft.channelPartner.trim() || null,
        description: enquiryEditDraft.description.trim() || null,
        enquiryDate: enquiryEditDraft.enquiryDate ? new Date(enquiryEditDraft.enquiryDate).toISOString() : undefined,
      });
      if (!response.data.success) throw new Error(response.data.error || "Failed to update enquiry.");
      const updatedEnquiry = response.data.data as LeadEnquiry;
      setEnquiries((current) => current.map((item) => item.id === updatedEnquiry.id ? updatedEnquiry : item));
      setEditingEnquiry(null);
      setEnquiryEditDraft(null);
      toast({ title: "Saved", description: "Related source updated successfully." });
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Failed to update related source.";
      setEnquiryEditError(message);
      toast({ title: "Error", description: message, variant: "destructive" as any });
    } finally {
      setEnquirySaveLoading(false);
    }
  };

  const deleteEnquiry = async () => {
    if (!enquiryDeleteTarget) return;
    setEnquiryDeleteLoading(true);
    try {
      const response = await enquiryApi.delete(enquiryDeleteTarget.id);
      if (!response.data.success) throw new Error(response.data.error || "Failed to delete enquiry.");
      setEnquiries((current) => current.filter((item) => item.id !== enquiryDeleteTarget.id));
      toast({ title: "Deleted", description: `${enquiryDeleteTarget.enquiryNumber} was deleted.` });
      setEnquiryDeleteTarget(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.response?.data?.error || error?.message || "Failed to delete related source.",
        variant: "destructive" as any,
      });
    } finally {
      setEnquiryDeleteLoading(false);
    }
  };

  const loadProjects = React.useCallback((force = false) => {
    if (!force && projectsLoaded.current) return Promise.resolve();
    if (projectsRequest.current) return projectsRequest.current;

    setProjectsLoading(true);
    setProjectsError(null);
    const request = projectApi.listAll({ isActive: true })
      .then((projectList) => {
        const seenProjectIds = new globalThis.Set<string>();
        const uniqueProjects = projectList.filter((project: { id: string }) => {
          if (seenProjectIds.has(project.id)) return false;
          seenProjectIds.add(project.id);
          return true;
        });
        setProjects(uniqueProjects);
        projectsLoaded.current = true;
      })
      .catch((error: any) => {
        console.error("Failed to load projects for Lead workflow:", error);
        setProjectsError(
          error?.response?.data?.error || error?.message || "Failed to load projects. Please try again.",
        );
      })
      .finally(() => {
        projectsRequest.current = null;
        setProjectsLoading(false);
      });
    projectsRequest.current = request;
    return request;
  }, []);

  React.useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  React.useEffect(() => {
    if (activeTab === "audit-history" && auditLogs.length === 0 && !auditLoading) {
      fetchAuditHistory(1);
    }
  }, [activeTab, auditLogs.length, auditLoading, fetchAuditHistory]);

  React.useEffect(() => {
    if (activeTab === "enquiries") {
      void fetchEnquiries();
    }
  }, [activeTab, fetchEnquiries]);

  React.useEffect(() => {
    if (siteVisitDialogOpen || revisitDialogOpen || createBookingDialogOpen || createOppDialogOpen) {
      void loadProjects();
    }
  }, [siteVisitDialogOpen, revisitDialogOpen, createBookingDialogOpen, createOppDialogOpen, loadProjects]);

  React.useEffect(() => {
    if (!createOppDialogOpen || !oppProjectId) {
      setOppUnits([]);
      setOppUnitId("");
      setOppUnitsError(null);
      return;
    }

    let cancelled = false;
    setOppUnitsLoading(true);
    setOppUnitsError(null);
    unitApi.list({ projectId: oppProjectId, status: "AVAILABLE", limit: 100 }).then((res) => {
      if (!cancelled) {
        setOppUnits(res.data.data || []);
      }
    }).catch((err) => {
      if (!cancelled) {
        setOppUnits([]);
        setOppUnitsError(err?.response?.data?.error || "Failed to load available units");
        toast({
          title: "Error",
          description: err?.response?.data?.error || "Failed to load available units",
          variant: "destructive" as any,
        });
      }
    }).finally(() => {
      if (!cancelled) setOppUnitsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [createOppDialogOpen, oppProjectId, toast]);

  React.useEffect(() => {
    if (!createBookingDialogOpen || !bookingProjectId) {
      setBookingUnits([]);
      setBookingUnitId("");
      setBookingUnitsError(null);
      return;
    }

    let cancelled = false;
    setBookingUnitsLoading(true);
    setBookingUnitsError(null);
    unitApi.list({ projectId: bookingProjectId, status: "AVAILABLE", limit: 100 }).then((res) => {
      if (!cancelled) setBookingUnits(res.data.data || []);
    }).catch((err) => {
      if (!cancelled) {
        setBookingUnits([]);
        setBookingUnitsError(err?.response?.data?.error || "Failed to load available units");
        toast({
          title: "Error",
          description: err?.response?.data?.error || "Failed to load available units",
          variant: "destructive" as any,
        });
      }
    }).finally(() => {
      if (!cancelled) setBookingUnitsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [createBookingDialogOpen, bookingProjectId, toast]);

  const profileNameLower = profile?.name?.toLowerCase() || "";
  const isAdminOrManager = profileNameLower.includes("admin") || profileNameLower.includes("manager");
  const canEditLead =
    hasPermission("Lead", "edit") ||
    hasEffectivePermission("LEAD_UPDATE") ||
    hasEffectivePermission("FULL_SYSTEM_ACCESS") ||
    isAdminOrManager;
  const canChangeOwner = hasEffectivePermission("LEAD_ASSIGN");

  const status = lead?.status || "";

  const isLeadCustomField = (fieldName: string) => {
    const field = fields.find((item) => item.name === fieldName);
    return Boolean(
      field &&
      field.editable &&
      !field.isStandardField &&
      !field.isSystemField
    );
  };
  const openOwnerDialog = async () => {
    if (!lead) return;
    setIsActionLoading(true);
    try {
      const response = await leadApi.ownerCandidates(lead.id);
      setOwnerCandidates(response.data.data || []);
      setNewOwnerId("");
      setOwnerChangeReason("");
      setOwnerDialogOpen(true);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || "Failed to load eligible owners",
        variant: "destructive" as any,
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const changeOwner = async () => {
    if (!newOwnerId) {
      toast({ title: "Validation", description: "New owner is required", variant: "destructive" as any });
      return;
    }
    if (!ownerChangeReason.trim()) {
      toast({ title: "Validation", description: "Reason is required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      await leadApi.changeOwner(leadId, newOwnerId, ownerChangeReason.trim());
      setOwnerDialogOpen(false);
      toast({ title: "Success", description: "Lead owner changed successfully" });
      await fetchLead();
      if (activeTab === "audit-history") await fetchAuditHistory(1);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || "Failed to change lead owner",
        variant: "destructive" as any,
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const startEdit = () => {
    if (!lead) return;
    const editableData: Record<string, any> = {};
    for (const field of LEAD_EDITABLE_FIELDS) {
      if (lead[field] !== undefined) editableData[field] = lead[field];
    }
    for (const field of fields) {
      if (isLeadCustomField(field.name) && lead.customFields?.[field.name] !== undefined) {
        editableData[field.name] = lead.customFields[field.name];
      }
    }
    editableData.projectId = lead.projectId ?? lead.project?.id ?? null;
    setEditData(editableData);
    setEditFieldErrors({});
    setActiveTab("overview");
    setIsEditing(true);
    void loadProjects();
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditData({});
    setEditFieldErrors({});
  };

  const saveEdit = async () => {
    if (!lead) return;
    setEditFieldErrors({});
    if (!editData.lastName?.trim()) {
      toast({ title: "Validation", description: "Last name is required", variant: "destructive" as any });
      return;
    }
    if (!editData.company?.trim()) {
      toast({ title: "Validation", description: "Company is required", variant: "destructive" as any });
      return;
    }
    if (!String(editData.phone ?? "").trim()) {
      setEditFieldErrors({ phone: "Phone number is required." });
      toast({ title: "Validation", description: "Phone number is required.", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const payload: Record<string, any> = {};
      for (const key of LEAD_EDITABLE_FIELDS) {
        const value = editData[key];
        if (value !== null && value !== undefined && value !== "") {
          payload[key] = value;
        }
      }
      const customFields: Record<string, unknown> = {};
      for (const field of fields) {
        if (
          isLeadCustomField(field.name) &&
          Object.prototype.hasOwnProperty.call(editData, field.name)
        ) {
          const value = editData[field.name];
          customFields[field.name] = value === "" ? null : value;
        }
      }
      if (Object.keys(customFields).length > 0) payload.customFields = customFields;
      if (editData.projectId === null) payload.projectId = null;
      if (payload.status === lead.status) delete payload.status;
      await leadApi.update(leadId, payload);
      toast({ title: "Success", description: "Lead updated successfully" });
      setIsEditing(false);
      setEditData({});
      setEditFieldErrors({});
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err?.response?.data?.message || err?.message || "Failed to update lead";
      if (message === "Phone number already exists for another lead.") {
        setEditFieldErrors({ phone: message });
      }
      toast({ title: "Error", description: message, variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePushToSVC = async () => {
    if (!pushSvcReason.trim()) {
      toast({ title: "Validation", description: "A reason/note is required", variant: "destructive" as any });
      return;
    }
    if (!lead?.projectId && !lead?.project?.id) {
      toast({
        title: "Project required",
        description: "Select a project in Lead Information before pushing this lead to SVC.",
        variant: "destructive" as any,
      });
      return;
    }
    setIsActionLoading(true);
    let updatedLead: LeadData;
    try {
      const response = await leadApi.pushToSVC(leadId, { reason: pushSvcReason });
      if (!response.data?.success || !response.data.data) {
        throw new Error(response.data?.error || response.data?.message || "Push to SVC failed");
      }
      updatedLead = response.data.data;
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || err?.message || "Push to SVC failed",
        variant: "destructive" as any,
      });
      setIsActionLoading(false);
      return;
    }

    setLead((currentLead) => currentLead ? { ...currentLead, ...updatedLead } : updatedLead);
    toast({ title: "Success", description: "Lead pushed to SVC successfully." });
    setPushSvcDialogOpen(false);
    setPushSvcReason("");
    if (activeTab === "audit-history") {
      fetchAuditHistory(1);
    }
    setIsActionLoading(false);
  };

  const beginPushSvcLeadEdit = () => {
    if (!lead || !canEditLead) return;
    setPushSvcLeadDraft({
      firstName: lead.firstName || "",
      lastName: lead.lastName || "",
      phone: lead.phone || lead.mobile || "",
      company: lead.company || "",
      email: lead.email || "",
      projectId: lead.projectId || lead.project?.id || "",
    });
    setPushSvcLeadEditing(true);
    void loadProjects();
  };

  const savePushSvcLeadEdit = async () => {
    if (!lead || isActionLoading) return;
    if (!pushSvcLeadDraft.lastName.trim()) {
      toast({ title: "Validation", description: "Last name is required.", variant: "destructive" as any });
      return;
    }
    if (!pushSvcLeadDraft.company.trim()) {
      toast({ title: "Validation", description: "Company is required.", variant: "destructive" as any });
      return;
    }
    if (!pushSvcLeadDraft.phone.trim()) {
      toast({ title: "Validation", description: "Phone number is required.", variant: "destructive" as any });
      return;
    }

    setIsActionLoading(true);
    try {
      const response = await leadApi.update(leadId, {
        firstName: pushSvcLeadDraft.firstName.trim(),
        lastName: pushSvcLeadDraft.lastName.trim(),
        phone: pushSvcLeadDraft.phone.trim(),
        company: pushSvcLeadDraft.company.trim(),
        email: pushSvcLeadDraft.email.trim(),
        projectId: pushSvcLeadDraft.projectId || null,
      });
      if (!response.data?.success || !response.data.data) {
        throw new Error(response.data?.error || response.data?.message || "Failed to update lead information.");
      }
      setLead((currentLead) => currentLead ? { ...currentLead, ...response.data.data } : response.data.data);
      setPushSvcLeadEditing(false);
      toast({ title: "Success", description: "Lead information updated successfully." });
      if (activeTab === "audit-history") {
        void fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || err?.message || "Failed to update lead information.",
        variant: "destructive" as any,
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleMoveToRecovery = async () => {
    if (!recoveryReason) {
      toast({ title: "Validation", description: "Please select a reason", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      await leadApi.moveToRecovery(leadId, { recoveryReason, note: recoveryNote || undefined });
      toast({ title: "Success", description: "Lead moved to recovery" });
      setRecoveryDialogOpen(false);
      setRecoveryReason("");
      setRecoveryNote("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to move to recovery", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleScheduleSiteVisit = async () => {
    if (!svProjectId.trim()) {
      toast({ title: "Validation", description: "A project is required", variant: "destructive" as any });
      return;
    }
    if (!svNote.trim()) {
      toast({ title: "Validation", description: "Note/reason is required", variant: "destructive" as any });
      return;
    }
    if (!svDate || !svTime) {
      toast({ title: "Validation", description: "Visit date and time are required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const scheduledAt = new Date(`${svDate}T${svTime}`).toISOString();
      const response = await leadApi.scheduleSiteVisit(leadId, { scheduledAt, notes: svNote, projectId: svProjectId });
      const result = response.data?.data;
      if (!response.data?.success || !result?.lead || !result?.siteVisit) {
        throw new Error(response.data?.error || response.data?.message || "Failed to schedule site visit");
      }
      setLead((currentLead) => ({
        ...(currentLead || result.lead),
        ...result.lead,
        siteVisits: [
          result.siteVisit,
          ...(currentLead?.siteVisits || []).filter((siteVisit: any) => siteVisit.id !== result.siteVisit.id),
        ],
      }));
      toast({ title: "Success", description: "Site visit scheduled successfully." });
      setSiteVisitDialogOpen(false);
      setSvNote("");
      setSvDate("");
      setSvTime("");
      setSvProjectId("");
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || err?.message || "Failed to schedule site visit", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateFollowUp = async () => {
    if (!followUpNote.trim() || !followUpDate || !followUpTime) {
      toast({ title: "Validation", description: "Note, date, and time are all required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const dueDate = new Date(`${followUpDate}T${followUpTime}`).toISOString();
      await followUpApi.create({ title: followUpNote, description: followUpNote, dueDate, leadId });
      toast({ title: "Success", description: "Follow-up created" });
      setFollowUpDialogOpen(false);
      setFollowUpNote("");
      setFollowUpDate("");
      setFollowUpTime("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to create follow-up", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleFollowUpStatus = async (followUp: any) => {
    setIsActionLoading(true);
    try {
      const response = followUp.isCompleted
        ? await followUpApi.reopen(followUp.id)
        : await followUpApi.complete(followUp.id);
      if (!response.data?.success) {
        throw new Error(response.data?.error || "Failed to update follow-up");
      }
      toast({
        title: followUp.isCompleted ? "Follow-up reopened" : "Follow-up completed",
        description: followUp.title || followUp.description,
      });
      await fetchLead();
    } catch (error: any) {
      toast({
        title: "Unable to update follow-up",
        description: error?.response?.data?.error || error?.message || "Please try again.",
        variant: "destructive" as any,
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!taskNote.trim() || !taskDueDate || !taskTime) {
      toast({ title: "Validation", description: "Description, due date, and time are all required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const dueDate = new Date(`${taskDueDate}T${taskTime}`).toISOString();
      await taskApi.create({ title: taskNote, description: taskNote, dueDate, leadId });
      toast({ title: "Success", description: "Task created" });
      setTaskDialogOpen(false);
      setTaskNote("");
      setTaskDueDate("");
      setTaskTime("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to create task", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateNote = async () => {
    if (!noteContent.trim()) {
      toast({ title: "Validation", description: "Note content is required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      await activityApi.create({ type: "NOTE", subject: noteSubject || "Note", description: noteContent, leadId });
      toast({ title: "Success", description: "Note added" });
      setNoteDialogOpen(false);
      setNoteContent("");
      setNoteSubject("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to add note", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const getActiveSiteVisit = () => {
    const visits = lead?.siteVisits || [];
    return (
      visits.find((sv: any) => String(sv.status).toUpperCase() === "SCHEDULED") ||
      visits[0] ||
      null
    );
  };

  const handleRevisit = async () => {
    const activeSv = getActiveSiteVisit();
    if (!revisitReason.trim()) {
      toast({ title: "Validation", description: "A reason is required for revisit", variant: "destructive" as any });
      return;
    }
    if (!revisitDate || !revisitTime) {
      toast({ title: "Validation", description: "Visit date and time are required", variant: "destructive" as any });
      return;
    }
    if (!revisitProjectId) {
      toast({ title: "Validation", description: "Project is required", variant: "destructive" as any });
      return;
    }
    if (!activeSv) {
      toast({ title: "Error", description: "No site visit found to revisit", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const scheduledAt = crmLocalDateTimeToDate(revisitDate, revisitTime).toISOString();
      await siteVisitApi.revisit(activeSv.id, {
        reason: revisitReason.trim(),
        scheduledAt,
        projectId: revisitProjectId,
        notes: revisitNote || undefined,
      });
      toast({ title: "Success", description: "Revisit site visit created" });
      setRevisitDialogOpen(false);
      setRevisitReason("");
      setRevisitDate("");
      setRevisitTime("");
      setRevisitProjectId("");
      setRevisitNote("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to create revisit", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancelSiteVisit = async () => {
    const activeSv = getActiveSiteVisit();
    if (!cancelSvReason.trim()) {
      toast({ title: "Validation", description: "A reason is required to cancel", variant: "destructive" as any });
      return;
    }
    if (!activeSv) {
      toast({ title: "Error", description: "No scheduled site visit found", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      await siteVisitApi.cancel(activeSv.id, cancelSvReason.trim());
      toast({ title: "Success", description: "Site visit cancelled" });
      setCancelSvDialogOpen(false);
      setCancelSvReason("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to cancel site visit", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCompleteSiteVisit = async () => {
    const activeSv = getActiveSiteVisit();
    if (!activeSv) {
      toast({ title: "Error", description: "No scheduled site visit found", variant: "destructive" as any });
      return;
    }
    if (!completeSvTime || !completeSvFeedback.trim() || !completeSvNotes.trim()) {
      toast({ title: "Validation", description: "Completion time, customer feedback, and notes are required", variant: "destructive" as any });
      return;
    }
    setLocationFailure("");
    setOutsideLocation(null);
    await requestAndVerifySiteVisitLocation(activeSv.id);
  };

  const requestAndVerifySiteVisitLocation = async (siteVisitId: string) => {
    setIsActionLoading(true);
    try {
      const coordinates = await getCurrentCoordinates();
      await siteVisitApi.verifyLocation(siteVisitId, coordinates);
      const response = await siteVisitApi.complete(siteVisitId, {
        completedAt: crmLocalDateTimeToDate(completeSvTime.split("T")[0], completeSvTime.split("T")[1]).toISOString(),
        customerFeedback: completeSvFeedback.trim(),
        completionNotes: completeSvNotes.trim(),
        ...coordinates,
      });
      const result = response.data.data;
      setLocationAccessDialogOpen(false);
      setLocationInstructions("");
      setLead((current) => current ? {
        ...current,
        ...(result.lead || {}),
        status: result.leadStatus || current.status,
        siteVisits: current.siteVisits?.map((visit: any) =>
          visit.id === siteVisitId ? { ...visit, ...result.siteVisit } : visit,
        ),
      } : current);
      setLocationDialogState(null);
      setOutsideLocation(null);
      setLocationFailure("");
      toast(result.salesHandoff?.pendingReason
       ? { title: "Site visit completed; Sales assignment pending", description: result.salesHandoff.pendingReason, variant: "destructive" as any }
       : { title: "Success", description: "Site visit marked as happened" });
      setCompleteSvDialogOpen(false);
      setCompleteSvFeedback("");
      setCompleteSvNotes("");
      setCompleteSvTime("");
      setCompleteSvRating("");
      if (activeTab === "audit-history") fetchAuditHistory(1);
    } catch (err: any) {
      const code = err?.response?.data?.code;
      setLocationFailure(err?.response?.data?.error || err?.message || "Failed to verify your location");
      const failureData = err?.response?.data?.data;
      if (code === "OUTSIDE_RADIUS" && Number.isFinite(failureData?.distanceMeters)) {
        setOutsideLocation({
          distanceMeters: failureData.distanceMeters,
          radiusMeters: failureData.radiusMeters,
          projectName: failureData.projectName || "the project",
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

  const handleCreateOpportunity = async () => {
    if (!oppName.trim()) {
      toast({ title: "Validation", description: "Opportunity name is required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const response = await leadApi.convert(leadId, {
        name: oppName.trim(),
        projectId: oppProjectId || undefined,
        unitId: oppUnitId || undefined,
        amount: oppAmount ? Number(oppAmount) : undefined,
        description: oppDescription || undefined,
      });
      const result = response.data.data;
      const oppNumber = result?.opportunity?.opportunityNumber;
      const ownerName = [result?.opportunity?.owner?.firstName, result?.opportunity?.owner?.lastName]
        .filter(Boolean)
        .join(" ");
      const fallbackNote = result?.ownerFallback ? " (Admin fallback)" : "";
      setLead((current) => current ? {
        ...current,
        ...(result?.lead || {}),
        status: result?.lead?.status || current.status,
        project: result?.opportunity?.project || current.project,
        opportunities: result?.opportunity
          ? [result.opportunity, ...(current.opportunities || []).filter((item: any) => item.id !== result.opportunity.id)]
          : current.opportunities,
      } : current);
      toast({
        title: "Lead converted",
        description: `${oppNumber ? `${oppNumber} created` : "Opportunity created"}${ownerName ? ` — owner: ${ownerName}` : ""}${fallbackNote}. Lead remains at Site Visit Completed until booking.`,
      });
      setCreateOppDialogOpen(false);
      setOppName("");
      setOppAmount("");
      setOppDescription("");
      setOppProjectId("");
      setOppUnitId("");
      setOppUnits([]);
      router.push("/opportunities");
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to create opportunity", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateQuotation = () => {
    if (!quoteDescription.trim() || !quoteUnitPrice) {
      toast({ title: "Validation", description: "Description and unit price are required", variant: "destructive" as any });
      return;
    }
    setCreateQuoteDialogOpen(false);
    setQuoteConfirmationOpen(true);
  };

  const handleConfirmCreateQuotation = async () => {
    setIsActionLoading(true);
    try {
      const opportunity = lead?.opportunities?.[0];
      const response = await quotationApi.create({
        leadId,
        opportunityId: opportunity?.id,
        projectId: opportunity?.projectId || lead?.siteVisits?.find((visit: any) => visit.status === "COMPLETED")?.projectId || lead?.project?.id,
        items: [
          {
            ...(opportunity?.unitId ? { unitId: opportunity.unitId } : {}),
            description: quoteDescription.trim(),
            quantity: 1,
            unitPrice: Number(quoteUnitPrice),
          },
        ],
      });
      const quotation = response.data.data;
      if (!quotation?.id) throw new Error("Quotation was created but no ID was returned");
      setQuoteConfirmationOpen(false);
      setQuoteDescription("");
      setQuoteUnitPrice("");
      try {
        const pdfResponse = await quotationApi.downloadPdf(quotation.id);
        const url = URL.createObjectURL(new Blob([pdfResponse.data], { type: "application/pdf" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${quotation.number || "quotation"}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast({ title: "Quotation downloaded", description: `${quotation.number || "Quotation"} was saved to your downloads.` });
      } catch (downloadError: any) {
        toast({ title: "Quotation created", description: downloadError?.response?.data?.error || "The PDF could not be downloaded. You can retry from the Quotations page.", variant: "destructive" as any });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to create quotation", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateBooking = async () => {
    if (!bookingProjectId || !bookingUnitId || !bookingAmount) {
      toast({ title: "Validation", description: "Project, unit, and amount are required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const oppId = lead?.opportunities?.[0]?.id;
      await bookingApi.create({
        leadId,
        opportunityId: oppId,
        projectId: bookingProjectId,
        unitId: bookingUnitId,
        ownerId: lead?.owner?.id,
        totalAmount: Number(bookingAmount),
      });
      toast({ title: "Success", description: "Booking created" });
      setCreateBookingDialogOpen(false);
      setBookingProjectId("");
      setBookingUnitId("");
      setBookingAmount("");
      setBookingUnits([]);
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to create booking", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const getWorkflowActions = (): { label: string; onClick: () => void; variant?: "default" | "outline" | "destructive" | "secondary" }[] => {
    const actions: { label: string; onClick: () => void; variant?: "default" | "outline" | "destructive" | "secondary" }[] = [];

    const prof = profile?.name || "";
    const canManageSiteVisits = prof === "SVC" && (
      hasEffectivePermission("SITE_VISIT_CREATE") || hasEffectivePermission("SITE_VISIT_UPDATE")
    );
    if (!canEditLead && !canManageSiteVisits) return actions;

    const visits = lead?.siteVisits || [];
    const activeSiteVisit =
      visits.find((sv: any) => String(sv.status).toUpperCase() === "SCHEDULED") || null;
    const latestSiteVisit = activeSiteVisit || visits[0] || null;

    const adminLike = isAdmin || isSuperAdmin || prof === "CRM Admin" || prof === "Manager";

    if (status === "INCOMING" && (prof === "Presales" || prof === "Sales Executive" || adminLike)) {
      actions.push({ label: "Push to SVC", onClick: () => setPushSvcDialogOpen(true), variant: "default" });
    }

    if (status !== "LOST" && (canEditLead || canManageSiteVisits)) {
      actions.push({ label: "Move to Recovery", onClick: () => setRecoveryDialogOpen(true), variant: "destructive" });
    }

    if (status === "PROSPECT" && (prof === "SVC" || prof === "Sales Executive" || adminLike)) {
      actions.push({ label: "Schedule Site Visit", onClick: () => setSiteVisitDialogOpen(true), variant: "default" });
    }

    if (status === "SITE_VISIT_SCHEDULED" && activeSiteVisit && (prof === "SVC" || prof === "Sales" || prof === "Sales Executive" || adminLike)) {
      actions.push({ label: "Edit Site Visit", onClick: () => router.push(`/site-visits/${activeSiteVisit.id}`), variant: "outline" });
      actions.push({ label: "Revisit", onClick: () => setRevisitDialogOpen(true), variant: "outline" });
      actions.push({ label: "Cancel Site Visit", onClick: () => setCancelSvDialogOpen(true), variant: "destructive" });
      actions.push({ label: "Complete Site Visit", onClick: () => setCompleteSvDialogOpen(true), variant: "default" });
    }

    if (status === "SITE_VISIT_HAPPENED") {
      if (latestSiteVisit) {
        actions.push({ label: "Revisit", onClick: () => setRevisitDialogOpen(true), variant: "outline" });
      }
      if ((lead?.opportunities?.length || 0) > 0) {
        actions.push({ label: "View Opportunity", onClick: () => router.push(`/opportunities/${lead?.opportunities?.[0]?.id}`), variant: "default" });
      } else if (hasEffectivePermission("OPPORTUNITY_CREATE")) {
        actions.push({
          label: "Convert",
          onClick: () => {
            setOppName(`${lead?.company || `${lead?.firstName || ""} ${lead?.lastName || ""}`.trim()} Opportunity`);
            setOppDescription(lead?.requirements || lead?.notes || "");
            const completedVisit = lead?.siteVisits?.find((visit: any) => visit.status === "COMPLETED");
            setOppProjectId(completedVisit?.project?.id || lead?.project?.id || "");
            setOppUnitId("");
            setCreateOppDialogOpen(true);
          },
          variant: "default",
        });
      }
      if (hasEffectivePermission("QUOTATION_CREATE")) {
        actions.push({ label: "Create Quotation", onClick: () => setCreateQuoteDialogOpen(true), variant: "default" });
      }
      const opportunityProjectId = lead?.opportunities?.[0]?.projectId || latestSiteVisit?.projectId || lead?.project?.id;
      if (hasEffectivePermission("BOOKING_CREATE") && (lead?.opportunities?.length || 0) > 0 && opportunityProjectId) {
        actions.push({ label: "Create Booking", onClick: () => {
          setBookingProjectId(opportunityProjectId);
          setBookingUnitId("");
          setCreateBookingDialogOpen(true);
        }, variant: "default" });
      }
    }

    if (status === "BOOKED" && (lead?.opportunities?.length || 0) > 0) {
      actions.push({ label: "View Opportunity", onClick: () => router.push(`/opportunities/${lead?.opportunities?.[0]?.id}`), variant: "default" });
      if (hasEffectivePermission("QUOTATION_CREATE")) {
        actions.push({ label: "Create Quotation", onClick: () => setCreateQuoteDialogOpen(true), variant: "default" });
      }
      const opportunityProjectId = lead?.opportunities?.[0]?.projectId || lead?.siteVisits?.find((visit: any) => visit.status === "COMPLETED")?.projectId || lead?.project?.id;
      if (hasEffectivePermission("BOOKING_CREATE") && opportunityProjectId) {
        actions.push({ label: "Create Booking", onClick: () => {
          setBookingProjectId(opportunityProjectId);
          setBookingUnitId("");
          setCreateBookingDialogOpen(true);
        }, variant: "default" });
      }
    }

    return actions;
  };

  const workflowActions = getWorkflowActions();

  const formatAuditValue = (value: any): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (value instanceof Date) return formatDateTime(value);
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const AUDIT_FIELD_LABELS: Record<string, string> = {
    ownerName: "Owner",
    previousOwnerName: "Previous Owner",
    newOwnerName: "New Owner",
    changedByName: "Changed By",
    roundRobinName: "Round Robin",
    assignmentSource: "Assignment Source",
    assignedTo: "Assigned To",
    cancellationReason: "Cancellation Reason",
    completedById: "Completed By",
    completedByName: "Completed By",
    cancelledById: "Cancelled By",
    changedById: "Changed By",
    createdBy: "Created By",
    updatedBy: "Updated By",
    assignedById: "Assigned By",
    performedById: "Performed By",
  };

  const auditFieldLabel = (field: string): string => {
    if (AUDIT_FIELD_LABELS[field]) return AUDIT_FIELD_LABELS[field];
    return field
      .replace(/Id$/, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase());
  };

  const getAuditChanges = (entry: any): { field: string; oldValue: any; newValue: any }[] => {
    const oldVals = entry.oldValues || {};
    const newVals = entry.newValues || {};
    // Never render a raw user id when its display-name sibling exists —
    // the name row is shown instead (spec: audit shows names, never raw IDs).
    const hasNameSibling = (field: string): boolean =>
      field.endsWith("Id") &&
      (`${field.slice(0, -2)}Name` in oldVals || `${field.slice(0, -2)}Name` in newVals);
    const fields = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);
    const changes: { field: string; oldValue: any; newValue: any }[] = [];

    if (entry.action === "CREATE" || entry.action === "FOLLOW_UP_CREATED" || entry.action === "TASK_CREATED" || entry.action === "NOTE_CREATED") {
      for (const field of Object.keys(newVals)) {
        if (field === "reason" || field === "note") continue;
        if (hasNameSibling(field)) continue;
        changes.push({ field, oldValue: null, newValue: newVals[field] });
      }
      return changes;
    }

    for (const field of fields) {
      if (field === "reason" || field === "note") continue;
      if (hasNameSibling(field)) continue;
      const oldV = oldVals[field];
      const newV = newVals[field];
      if (JSON.stringify(oldV ?? null) !== JSON.stringify(newV ?? null)) {
        changes.push({ field, oldValue: field in oldVals ? oldV : undefined, newValue: newV });
      }
    }
    return changes;
  };

  const getAuditReason = (entry: any): string | null => {
    const newVals = entry.newValues || {};
    return newVals.reason || newVals.note || newVals.recoveryReason || null;
  };

  const lastModifiedBy = lead?.lastModified?.by;
  const lastModifiedAt = lead?.lastModified?.at || lead?.updatedAt;
  const systemInformation = {
    record_number: lead?.leadNumber,
    owner: lead?.owner
      ? { id: lead.owner.id, name: `${lead.owner.firstName} ${lead.owner.lastName} (${lead.owner.id})`.trim() }
      : null,
    created_by: lead?.creator
      ? { id: lead.creator.id, name: `${lead.creator.firstName} ${lead.creator.lastName}`.trim() }
      : null,
    created_at: lead?.createdAt,
    updated_at: lastModifiedAt,
  };

  if (isLoading || authLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-20 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{loadError || "Lead not found"}</p>
      </div>
    );
  }

  const leadDisplayName = `${lead.firstName ? lead.firstName + " " : ""}${lead.lastName}`;
  const leadProjectOptions = lead.project && !projects.some((project) => project.id === lead.project?.id)
    ? [...projects, { ...lead.project, isActive: false }]
    : projects;
  const renderProjectLoadState = () => {
    if (projectsLoading) {
      return <p role="status" className="text-sm text-muted-foreground">Loading projects...</p>;
    }
    if (projectsError) {
      return (
        <div role="alert" className="flex items-center justify-between gap-3 text-sm text-destructive">
          <span>{projectsError}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadProjects(true)}>
            Retry
          </Button>
        </div>
      );
    }
    if (projectsLoaded.current && projects.length === 0) {
      return <p role="status" className="text-sm text-muted-foreground">No projects available for this company.</p>;
    }
    return null;
  };

  const leadProfileName = profile?.name || "";
  const isPresales = leadProfileName === "Presales";
  const isSvc = leadProfileName === "SVC";
  const isSales = leadProfileName === "Sales";
  const isCrm = leadProfileName === "CRM";
  const isAdminLike = isAdmin || isSuperAdmin || leadProfileName === "CRM Admin" || leadProfileName === "Manager";
  const showOpportunities = isSales || isCrm || isSvc || isAdminLike;
  const showAuditHistory = isAdminLike;
  const showSiteVisits = isSvc || isSales || isCrm || isAdminLike || leadProfileName === "Sales Executive" || leadProfileName === "Presales";
  const currentStatusIndex = LEAD_STATUS_PROGRESSION.findIndex((step) => step.key === status);

  const openDetail = (kind: "task" | "followup" | "note" | "activity", data: any) => {
    setDetailItem({ kind, data });
    setDetailDialogOpen(true);
  };

  return (
    <div className="space-y-3 font-sans text-[12px]">
      <Card className="overflow-hidden rounded-md border-slate-200 bg-white shadow-sm">
        <CardContent className="p-0">
          <div className="grid gap-4 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Lead Record</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h1 className="text-[20px] font-semibold leading-6 tracking-tight text-slate-900">{leadDisplayName}</h1>
                <span className="font-mono text-[12px] text-slate-600">{lead.leadNumber}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
                <div className="min-w-0">
                  <p className="text-[10px] leading-4 text-slate-500">Phone</p>
                  <p className="truncate text-[12px] font-medium leading-4 text-slate-800">{lead.phone || lead.mobile || "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] leading-4 text-slate-500">Mobile</p>
                  <p className="truncate text-[12px] font-medium leading-4 text-slate-800">{lead.mobile || "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] leading-4 text-slate-500">Owner</p>
                  <p className="truncate text-[12px] font-medium leading-4 text-slate-800">
                    {lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}` : "—"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] leading-4 text-slate-500">Project</p>
                  <p className="truncate text-[12px] font-medium leading-4 text-slate-800">{lead.project?.name || "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] leading-4 text-slate-500">Status</p>
                  <p className="truncate text-[12px] font-medium leading-4 text-slate-800">{STATUS_LABELS[status] || status}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-1.5 lg:justify-end">
              {isEditing ? (
                <>
                  <Button
                    size="sm"
                    className="h-8 px-2.5 text-[10px]"
                    onClick={saveEdit}
                    disabled={isActionLoading}
                  >
                    {isActionLoading ? (
                      <><Clock className="mr-1 h-3.5 w-3.5 animate-spin" />Saving...</>
                    ) : (
                      <><Save className="mr-1 h-3.5 w-3.5" />Save</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-[#5b9fbe] px-2.5 text-[10px] text-[#397b9b] hover:bg-sky-50 hover:text-blue-800"
                    onClick={cancelEdit}
                    disabled={isActionLoading}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />Cancel
                  </Button>
                </>
              ) : (
                <>
                  {hasEffectivePermission("FOLLOW_UP_CREATE") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-[#5b9fbe] px-2.5 text-[10px] font-medium text-[#397b9b] hover:bg-sky-50 hover:text-blue-800"
                      onClick={() => setFollowUpDialogOpen(true)}
                    >
                      <Clock className="mr-1 h-3.5 w-3.5" />Follow-up
                    </Button>
                  )}
                  {(hasPermission("Activity", "create") || hasEffectivePermission("ACTIVITY_CREATE") || isAdmin || isSuperAdmin) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-[#5b9fbe] px-2.5 text-[10px] font-medium text-[#397b9b] hover:bg-sky-50 hover:text-blue-800"
                      onClick={openCallDialog}
                    >
                      <span className="mr-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#579642]">
                        <Phone className="h-3 w-3 -rotate-[35deg] text-white" aria-hidden="true" />
                      </span>
                      Log Call
                    </Button>
                  )}
                  {workflowActions
                    .filter((action) => action.label === "Push to SVC" || action.label === "Move to Recovery")
                    .map((action) => (
                      <Button
                        key={action.label}
                        variant="outline"
                        size="sm"
                        className="h-8 border-[#5b9fbe] px-2.5 text-[10px] font-medium text-[#397b9b] hover:bg-sky-50 hover:text-blue-800"
                        onClick={action.onClick}
                        disabled={isActionLoading}
                      >
                        {action.label}
                      </Button>
                    ))}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-[#5b9fbe] px-2.5 text-[10px] font-medium text-[#397b9b] hover:bg-sky-50 hover:text-blue-800"
                      >
                        <MoreHorizontal className="mr-1 h-3.5 w-3.5" />
                        More
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-xs">
                      {canChangeOwner && (
                        <DropdownMenuItem onSelect={openOwnerDialog}>Change Owner</DropdownMenuItem>
                      )}
                      {canEditLead && (
                        <DropdownMenuItem onSelect={startEdit}>Edit Lead</DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={() => setTaskDialogOpen(true)}>New Task</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setNoteDialogOpen(true)}>Add Note</DropdownMenuItem>
                      {workflowActions
                        .filter((action) => action.label !== "Push to SVC" && action.label !== "Move to Recovery")
                        .map((action) => (
                          <DropdownMenuItem key={action.label} onSelect={action.onClick}>
                            {action.label}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>
          <div className="border-t border-slate-200 px-4 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-[12px] font-semibold text-slate-700">Lead Status</h2>
              <Badge className="h-5 rounded-sm border-0 bg-blue-500 px-2 text-[10px] font-medium text-white hover:bg-blue-500">
                {STATUS_LABELS[status] || status}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <div className="flex min-w-[760px] items-center">
                {LEAD_STATUS_PROGRESSION.map((step, idx) => {
                  const isCurrent = step.key === status;
                  const isComplete = status === "BOOKED"
                    ? idx < LEAD_STATUS_PROGRESSION.length - 2
                    : currentStatusIndex > idx;
                  return (
                    <div
                      key={step.key}
                      className={`flex h-[34px] min-w-0 flex-1 items-center justify-center gap-1.5 px-3 text-center text-[10px] font-medium ${
                        isCurrent
                          ? "bg-[#1976a8] text-white"
                          : isComplete
                            ? "bg-[#d8eaf4] text-[#397b9b]"
                            : "bg-[#edf1f5] text-slate-500"
                      }`}
                      style={{
                        clipPath: idx === 0
                          ? "polygon(0 0, calc(100% - 11px) 0, 100% 50%, calc(100% - 11px) 100%, 0 100%)"
                          : "polygon(0 0, calc(100% - 11px) 0, 100% 50%, calc(100% - 11px) 100%, 0 100%, 11px 50%)",
                        marginLeft: idx === 0 ? 0 : -7,
                      }}
                    >
                      {isCurrent && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList className="flex h-9 w-full flex-nowrap justify-start gap-0.5 overflow-x-auto rounded-md border border-slate-100 bg-[#f0f3f8] p-1">
          <TabsTrigger value="overview" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
            <User className="h-4 w-4" />Details
          </TabsTrigger>
          <TabsTrigger value="enquiries" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
            <Inbox className="h-4 w-4" />Enquiry
            {enquiries.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1.5 text-[11px]">
                {enquiries.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="followups" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
            <Clock className="h-4 w-4" />Follow Up
          </TabsTrigger>
          {showSiteVisits && (
            <TabsTrigger value="site-visits" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
              <Map className="h-4 w-4" />Site Visit
              {lead.siteVisits && lead.siteVisits.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1.5 text-[11px]">
                  {lead.siteVisits.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="bookings" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
            <FileText className="h-4 w-4" />Booking
            {leadBookings.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1.5 text-[11px]">
                {leadBookings.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="call-details" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
            <Phone className="h-4 w-4" />Call Details
          </TabsTrigger>
          <TabsTrigger value="feedbacks" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
            <StickyNote className="h-4 w-4" />Feedbacks
          </TabsTrigger>
          <TabsTrigger value="owner-history" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
            <History className="h-4 w-4" />Owner History
          </TabsTrigger>
          <TabsTrigger value="activities" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
            <History className="h-4 w-4" />Activities
          </TabsTrigger>
          <TabsTrigger value="tasks" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
            <CheckSquare className="h-4 w-4" />Tasks
          </TabsTrigger>
          {showOpportunities && (
            <TabsTrigger value="opportunities" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
              <TrendingUp className="h-4 w-4" />Opportunities
            </TabsTrigger>
          )}
          {showAuditHistory && (
            <TabsTrigger value="audit-history" className="h-7 shrink-0 gap-1.5 rounded-sm px-2.5 text-[11px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
              <FileText className="h-4 w-4" />Audit History
            </TabsTrigger>
          )}
        </TabsList>

        {/* Enquiries Tab */}
        <TabsContent value="enquiries">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/40 px-4 py-3">
              <CardTitle className="flex items-center gap-3 text-base font-semibold">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-violet-500 text-white">
                  <Monitor className="h-5 w-5" aria-hidden="true" />
                </span>
                Enquiry Sources ({enquiries.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {enquiriesLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading enquiries...</p>
              ) : enquiriesError ? (
                <div role="alert" className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {enquiriesError}
                </div>
              ) : enquiries.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="min-w-48 font-semibold">Related Source</TableHead>
                          <TableHead className="min-w-36 font-semibold">Lead Type</TableHead>
                          <TableHead className="min-w-40 font-semibold">Source</TableHead>
                          <TableHead className="min-w-52 font-semibold">Created Date</TableHead>
                          <TableHead className="w-14" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(showAllEnquiries ? enquiries : enquiries.slice(0, 1)).map((enquiry) => (
                          <TableRow key={enquiry.id}>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => router.push(`/enquiries/${enquiry.id}`)}
                                className="font-medium text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid"
                              >
                                {enquiry.enquiryNumber}
                              </button>
                            </TableCell>
                            <TableCell>
                              {formatLeadTypeLabel(enquiry.leadType)}
                            </TableCell>
                            <TableCell>{enquiry.source || "—"}</TableCell>
                            <TableCell>{formatDateTime(enquiry.createdAt)}</TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label={`Actions for ${enquiry.enquiryNumber}`}
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => void openEnquiryEditor(enquiry)}>
                                    <Edit3 className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setEnquiryDeleteTarget(enquiry)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-center border-t py-2">
                    <Button
                      type="button"
                      variant="link"
                      className="h-8 text-sm"
                      onClick={() => setShowAllEnquiries((current) => !current)}
                    >
                      {showAllEnquiries ? "Show Less" : "View All"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <Inbox className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>No enquiries recorded for this lead.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="min-w-0 space-y-6">
              {lead && layout && (
                <LayoutDrivenForm
                  objectName="Lead"
                  mode={isEditing ? "edit" : "detail"}
                  data={isEditing
                    ? { ...lead.customFields, ...lead, ...editData, ...systemInformation }
                    : { ...lead.customFields, ...lead, ...systemInformation }}
                  onChange={(field, value) => {
                    setEditData((prev) => ({ ...prev, [field]: value }));
                    setEditFieldErrors((prev) => {
                      if (!prev[field]) return prev;
                      const { [field]: _fieldError, ...rest } = prev;
                      return rest;
                    });
                  }}
                  layout={layout}
                  fields={fields}
                  projects={leadProjectOptions}
                  fieldErrors={editFieldErrors}
                  onBeginEdit={canEditLead ? () => startEdit() : undefined}
                />
              )}

              <Card className="rounded-md border-slate-200 shadow-sm">
                <CardHeader className="border-b border-sky-100 bg-[#f5faff]">
                  <CardTitle className="text-[12px] font-semibold text-slate-700">Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Created</p>
                      <p className="text-xs text-muted-foreground">{formatDate(lead!.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Last Updated</p>
                      <p className="text-xs text-muted-foreground">{formatDate(lead!.updatedAt)}</p>
                    </div>
                  </div>
                  {lead!.creator && (
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Created By</p>
                        <p className="text-xs text-muted-foreground">{lead!.creator.firstName} {lead!.creator.lastName}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Edit3 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Last Modified</p>
                      <p className="text-xs text-muted-foreground">{lastModifiedAt ? formatDateTime(lastModifiedAt) : "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        by{" "}
                        {lastModifiedBy
                          ? `${lastModifiedBy.firstName} ${lastModifiedBy.lastName}`
                          : "Unknown"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <aside className="min-w-0 space-y-4">
              <StickyNotesCard key={`${lead.id}-${stickyNotesRefresh}`} recordId={lead.id} canAdd={canEditLead} />
              <LeadActivityHistoryCard
                leadId={lead.id}
                leadName={leadDisplayName}
                refreshKey={`${lead.updatedAt}:${lead.activities?.length ?? 0}:${lead.tasks?.length ?? 0}:${lead.followUps?.length ?? 0}:${lead.siteVisits?.length ?? 0}`}
                canViewAuditHistory={showAuditHistory}
              />
            </aside>
          </div>
        </TabsContent>

        {/* Owner History Tab */}
        <TabsContent value="owner-history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Owner History</CardTitle>
            </CardHeader>
            <CardContent>
              {lead.ownerHistory && lead.ownerHistory.length > 0 ? (
                <div className="space-y-3">
                  {lead.ownerHistory.map((entry: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                      <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {entry.previousOwner && (
                            <span className="text-sm font-medium">
                              {entry.previousOwner.firstName} {entry.previousOwner.lastName}
                            </span>
                          )}
                          {entry.previousOwner && entry.newOwner && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          )}
                          {entry.newOwner && (
                            <span className="text-sm font-medium">
                              {entry.newOwner.firstName} {entry.newOwner.lastName}
                            </span>
                          )}
                          {!entry.previousOwner && entry.newOwner && (
                            <span className="text-sm text-muted-foreground">Initial Assignment</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {entry.previousProfile && <span>{entry.previousProfile}</span>}
                          {entry.previousProfile && entry.newProfile && <span>→</span>}
                          {entry.newProfile && <span>{entry.newProfile}</span>}
                        </div>
                        {entry.handoffReason && (
                          <p className="text-xs text-muted-foreground mt-1">{entry.handoffReason}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{formatDateTime(entry.startDate)}</span>
                          {entry.endDate && <span>→ {formatDateTime(entry.endDate)}</span>}
                          {!entry.endDate && <span>→ Current</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No owner history recorded</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activities Tab */}
        <TabsContent value="activities">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {lead.activities && lead.activities.length > 0 ? (
                <div className="space-y-3 text-left">
                  {lead.activities.map((activity: any, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => openDetail(activity.type === "NOTE" ? "note" : "activity", activity)}
                      className="w-full flex items-center gap-3 text-left p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <History className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm">{activity.subject || activity.description || activity.type}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(activity.createdAt)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No activities recorded yet</p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {lead.tasks && lead.tasks.length > 0 ? (
                <div className="space-y-3 text-left">
                  {lead.tasks.map((task: any, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => openDetail("task", task)}
                      className="w-full flex items-center gap-3 text-left p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm">{task.title || task.name}</p>
                        <p className="text-xs text-muted-foreground">{task.status} {task.dueDate ? `- Due ${formatDate(task.dueDate)}` : ""}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No tasks assigned</p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Follow-ups Tab */}
        <TabsContent value="followups">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b bg-muted/30 px-4 py-3">
              <CardTitle className="flex items-center gap-3 text-base font-semibold">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500 text-white">
                  <CheckSquare className="h-5 w-5" aria-hidden="true" />
                </span>
                Follow-ups ({lead.followUps?.length || 0})
              </CardTitle>
              <Button variant="outline" onClick={() => setFollowUpDialogOpen(true)}>
                New
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="min-w-48 font-semibold">Follow-up ID</TableHead>
                      <TableHead className="min-w-48 font-semibold">Subject</TableHead>
                      <TableHead className="min-w-32 font-semibold">Status</TableHead>
                      <TableHead className="min-w-48 font-semibold">Scheduled Date</TableHead>
                      <TableHead className="w-14" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lead.followUps && lead.followUps.length > 0 ? lead.followUps.map((fu: any) => (
                      <TableRow key={fu.id}>
                        <TableCell>
                          <Link href={`/follow-ups/${fu.id}`} className="font-medium text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid">
                            {fu.followUpNumber || fu.id}
                          </Link>
                        </TableCell>
                        <TableCell>{fu.title || fu.description || "—"}</TableCell>
                        <TableCell>
                          <Badge className={
                            fu.isCompleted
                              ? "bg-green-100 text-green-800"
                              : fu.isMissed
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800"
                          }>
                            {fu.isCompleted ? "Completed" : fu.isMissed ? "Missed" : "Scheduled"}
                          </Badge>
                        </TableCell>
                        <TableCell>{fu.dueDate ? formatDateTime(fu.dueDate) : "—"}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Follow-up actions" disabled={isActionLoading}>
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/follow-ups/${fu.id}`}>View Details</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => void handleFollowUpStatus(fu)}>
                                {fu.isCompleted ? "Reopen" : "Mark Complete"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                          No follow-ups scheduled.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {(lead.followUps?.length || 0) > 0 && (
                <div className="border-t py-3 text-center">
                  <Link href={`/follow-ups?leadId=${encodeURIComponent(lead.id)}`} className="text-sm font-medium text-primary hover:underline">
                    View All
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Site Visits Tab */}
        {showSiteVisits && (
        <TabsContent value="site-visits">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/40 px-4 py-3">
              <CardTitle className="flex items-center gap-3 text-base font-semibold">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500 text-white">
                  <Map className="h-5 w-5" aria-hidden="true" />
                </span>
                Site Visit ({lead.siteVisits?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="min-w-40 font-semibold">Visit Number</TableHead>
                      <TableHead className="min-w-44 font-semibold">Scheduled Date</TableHead>
                      <TableHead className="min-w-32 font-semibold">Status</TableHead>
                      <TableHead className="min-w-40 font-semibold">Project</TableHead>
                      <TableHead className="w-14" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lead.siteVisits && lead.siteVisits.length > 0 ? (
                      (showAllSiteVisits ? lead.siteVisits : lead.siteVisits.slice(0, 1)).map((sv: any) => (
                        <TableRow key={sv.id}>
                          <TableCell>
                            <Link href={`/site-visits/${sv.id}`} className="font-medium text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid">
                              {sv.siteVisitNumber || "—"}
                            </Link>
                          </TableCell>
                          <TableCell>{sv.scheduledAt ? formatDateTime(sv.scheduledAt) : sv.createdAt ? formatDateTime(sv.createdAt) : "—"}</TableCell>
                          <TableCell><Badge variant="outline">{String(sv.status || "Scheduled").replaceAll("_", " ")}</Badge></TableCell>
                          <TableCell>{sv.project?.name || "—"}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8" aria-label={`Actions for ${sv.siteVisitNumber || "site visit"}`}>
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/site-visits/${sv.id}`}>View Details</Link>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No site visits scheduled.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {(lead.siteVisits?.length || 0) > 1 && (
                <div className="border-t py-2 text-center">
                  <Button type="button" variant="link" className="h-8 text-sm" onClick={() => setShowAllSiteVisits((current) => !current)}>
                    {showAllSiteVisits ? "Show Less" : "View All"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* Bookings Tab */}
        <TabsContent value="bookings">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/40 px-4 py-3">
              <CardTitle className="flex items-center gap-3 text-base font-semibold">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500 text-white">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </span>
                Booking ({leadBookings.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {leadBookingsLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading bookings...</p>
              ) : leadBookingsError ? (
                <div role="alert" className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{leadBookingsError}</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="min-w-36 font-semibold">Booking Number</TableHead>
                          <TableHead className="min-w-40 font-semibold">Booking Date</TableHead>
                          <TableHead className="min-w-40 font-semibold">Project</TableHead>
                          <TableHead className="min-w-32 font-semibold">Unit</TableHead>
                          <TableHead className="min-w-32 font-semibold">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {leadBookings.length > 0 ? (
                          (showAllLeadBookings ? leadBookings : leadBookings.slice(0, 1)).map((booking: any) => (
                            <TableRow key={booking.id}>
                              <TableCell>
                                <Link href={`/bookings/${booking.id}`} className="font-medium text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid">
                                  {booking.number || "—"}
                                </Link>
                              </TableCell>
                              <TableCell>{booking.bookingDate ? formatDateTime(booking.bookingDate) : "—"}</TableCell>
                              <TableCell>{booking.project?.name || "—"}</TableCell>
                              <TableCell>{booking.unit?.number || "—"}</TableCell>
                              <TableCell><Badge variant="outline">{booking.status || "—"}</Badge></TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No bookings recorded.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {leadBookings.length > 1 && (
                    <div className="border-t py-2 text-center">
                      <Button type="button" variant="link" className="h-8 text-sm" onClick={() => setShowAllLeadBookings((current) => !current)}>
                        {showAllLeadBookings ? "Show Less" : "View All"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Call Details Tab */}
        <TabsContent value="call-details">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/40 px-4 py-3">
              <CardTitle className="flex items-center gap-3 text-base font-semibold">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500 text-white">
                  <Phone className="h-5 w-5" aria-hidden="true" />
                </span>
                Call Details ({callDetails.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {callDetailsLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading call details...</p>
              ) : callDetailsError ? (
                <div role="alert" className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{callDetailsError}</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="min-w-40 font-semibold">Call Details Name</TableHead>
                          <TableHead className="min-w-32 font-semibold">Call Type</TableHead>
                          <TableHead className="min-w-36 font-semibold">Call From</TableHead>
                          <TableHead className="min-w-36 font-semibold">Call To</TableHead>
                          <TableHead className="min-w-40 font-semibold">Start Time</TableHead>
                          <TableHead className="min-w-40 font-semibold">End Time</TableHead>
                          <TableHead className="min-w-28 font-semibold">Duration</TableHead>
                          <TableHead className="min-w-28 font-semibold">Status</TableHead>
                          <TableHead className="min-w-48 font-semibold">Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {callDetails.length > 0 ? (
                          (showAllCallDetails ? callDetails : callDetails.slice(0, 1)).map((call: any) => (
                            <TableRow key={call.id} className="cursor-pointer" onClick={() => openDetail("activity", call)}>
                              <TableCell className="font-medium">{call.name || call.subject || "Call"}</TableCell>
                              <TableCell>{call.callType ? call.callType.toLowerCase() === "inbound" ? "Inbound" : "Outbound" : "—"}</TableCell>
                              <TableCell>{call.callFrom || "—"}</TableCell>
                              <TableCell>{call.callTo || "—"}</TableCell>
                              <TableCell>{call.startAt ? formatDateTime(call.startAt) : "—"}</TableCell>
                              <TableCell>{call.endAt ? formatDateTime(call.endAt) : "—"}</TableCell>
                              <TableCell>{typeof call.duration === "number" ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : "—"}</TableCell>
                              <TableCell><Badge variant="outline">{call.status || "—"}</Badge></TableCell>
                              <TableCell className="max-w-72 truncate">{call.description || call.notes || "—"}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow><TableCell colSpan={9} className="h-20 text-center text-muted-foreground">No call details recorded.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {callDetails.length > 1 && (
                    <div className="border-t py-2 text-center">
                      <Button type="button" variant="link" className="h-8 text-sm" onClick={() => setShowAllCallDetails((current) => !current)}>
                        {showAllCallDetails ? "Show Less" : "View All"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feedbacks Tab */}
        <TabsContent value="feedbacks">
          {(() => {
            const feedbacks = showSiteVisits
              ? (lead.siteVisits || []).filter((visit: any) => visit.customerFeedback || visit.feedback)
              : [];
            return (
              <Card className="overflow-hidden">
                <CardHeader className="border-b bg-muted/40 px-4 py-3">
                  <CardTitle className="flex items-center gap-3 text-base font-semibold">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500 text-white">
                      <StickyNote className="h-5 w-5" aria-hidden="true" />
                    </span>
                    Feedbacks ({feedbacks.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="min-w-36 font-semibold">Visit Number</TableHead>
                          <TableHead className="min-w-56 font-semibold">Feedback</TableHead>
                          <TableHead className="min-w-24 font-semibold">Rating</TableHead>
                          <TableHead className="min-w-40 font-semibold">Visit Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {feedbacks.length > 0 ? (
                          (showAllFeedbacks ? feedbacks : feedbacks.slice(0, 1)).map((visit: any) => (
                            <TableRow key={visit.id}>
                              <TableCell>
                                <Link href={`/site-visits/${visit.id}`} className="font-medium text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid">
                                  {visit.siteVisitNumber || "—"}
                                </Link>
                              </TableCell>
                              <TableCell className="max-w-96 whitespace-normal">{visit.customerFeedback || visit.feedback}</TableCell>
                              <TableCell>{visit.rating ?? "—"}</TableCell>
                              <TableCell>{visit.completedAt || visit.scheduledAt ? formatDateTime(visit.completedAt || visit.scheduledAt) : "—"}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">No feedback recorded.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {feedbacks.length > 1 && (
                    <div className="border-t py-2 text-center">
                      <Button type="button" variant="link" className="h-8 text-sm" onClick={() => setShowAllFeedbacks((current) => !current)}>
                        {showAllFeedbacks ? "Show Less" : "View All"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* Opportunities Tab */}
        {showOpportunities && (
        <TabsContent value="opportunities">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {lead.opportunities && lead.opportunities.length > 0 ? (
                <div className="space-y-3 text-left">
                  {lead.opportunities.map((opp: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 text-left p-3 rounded-md bg-muted/50">
                      <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm">{opp.opportunityNumber ? `${opp.opportunityNumber} · ` : ""}{opp.name || opp.title || "Opportunity"}</p>
                        <p className="text-xs text-muted-foreground">
                          {opp.stage || opp.status} {opp.amount ? `- ₹${opp.amount.toLocaleString()}` : ""}
                          {opp.owner ? ` · ${opp.owner.firstName} ${opp.owner.lastName}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No opportunities created</p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* Audit History Tab */}
        {showAuditHistory && (
        <TabsContent value="audit-history">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Audit History</CardTitle>
              <p className="text-xs text-muted-foreground">
                {auditTotal} record{auditTotal === 1 ? "" : "s"} · newest first
              </p>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : auditLogs.length > 0 ? (
                <div className="space-y-3">
                  {auditLogs.map((entry: any) => {
                    const changes = getAuditChanges(entry);
                    const reason = getAuditReason(entry);
                    const userName = entry.user
                      ? `${entry.user.firstName} ${entry.user.lastName}`
                      : "System";
                    return (
                      <div key={entry.id} className="p-3 rounded-md bg-muted/50 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{entry.action}</Badge>
                            <span className="text-sm font-medium">{userName}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </div>
                        {changes.length > 0 && (
                          <div className="space-y-1">
                            {changes.map((change, idx) => (
                              <div key={idx} className="text-xs flex flex-wrap items-center gap-1">
                                <span className="font-medium">{auditFieldLabel(change.field)}:</span>
                                {change.oldValue !== undefined ? (
                                  <>
                                    <span className="text-muted-foreground">
                                      {formatAuditValue(change.oldValue)}
                                    </span>
                                    <span aria-hidden="true">→</span>
                                    <span>{formatAuditValue(change.newValue)}</span>
                                  </>
                                ) : (
                                  <span>{formatAuditValue(change.newValue)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {reason && (
                          <p className="text-xs text-muted-foreground">
                            Reason: {reason}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {auditTotalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchAuditHistory(Math.max(1, auditPage - 1))}
                        disabled={auditPage <= 1 || auditLoading}
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Page {auditPage} of {auditTotalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchAuditHistory(Math.min(auditTotalPages, auditPage + 1))}
                        disabled={auditPage >= auditTotalPages || auditLoading}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No audit history recorded</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>

      <Dialog open={ownerDialogOpen} onOpenChange={setOwnerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Lead Owner</DialogTitle>
            <DialogDescription>
              Assign this lead to an eligible active user in the current tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <span className="text-muted-foreground">Current Owner: </span>
              <span className="font-medium">
                {lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}` : "Unassigned"}
              </span>
            </div>
            <div className="space-y-2">
              <Label>New Owner *</Label>
              <Select value={newOwnerId} onValueChange={setNewOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select User" />
                </SelectTrigger>
                <SelectContent>
                  {ownerCandidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.firstName} {candidate.lastName} ({candidate.profile?.name || "—"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ownerCandidates.length === 0 && (
                <p className="text-sm text-muted-foreground">No eligible users are available.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-change-reason">Reason *</Label>
              <Textarea
                id="owner-change-reason"
                value={ownerChangeReason}
                onChange={(event) => setOwnerChangeReason(event.target.value)}
                placeholder="Enter reason"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOwnerDialogOpen(false)} disabled={isActionLoading}>
              Cancel
            </Button>
            <Button onClick={changeOwner} disabled={isActionLoading || ownerCandidates.length === 0}>
              {isActionLoading ? "Changing..." : "Change Owner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push to SVC Dialog */}
      <Dialog
        open={pushSvcDialogOpen}
        onOpenChange={(open) => {
          setPushSvcDialogOpen(open);
          if (!open) setPushSvcLeadEditing(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Push Lead to SVC</DialogTitle>
            <DialogDescription>
              This lead will move to Prospect and be assigned to an active SVC member in a round-robin queue matching the project and lead source.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-medium">Lead Information</p>
                {canEditLead && (
                  <div className="flex gap-2">
                    {pushSvcLeadEditing ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setPushSvcLeadEditing(false)}
                          disabled={isActionLoading}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={savePushSvcLeadEdit}
                          disabled={isActionLoading}
                        >
                          {isActionLoading ? "Saving..." : "Save"}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={beginPushSvcLeadEdit}
                        disabled={isActionLoading}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {pushSvcLeadEditing ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="push-svc-first-name">First Name</Label>
                    <Input
                      id="push-svc-first-name"
                      value={pushSvcLeadDraft.firstName}
                      onChange={(event) => setPushSvcLeadDraft((draft) => ({ ...draft, firstName: event.target.value }))}
                      disabled={isActionLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="push-svc-last-name">Last Name *</Label>
                    <Input
                      id="push-svc-last-name"
                      value={pushSvcLeadDraft.lastName}
                      onChange={(event) => setPushSvcLeadDraft((draft) => ({ ...draft, lastName: event.target.value }))}
                      disabled={isActionLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="push-svc-phone">Phone *</Label>
                    <Input
                      id="push-svc-phone"
                      value={pushSvcLeadDraft.phone}
                      onChange={(event) => setPushSvcLeadDraft((draft) => ({ ...draft, phone: event.target.value }))}
                      disabled={isActionLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="push-svc-company">Company *</Label>
                    <Input
                      id="push-svc-company"
                      value={pushSvcLeadDraft.company}
                      onChange={(event) => setPushSvcLeadDraft((draft) => ({ ...draft, company: event.target.value }))}
                      disabled={isActionLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="push-svc-email">Email</Label>
                    <Input
                      id="push-svc-email"
                      type="email"
                      value={pushSvcLeadDraft.email}
                      onChange={(event) => setPushSvcLeadDraft((draft) => ({ ...draft, email: event.target.value }))}
                      disabled={isActionLoading}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="push-svc-project">Project *</Label>
                    <Select
                      value={pushSvcLeadDraft.projectId}
                      onValueChange={(projectId) => setPushSvcLeadDraft((draft) => ({ ...draft, projectId }))}
                      disabled={projectsLoading || Boolean(projectsError) || isActionLoading}
                    >
                      <SelectTrigger id="push-svc-project">
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent>
                        {lead.project?.id && !projects.some((project) => project.id === lead.project?.id) && (
                          <SelectItem value={lead.project.id}>{lead.project.name} (Current)</SelectItem>
                        )}
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {projectsError && (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-destructive">{projectsError}</p>
                        <Button type="button" size="sm" variant="outline" onClick={() => void loadProjects(true)}>
                          Retry
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-2 border-t pt-2 text-muted-foreground">
                    <p>Lead Number: <span className="font-medium text-foreground">{lead.leadNumber}</span></p>
                    <p>Current Owner: <span className="font-medium text-foreground">{lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}` : "Unassigned"}</span></p>
                    <p>Current Status: <span className="font-medium text-foreground">{lead.status}</span></p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  <p>Lead Number: <span className="font-medium text-foreground">{lead.leadNumber}</span></p>
                  <p>Name: <span className="font-medium text-foreground">{`${lead.firstName || ""} ${lead.lastName || ""}`.trim()}</span></p>
                  <p>Phone: <span className="font-medium text-foreground">{lead.phone || lead.mobile || "—"}</span></p>
                  <p>Secondary Phone: <span className="font-medium text-foreground">{lead.secondaryPhone || lead.mobile || "—"}</span></p>
                  <p>Tertiary Phone: <span className="font-medium text-foreground">{lead.tertiaryPhone || "—"}</span></p>
                  <p>Company: <span className="font-medium text-foreground">{lead.company || "—"}</span></p>
                  <p>Email: <span className="font-medium text-foreground">{lead.email || "—"}</span></p>
                  <p>Owner: <span className="font-medium text-foreground">{lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}` : "Unassigned"}</span></p>
                  <p>Project: <span className="font-medium text-foreground">{lead.project?.name || "—"}</span></p>
                  <p>Status: <span className="font-medium text-foreground">{lead.status}</span></p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="push-svc-reason">Reason / Note *</Label>
              <Textarea
                id="push-svc-reason"
                placeholder="Enter reason for pushing to SVC..."
                value={pushSvcReason}
                onChange={(e) => setPushSvcReason(e.target.value)}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushSvcDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handlePushToSVC} disabled={isActionLoading || pushSvcLeadEditing || !pushSvcReason.trim()}>
              {pushSvcLeadEditing ? "Save Lead Info first" : isActionLoading ? "Pushing..." : "Push to SVC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Recovery Dialog */}
      <Dialog open={recoveryDialogOpen} onOpenChange={setRecoveryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Lead to Recovery?</DialogTitle>
            <DialogDescription>This lead will be marked as Lost and moved to the Recovery workflow.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleMoveToRecovery(); }}>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="recovery-reason">Reason *</Label>
                <Select value={recoveryReason} onValueChange={setRecoveryReason}>
                  <SelectTrigger id="recovery-reason">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECOVERY_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-note">Note (optional)</Label>
                <Textarea
                  id="recovery-note"
                  placeholder="Add any additional notes..."
                  value={recoveryNote}
                  onChange={(e) => setRecoveryNote(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRecoveryDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
              <Button variant="destructive" type="submit" disabled={isActionLoading}>
                {isActionLoading ? "Moving..." : "Move to Recovery"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Schedule Site Visit Dialog */}
      <Dialog open={siteVisitDialogOpen} onOpenChange={setSiteVisitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Site Visit</DialogTitle>
            <DialogDescription>All fields are mandatory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sv-project">Project *</Label>
              <Select value={svProjectId} onValueChange={setSvProjectId}>
                <SelectTrigger id="sv-project" disabled={projectsLoading || Boolean(projectsError) || projects.length === 0}>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {renderProjectLoadState()}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sv-note">Note / Reason *</Label>
              <Textarea
                id="sv-note"
                placeholder="Enter reason for site visit..."
                value={svNote}
                onChange={(e) => setSvNote(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sv-date">Visit Date *</Label>
                <Input
                  id="sv-date"
                  type="date"
                  value={svDate}
                  onChange={(e) => setSvDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sv-time">Visit Time *</Label>
                <Input
                  id="sv-time"
                  type="time"
                  value={svTime}
                  onChange={(e) => setSvTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSiteVisitDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button
              onClick={handleScheduleSiteVisit}
              disabled={isActionLoading || projectsLoading || Boolean(projectsError) || !projects.length || !svProjectId || !svNote.trim() || !svDate || !svTime}
            >
              {isActionLoading ? "Scheduling..." : "Schedule Visit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={callDialogOpen} onOpenChange={(open) => !callSaving && setCallDialogOpen(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log Call</DialogTitle>
            <DialogDescription>Save a call record for this lead. Notes will also be added to Sticky Notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="call-type">Call Type *</Label>
              <Select value={callType} onValueChange={(value: "INBOUND" | "OUTBOUND") => setCallType(value)}>
                <SelectTrigger id="call-type"><SelectValue placeholder="Select call type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUTBOUND">Outbound</SelectItem>
                  <SelectItem value="INBOUND">Inbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="call-from">Call From</Label>
                <Input id="call-from" maxLength={255} value={callFrom} onChange={(event) => setCallFrom(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="call-to">Call To</Label>
                <Input id="call-to" maxLength={50} value={callTo} onChange={(event) => setCallTo(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="call-executive-contact">Executive Contact No.</Label>
                <Input id="call-executive-contact" maxLength={50} value={executiveContactNo} onChange={(event) => setExecutiveContactNo(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="call-landing-number">Landing Number</Label>
                <Input id="call-landing-number" maxLength={255} value={landingNumber} onChange={(event) => setLandingNumber(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="call-opportunity">Opportunity</Label>
                <select id="call-opportunity" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={callOpportunityId} onChange={(event) => setCallOpportunityId(event.target.value)}>
                  <option value="">No opportunity</option>
                  {(lead?.opportunities || []).map((opportunity: any) => (
                    <option key={opportunity.id} value={opportunity.id}>{opportunity.name || opportunity.opportunityNumber || "Opportunity"}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="call-parent-url">Parent URL</Label>
                <Input id="call-parent-url" value={`/leads/${leadId}`} readOnly />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="call-recording-file">Recording File</Label>
                <Input id="call-recording-file" type="url" maxLength={255} placeholder="https://..." value={recordingFile} onChange={(event) => setRecordingFile(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="call-status">Status</Label>
                <select id="call-status" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={callStatus} onChange={(event) => setCallStatus(event.target.value)}>
                  <option value="COMPLETED">Completed</option>
                  <option value="NO_ANSWER">No Answer</option>
                  <option value="BUSY">Busy</option>
                  <option value="VOICEMAIL">Voicemail</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="call-start-time">Start Time *</Label>
                <Input id="call-start-time" type="datetime-local" value={callStartAt} onChange={(event) => setCallStartAt(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="call-end-time">End Time *</Label>
                <Input id="call-end-time" type="datetime-local" value={callEndAt} onChange={(event) => setCallEndAt(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="call-notes">Notes</Label>
              <Textarea id="call-notes" maxLength={5000} rows={4} placeholder="Enter call notes..." value={callNotes} onChange={(event) => setCallNotes(event.target.value)} />
              <p className="text-xs text-muted-foreground">When provided, these notes are also added to this lead&apos;s Sticky Notes.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallDialogOpen(false)} disabled={callSaving}>Cancel</Button>
            <Button onClick={() => void handleLogCall()} disabled={callSaving}>
              {callSaving ? "Saving..." : "Save Call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Follow-up Dialog */}
      <Dialog open={followUpDialogOpen} onOpenChange={setFollowUpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Follow-up</DialogTitle>
            <DialogDescription>All fields are mandatory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="fu-note">Note / Reason *</Label>
              <Textarea
                id="fu-note"
                placeholder="Enter follow-up note/reason..."
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fu-date">Date *</Label>
                <Input
                  id="fu-date"
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fu-time">Time *</Label>
                <Input
                  id="fu-time"
                  type="time"
                  value={followUpTime}
                  onChange={(e) => setFollowUpTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleCreateFollowUp} disabled={isActionLoading}>
              {isActionLoading ? "Creating..." : "Create Follow-up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>All fields are mandatory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="task-note">Description *</Label>
              <Textarea
                id="task-note"
                placeholder="Enter task description..."
                value={taskNote}
                onChange={(e) => setTaskNote(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="task-date">Due Date *</Label>
                <Input
                  id="task-date"
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-time">Time *</Label>
                <Input
                  id="task-time"
                  type="time"
                  value={taskTime}
                  onChange={(e) => setTaskTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={isActionLoading}>
              {isActionLoading ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>Note content is mandatory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="note-subject">Subject</Label>
              <Input
                id="note-subject"
                placeholder="Note subject..."
                value={noteSubject}
                onChange={(e) => setNoteSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-content">Note Content *</Label>
              <Textarea
                id="note-content"
                placeholder="Enter note content..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleCreateNote} disabled={isActionLoading || !noteContent.trim()}>
              {isActionLoading ? "Adding..." : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog for Task / Follow-up / Note / Activity */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detailItem?.data.recordType === "CALL_DETAIL" && "Call Details"}
              {detailItem?.kind === "task" && "Task Details"}
              {detailItem?.kind === "followup" && "Follow-up Details"}
              {detailItem?.kind === "note" && "Note Details"}
              {detailItem?.kind === "activity" && "Activity Details"}
            </DialogTitle>
            <DialogDescription>
              {detailItem?.data.recordType === "CALL_DETAIL" && "Full call details record"}
              {detailItem?.kind === "task" && "Full task record"}
              {detailItem?.kind === "followup" && "Full follow-up record"}
              {detailItem?.kind === "note" && "Note content and metadata"}
              {detailItem?.kind === "activity" && "Activity content and metadata"}
            </DialogDescription>
          </DialogHeader>
          {detailItem && (
            detailItem.data.recordType === "CALL_DETAIL" ? (
              <dl className="grid max-h-[60vh] gap-3 overflow-y-auto py-2 sm:grid-cols-2">
                {[
                  ["Call Details Name", detailItem.data.name],
                  ["Call From", detailItem.data.callFrom],
                  ["Call ID", detailItem.data.callId],
                  ["Call To", detailItem.data.callTo],
                  ["Call Type", detailItem.data.callType],
                  ["Case", detailItem.data.case?.leadNumber || detailItem.data.case?.lastName],
                  ["Created By", [detailItem.data.createdBy?.firstName, detailItem.data.createdBy?.lastName].filter(Boolean).join(" ")],
                  ["Duration", typeof detailItem.data.duration === "number" ? `${Math.floor(detailItem.data.duration / 60)}m ${detailItem.data.duration % 60}s` : ""],
                  ["End Time", detailItem.data.endAt ? formatDateTime(detailItem.data.endAt) : ""],
                  ["Executive Contact No.", detailItem.data.executiveContactNo],
                  ["Landing Number", detailItem.data.landingNumber],
                  ["Last Modified By", [detailItem.data.lastModifiedBy?.firstName, detailItem.data.lastModifiedBy?.lastName].filter(Boolean).join(" ")],
                  ["Lead", detailItem.data.lead?.leadNumber || detailItem.data.lead?.lastName],
                  ["Opportunity", detailItem.data.opportunity?.name || detailItem.data.opportunity?.opportunityNumber],
                  ["Owner", [detailItem.data.owner?.firstName, detailItem.data.owner?.lastName].filter(Boolean).join(" ")],
                  ["Parent ID", detailItem.data.parentId],
                  ["Parent URL", detailItem.data.parentUrl],
                  ["Recording File", detailItem.data.recordingFile],
                  ["Start Time", detailItem.data.startAt ? formatDateTime(detailItem.data.startAt) : ""],
                  ["Status", detailItem.data.status],
                  ["Notes", detailItem.data.notes],
                ].map(([label, value]) => (
                  <div key={label} className="space-y-1">
                    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                    <dd className="break-words text-sm">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {detailItem.kind === "task" || detailItem.kind === "followup" ? "Title" : "Subject"}
                </p>
                <p className="text-sm font-medium">
                  {detailItem.data.title || detailItem.data.subject || detailItem.data.description || "—"}
                </p>
              </div>
              {detailItem.data.description && detailItem.data.title && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Description</p>
                  <p className="text-sm whitespace-pre-wrap">{detailItem.data.description}</p>
                </div>
              )}
              {detailItem.data.status && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Status</span>
                  <Badge variant="outline">{detailItem.data.status}</Badge>
                </div>
              )}
              {detailItem.data.priority && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Priority</span>
                  <Badge variant="outline">{detailItem.data.priority}</Badge>
                </div>
              )}
              {detailItem.data.dueDate && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Due Date</span>
                  <span className="text-sm">{formatDateTime(detailItem.data.dueDate)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Created</span>
                <span className="text-sm">{formatDateTime(detailItem.data.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Updated</span>
                <span className="text-sm">{formatDateTime(detailItem.data.updatedAt || detailItem.data.createdAt)}</span>
              </div>
              {detailItem.data.owner && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Owner</span>
                  <span className="text-sm">{detailItem.data.owner.firstName} {detailItem.data.owner.lastName}</span>
                </div>
              )}
              {detailItem.data.user && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Created By</span>
                  <span className="text-sm">{detailItem.data.user.firstName} {detailItem.data.user.lastName}</span>
                </div>
              )}
            </div>
            )
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revisit Dialog */}
      <Dialog open={revisitDialogOpen} onOpenChange={setRevisitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Revisit Site Visit</DialogTitle>
            <DialogDescription>A reason, date, time, and project are required.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="revisit-reason">Reason *</Label>
              <Textarea
                id="revisit-reason"
                placeholder="Why is a revisit needed?"
                value={revisitReason}
                onChange={(e) => setRevisitReason(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="revisit-date">Visit Date *</Label>
                <Input
                  id="revisit-date"
                  type="date"
                  value={revisitDate}
                  onChange={(e) => setRevisitDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revisit-time">Visit Time *</Label>
                <Input
                  id="revisit-time"
                  type="time"
                  value={revisitTime}
                  onChange={(e) => setRevisitTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="revisit-project">Project *</Label>
              <Select value={revisitProjectId} onValueChange={setRevisitProjectId}>
                <SelectTrigger disabled={projectsLoading || Boolean(projectsError) || projects.length === 0}>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {renderProjectLoadState()}
            </div>
            <div className="space-y-2">
              <Label htmlFor="revisit-note">Notes</Label>
              <Textarea
                id="revisit-note"
                placeholder="Optional notes..."
                value={revisitNote}
                onChange={(e) => setRevisitNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisitDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleRevisit} disabled={isActionLoading}>
              {isActionLoading ? "Creating..." : "Create Revisit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Site Visit Dialog */}
      <Dialog open={cancelSvDialogOpen} onOpenChange={setCancelSvDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Site Visit</DialogTitle>
            <DialogDescription>A reason is required. Lead returns to Prospect.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Reason *</Label>
              <Textarea
                id="cancel-reason"
                placeholder="Why is this site visit being cancelled?"
                value={cancelSvReason}
                onChange={(e) => setCancelSvReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelSvDialogOpen(false)} disabled={isActionLoading}>Back</Button>
            <Button variant="destructive" onClick={handleCancelSiteVisit} disabled={isActionLoading}>
              {isActionLoading ? "Cancelling..." : "Cancel Site Visit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Site Visit Dialog */}
      <Dialog open={completeSvDialogOpen && !locationAccessDialogOpen} onOpenChange={setCompleteSvDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Site Visit</DialogTitle>
            <DialogDescription>Marks the site visit as happened. Lead moves to Site Visit Happened. Location access is required, and you must be within {getActiveSiteVisit()?.project?.allowedRadiusMeters || lead?.project?.allowedRadiusMeters || 100} meters of the project. To avoid repeated prompts, choose Allow while visiting this site or set Location to Allow in your browser settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="complete-time">Completion Time *</Label>
              <Input id="complete-time" type="datetime-local" value={completeSvTime} onChange={(e) => setCompleteSvTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="complete-feedback">Customer Feedback *</Label>
              <Textarea
                id="complete-feedback"
                placeholder="Client feedback..."
                value={completeSvFeedback}
                onChange={(e) => setCompleteSvFeedback(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="complete-notes">Notes *</Label>
              <Textarea id="complete-notes" value={completeSvNotes} onChange={(e) => setCompleteSvNotes(e.target.value)} />
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
                  onClick={() => void handleCompleteSiteVisit()}
                  disabled={isActionLoading}
                  className="shrink-0 border-red-300 text-red-800 hover:bg-red-100"
                >
                  {isActionLoading ? "Checking..." : "Check Location Again"}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteSvDialogOpen(false)} disabled={isActionLoading}>Back</Button>
            <Button onClick={handleCompleteSiteVisit} disabled={isActionLoading || !completeSvTime || !completeSvFeedback.trim() || !completeSvNotes.trim()}>
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

      {/* Create Opportunity Dialog */}
      <Dialog open={createOppDialogOpen} onOpenChange={setCreateOppDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Convert Lead to Opportunity</DialogTitle>
            <DialogDescription>
              {lead?.leadNumber} · {lead?.firstName || ""} {lead?.lastName || ""} · Completed Site Visit: {
                lead?.siteVisits?.find((visit: any) => visit.status === "COMPLETED")?.siteVisitNumber || "—"
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2">
              <div><span className="font-medium">Phone:</span> {lead?.phone || lead?.mobile || "—"}</div>
              <div><span className="font-medium">Email:</span> {lead?.email || "—"}</div>
              <div><span className="font-medium">Company:</span> {lead?.company || "—"}</div>
              <div><span className="font-medium">Lead Source:</span> {lead?.source || "—"}</div>
              <div><span className="font-medium">Budget:</span> {lead?.budget ?? "—"}</div>
              <div><span className="font-medium">Requirements:</span> {lead?.requirements || "—"}</div>
            </div>
            {(() => {
              const completedVisit = lead?.siteVisits?.find((visit: any) => visit.status === "COMPLETED");
              return (
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <div className="font-medium">Completed Site Visit</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>Visit Number: {completedVisit?.siteVisitNumber || "—"}</div>
                    <div>Completed At: {completedVisit?.completedAt ? formatDateTime(completedVisit.completedAt) : "—"}</div>
                    <div>Project: {completedVisit?.project?.name || lead?.project?.name || "—"}</div>
                    <div>Assigned Sales User: {completedVisit?.assignee ? `${completedVisit.assignee.firstName || ""} ${completedVisit.assignee.lastName || ""}`.trim() : "—"}</div>
                  </div>
                  <div>Customer Feedback: {completedVisit?.customerFeedback || "—"}</div>
                  <div>Completion Notes: {completedVisit?.completionNotes || "—"}</div>
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label htmlFor="opp-name">Name *</Label>
              <Input
                id="opp-name"
                placeholder="Opportunity name..."
                value={oppName}
                onChange={(e) => setOppName(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Project *</Label>
                <Select
                  value={oppProjectId}
                  onValueChange={(value) => {
                    setOppProjectId(value);
                    setOppUnitId("");
                  }}
                >
                  <SelectTrigger disabled={projectsLoading || Boolean(projectsError) || projects.length === 0}>
                    <SelectValue placeholder="Select an active project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.filter((project) => project.isActive !== false).map((project) => (
                      <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {projectsError && (
                  <p className="text-sm text-destructive">
                    {projectsError}{" "}
                    <Button type="button" variant="link" className="h-auto p-0" onClick={() => void loadProjects(true)}>Retry</Button>
                  </p>
                )}
                {!projectsLoading && !projectsError && projects.length === 0 && (
                  <p className="text-sm text-muted-foreground">No active projects are available.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={oppUnitId} onValueChange={setOppUnitId} disabled={!oppProjectId || oppUnitsLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder={oppUnitsLoading ? "Loading units..." : "Select an available unit"} />
                  </SelectTrigger>
                  <SelectContent>
                    {oppUnits.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.number}{unit.type ? ` · ${unit.type}` : ""}{unit.area ? ` · ${unit.area} sq.ft` : ""}{unit.price ? ` · ₹${unit.price}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {oppUnitsError && <p className="text-sm text-destructive">{oppUnitsError}</p>}
                {!oppUnitsLoading && !oppUnitsError && oppProjectId && oppUnits.length === 0 && (
                  <p className="text-sm text-muted-foreground">No available units for this project.</p>
                )}
              </div>
            </div>
            {oppUnitId && (() => {
              const unit = oppUnits.find((item) => item.id === oppUnitId);
              return unit ? (
                <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
                  <div><span className="font-medium">Unit Number:</span> {unit.number}</div>
                  <div><span className="font-medium">Unit Type:</span> {unit.type || "—"}</div>
                  <div><span className="font-medium">Saleable Area:</span> {unit.area ?? "—"}</div>
                  <div><span className="font-medium">Price:</span> {unit.price ?? "—"}</div>
                  <div><span className="font-medium">Status:</span> {unit.status}</div>
                </div>
              ) : null;
            })()}
            <div className="space-y-2">
              <Label htmlFor="opp-amount">Amount</Label>
              <Input
                id="opp-amount"
                type="number"
                value={oppAmount}
                onChange={(e) => setOppAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="opp-description">Description</Label>
              <Textarea
                id="opp-description"
                placeholder="Description..."
                value={oppDescription}
                onChange={(e) => setOppDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOppDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleCreateOpportunity} disabled={isActionLoading || !oppProjectId}>
              {isActionLoading ? "Creating..." : "Create Opportunity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Quotation Dialog */}
      <Dialog open={createQuoteDialogOpen} onOpenChange={setCreateQuoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Quotation</DialogTitle>
            <DialogDescription>Description and unit price are required.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="quote-description">Description *</Label>
              <Input
                id="quote-description"
                placeholder="Line item description..."
                value={quoteDescription}
                onChange={(e) => setQuoteDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-unit-price">Unit Price *</Label>
              <Input
                id="quote-unit-price"
                type="number"
                value={quoteUnitPrice}
                onChange={(e) => setQuoteUnitPrice(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateQuoteDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleCreateQuotation} disabled={isActionLoading}>
              {isActionLoading ? "Creating..." : "Create Quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quoteConfirmationOpen} onOpenChange={setQuoteConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm quotation</DialogTitle>
            <DialogDescription>
              Generate the property investment quotation using the Standard 1-Month 10-90 payment plan, then download the PDF to this device?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setQuoteConfirmationOpen(false);
              setCreateQuoteDialogOpen(true);
            }} disabled={isActionLoading}>Back</Button>
            <Button onClick={handleConfirmCreateQuotation} disabled={isActionLoading}>
              {isActionLoading ? "Generating..." : "Confirm & Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Booking Dialog */}
      <Dialog open={createBookingDialogOpen} onOpenChange={setCreateBookingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Booking</DialogTitle>
            <DialogDescription>Project, unit, and amount are required.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="booking-project">Project *</Label>
              <Select value={bookingProjectId} onValueChange={(value) => {
                setBookingProjectId(value);
                setBookingUnitId("");
              }}>
                <SelectTrigger disabled={projectsLoading || Boolean(projectsError) || projects.length === 0}>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-unit">Unit *</Label>
              <Select value={bookingUnitId} onValueChange={setBookingUnitId} disabled={!bookingProjectId || bookingUnitsLoading || bookingUnits.length === 0}>
                <SelectTrigger id="booking-unit">
                  <SelectValue placeholder={bookingUnitsLoading ? "Loading units..." : "Select an available unit"} />
                </SelectTrigger>
                <SelectContent>
                  {bookingUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.number}{unit.type ? ` · ${unit.type}` : ""}{unit.area ? ` · ${unit.area} sq.ft` : ""}{unit.price ? ` · ₹${unit.price}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bookingUnitsError && <p className="text-sm text-destructive">{bookingUnitsError}</p>}
              {!bookingUnitsLoading && !bookingUnitsError && bookingProjectId && bookingUnits.length === 0 && (
                <p className="text-sm text-muted-foreground">No available units for this project.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-amount">Total Amount *</Label>
              <Input
                id="booking-amount"
                type="number"
                value={bookingAmount}
                onChange={(e) => setBookingAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateBookingDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleCreateBooking} disabled={isActionLoading}>
              {isActionLoading ? "Creating..." : "Create Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingEnquiry)}
        onOpenChange={(open) => {
          if (!open && !enquirySaveLoading) {
            setEditingEnquiry(null);
            setEnquiryEditDraft(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="text-center">Edit {editingEnquiry?.enquiryNumber || "Related Source"}</DialogTitle>
            <DialogDescription className="sr-only">Update the enquiry source and contact details linked to this Lead.</DialogDescription>
          </DialogHeader>
          {enquiryEditDraft && (
            <>
              <div className="grid gap-x-8 gap-y-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Related Source</Label>
                  <Input value={editingEnquiry?.enquiryNumber || ""} disabled />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Lead Type</Label>
                  <Select value={enquiryEditDraft.leadType} onValueChange={(value) => updateEnquiryDraft("leadType", value)}>
                    <SelectTrigger><SelectValue placeholder="Select Lead Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ORIGINAL">Fresh</SelectItem>
                      <SelectItem value="RE_OPENED">Re-Opened</SelectItem>
                      <SelectItem value="RE_ENGAGED">Re-Engaged</SelectItem>
                      <SelectItem value="ADDITIONAL">Additional</SelectItem>
                      <SelectItem value="OUTSIDE_REENGAGEMENT_WINDOW">Outside Re-Engagement Window</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Lead ID</Label>
                  <Input value={lead?.leadNumber || lead?.id || ""} disabled />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Source <span className="text-destructive">*</span></Label>
                  <Input value={enquiryEditDraft.source} onChange={(event) => updateEnquiryDraft("source", event.target.value)} maxLength={120} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Campaign</Label>
                  <Input
                    value={enquiryEditDraft.campaign}
                    onChange={(event) => {
                      updateEnquiryDraft("campaign", event.target.value);
                      updateEnquiryDraft("campaignId", "");
                    }}
                    maxLength={160}
                  />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Allocated Project</Label>
                  <Select
                    value={enquiryEditDraft.projectId || "__no_project__"}
                    onValueChange={(value) => updateEnquiryDraft("projectId", value === "__no_project__" ? "" : value)}
                  >
                    <SelectTrigger disabled={enquiryEditProjectsLoading}>
                      <SelectValue placeholder={enquiryEditProjectsLoading ? "Loading projects..." : "Select project"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__no_project__">No Project</SelectItem>
                      {enquiryEditProjects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Sub Source</Label>
                  <Input value={enquiryEditDraft.subSource} onChange={(event) => updateEnquiryDraft("subSource", event.target.value)} maxLength={120} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Sub Campaign</Label>
                  <Input
                    value={enquiryEditDraft.subCampaign}
                    onChange={(event) => {
                      updateEnquiryDraft("subCampaign", event.target.value);
                      updateEnquiryDraft("subCampaignId", "");
                    }}
                    maxLength={160}
                  />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Country Code</Label>
                  <Input value={enquiryEditDraft.countryCode} onChange={(event) => updateEnquiryDraft("countryCode", event.target.value)} maxLength={8} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Phone</Label>
                  <Input type="tel" value={enquiryEditDraft.phone} onChange={(event) => updateEnquiryDraft("phone", event.target.value)} maxLength={64} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Secondary Country Code</Label>
                  <Input value={enquiryEditDraft.secondaryCountryCode} onChange={(event) => updateEnquiryDraft("secondaryCountryCode", event.target.value)} maxLength={8} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Secondary Phone</Label>
                  <Input type="tel" value={enquiryEditDraft.secondaryPhone} onChange={(event) => updateEnquiryDraft("secondaryPhone", event.target.value)} maxLength={64} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Tertiary Country Code</Label>
                  <Input value={enquiryEditDraft.tertiaryCountryCode} onChange={(event) => updateEnquiryDraft("tertiaryCountryCode", event.target.value)} maxLength={8} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Tertiary Phone</Label>
                  <Input type="tel" value={enquiryEditDraft.tertiaryPhone} onChange={(event) => updateEnquiryDraft("tertiaryPhone", event.target.value)} maxLength={64} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Email</Label>
                  <Input type="email" value={enquiryEditDraft.email} onChange={(event) => updateEnquiryDraft("email", event.target.value)} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Secondary Email</Label>
                  <Input type="email" value={enquiryEditDraft.secondaryEmail} onChange={(event) => updateEnquiryDraft("secondaryEmail", event.target.value)} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Tertiary Email</Label>
                  <Input type="email" value={enquiryEditDraft.tertiaryEmail} onChange={(event) => updateEnquiryDraft("tertiaryEmail", event.target.value)} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Medium</Label>
                  <Input value={enquiryEditDraft.medium} onChange={(event) => updateEnquiryDraft("medium", event.target.value)} maxLength={120} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Channel Partner</Label>
                  <Input value={enquiryEditDraft.channelPartner} onChange={(event) => updateEnquiryDraft("channelPartner", event.target.value)} maxLength={160} />
                </div>
                <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] items-center gap-3">
                  <Label>Enquiry Date</Label>
                  <Input type="datetime-local" value={enquiryEditDraft.enquiryDate} onChange={(event) => updateEnquiryDraft("enquiryDate", event.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="related-source-description">Enquiry Details</Label>
                  <Textarea
                    id="related-source-description"
                    className="mt-2"
                    value={enquiryEditDraft.description}
                    onChange={(event) => updateEnquiryDraft("description", event.target.value)}
                    maxLength={5000}
                    rows={3}
                  />
                </div>
                {enquiryEditProjectsLoading && <p className="text-sm text-muted-foreground sm:col-span-2">Loading projects...</p>}
                {enquiryEditError && (
                  <p role="alert" className="text-sm text-destructive sm:col-span-2">{enquiryEditError}</p>
                )}
              </div>
              <DialogFooter className="border-t bg-muted/30 px-6 py-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingEnquiry(null);
                    setEnquiryEditDraft(null);
                  }}
                  disabled={enquirySaveLoading}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={() => void saveEnquiryEdits()} disabled={enquirySaveLoading || !enquiryEditDraft.source.trim()}>
                  {enquirySaveLoading ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(enquiryDeleteTarget)} onOpenChange={(open) => {
        if (!open && !enquiryDeleteLoading) setEnquiryDeleteTarget(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete related source?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {enquiryDeleteTarget?.enquiryNumber || "this enquiry"} from this Lead. The main Lead will not be deleted, and this action will be recorded in audit history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enquiryDeleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void deleteEnquiry();
              }}
              disabled={enquiryDeleteLoading}
            >
              {enquiryDeleteLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}