"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { leadApi, projectApi, userApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: string;
  name: string;
}

interface SalesUser {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  isActive?: boolean;
  profile?: { name: string } | null;
}

const SOURCE_OPTIONS = [
  { label: "Website", value: "WEBSITE" },
  { label: "Referral", value: "REFERRAL" },
  { label: "Cold Call", value: "COLD_CALL" },
  { label: "Advertisement", value: "ADVERTISEMENT" },
  { label: "Walk-in", value: "WALK_IN" },
  { label: "Portal", value: "PORTAL" },
  { label: "Instagram", value: "INSTAGRAM" },
  { label: "Twitter", value: "TWITTER" },
  { label: "WhatsApp", value: "WHATSAPP" },
  { label: "YouTube", value: "YOUTUBE" },
  { label: "Other", value: "OTHER" },
];

const LEAD_INTEREST_OPTIONS = [
  { label: "Prospect", value: "PROSPECT" },
  { label: "Hot", value: "HOT" },
  { label: "Warm", value: "WARM" },
  { label: "Unable to Connect", value: "UNABLE_TO_CONNECT" },
  { label: "Dropped", value: "DROPPED" },
  { label: "Cold", value: "COLD" },
];

const COUNTRY_OPTIONS = [
  { name: "India", code: "91" },
  { name: "United States", code: "1" },
  { name: "United Kingdom", code: "44" },
  { name: "United Arab Emirates", code: "971" },
  { name: "Australia", code: "61" },
  { name: "Canada", code: "1" },
  { name: "Singapore", code: "65" },
];

const CONTROL_CLASS = "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {required && <span className="mr-1 text-destructive">*</span>}
        {label}
      </Label>
      {children}
    </div>
  );
}

export default function NewLeadPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [salesUsers, setSalesUsers] = React.useState<SalesUser[]>([]);
  const [formData, setFormData] = React.useState({
    salutation: "",
    firstName: "",
    lastName: "",
    phone: "",
    secondaryPhone: "",
    country: "India",
    countryCode: "91",
    email: "",
    secondaryEmail: "",
    source: "",
    projectId: "",
    leadInterest: "",
    campaign: "",
    subCampaign: "",
    salesUserId: "",
  });

  React.useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      try {
        const [projectsResponse, usersResponse] = await Promise.all([
          projectApi.listAll({ isActive: true }),
          userApi.list({ limit: 200, isActive: true }),
        ]);
        const userResponseData = usersResponse.data.data;
        const users = Array.isArray(userResponseData)
          ? userResponseData
          : [];
        if (active) {
          setProjects(projectsResponse);
          setSalesUsers(
            (users as SalesUser[]).filter(
              (user) => user.isActive !== false && /^sales(?:\b|$)/i.test(user.profile?.name || ""),
            ),
          );
        }
      } catch (reason: any) {
        if (active) {
          const message = reason?.response?.data?.error || reason?.message || "Unable to load lead form options.";
          setError(message);
          toast({ title: "Error", description: message, variant: "destructive" });
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadOptions();
    return () => {
      active = false;
    };
  }, [toast]);

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const handleCountryChange = (country: string) => {
    const selected = COUNTRY_OPTIONS.find((option) => option.name === country);
    setFormData((current) => ({
      ...current,
      country,
      countryCode: selected?.code || current.countryCode,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const missing = [
      ["lastName", "Last Name"],
      ["phone", "Primary Phone"],
      ["source", "Lead Source"],
      ["projectId", "Project Name"],
      ["leadInterest", "Lead Interest"],
      ["campaign", "Campaign"],
      ["subCampaign", "Sub Campaign"],
    ].filter(([key]) => !formData[key as keyof typeof formData].trim());
    if (missing.length) {
      setError(`${missing.map(([, label]) => label).join(", ")} ${missing.length === 1 ? "is" : "are"} required.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const displayName = [formData.firstName.trim(), formData.lastName.trim()].filter(Boolean).join(" ");
      const response = await leadApi.create({
        salutation: formData.salutation || undefined,
        firstName: formData.firstName.trim() || undefined,
        lastName: formData.lastName.trim(),
        company: displayName,
        phone: formData.phone.trim(),
        secondaryPhone: formData.secondaryPhone.trim() || undefined,
        country: formData.country,
        countryCode: formData.countryCode,
        email: formData.email.trim() || undefined,
        secondaryEmail: formData.secondaryEmail.trim() || undefined,
        source: formData.source,
        projectId: formData.projectId,
        leadInterest: formData.leadInterest,
        campaign: formData.campaign.trim(),
        subCampaign: formData.subCampaign.trim(),
        salesUserId: formData.salesUserId || undefined,
        status: "NEW",
      });
      const responseData: { success: boolean; error?: string; action?: string } = response.data;
      if (!responseData.success) {
        throw new Error(responseData.error || "Failed to create lead.");
      }
      toast({
        title: "Success",
        description: responseData.action === "NEW_LEAD" ? "Lead created successfully." : "Lead already exists.",
      });
      router.push("/leads");
    } catch (reason: any) {
      const message =
        reason?.response?.data?.error ||
        reason?.response?.data?.message ||
        reason?.message ||
        "Failed to create lead.";
      setError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/leads" aria-label="Back to leads">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Create Lead</h1>
          <p className="text-muted-foreground">Add a new lead</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mx-auto max-w-4xl">
          <CardHeader className="border-b text-center">
            <CardTitle className="text-lg">New Lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            {error && (
              <div role="alert" className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {isLoading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading projects and sales users...
              </div>
            ) : (
              <>
                <Field id="salutation" label="Salutation">
                  <select
                    id="salutation"
                    className={CONTROL_CLASS}
                    value={formData.salutation}
                    onChange={(event) => updateField("salutation", event.target.value)}
                  >
                    <option value="">--None--</option>
                    <option value="MR">Mr.</option>
                    <option value="MS">Ms.</option>
                    <option value="MRS">Mrs.</option>
                    <option value="DR">Dr.</option>
                    <option value="PROF">Prof.</option>
                  </select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="first-name" label="First Name">
                    <Input id="first-name" value={formData.firstName} onChange={(event) => updateField("firstName", event.target.value)} />
                  </Field>
                  <Field id="last-name" label="Last Name" required>
                    <Input id="last-name" value={formData.lastName} onChange={(event) => updateField("lastName", event.target.value)} />
                  </Field>
                  <Field id="primary-phone" label="Primary Phone" required>
                    <Input id="primary-phone" type="tel" value={formData.phone} onChange={(event) => updateField("phone", event.target.value)} />
                  </Field>
                  <Field id="secondary-phone" label="Secondary Phone">
                    <Input id="secondary-phone" type="tel" value={formData.secondaryPhone} onChange={(event) => updateField("secondaryPhone", event.target.value)} />
                  </Field>
                  <Field id="country" label="Country">
                    <select id="country" className={CONTROL_CLASS} value={formData.country} onChange={(event) => handleCountryChange(event.target.value)}>
                      {COUNTRY_OPTIONS.map((country) => <option key={country.name} value={country.name}>{country.name}</option>)}
                    </select>
                  </Field>
                  <Field id="country-code" label="Primary Country Code">
                    <select id="country-code" className={CONTROL_CLASS} value={formData.countryCode} onChange={(event) => updateField("countryCode", event.target.value)}>
                      {[...new Set(COUNTRY_OPTIONS.map((country) => country.code))].map((code) => (
                        <option key={code} value={code}>+{code}</option>
                      ))}
                    </select>
                  </Field>
                  <Field id="email" label="Email">
                    <Input id="email" type="email" value={formData.email} onChange={(event) => updateField("email", event.target.value)} />
                  </Field>
                  <Field id="secondary-email" label="Secondary Email">
                    <Input id="secondary-email" type="email" value={formData.secondaryEmail} onChange={(event) => updateField("secondaryEmail", event.target.value)} />
                  </Field>
                  <Field id="lead-source" label="Lead Source" required>
                    <select id="lead-source" className={CONTROL_CLASS} value={formData.source} onChange={(event) => updateField("source", event.target.value)}>
                      <option value="">--None--</option>
                      {SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field id="project-name" label="Project Name" required>
                    <select id="project-name" className={CONTROL_CLASS} value={formData.projectId} onChange={(event) => updateField("projectId", event.target.value)}>
                      <option value="">--None--</option>
                      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                  </Field>
                  <Field id="lead-interest" label="Lead Interest" required>
                    <select id="lead-interest" className={CONTROL_CLASS} value={formData.leadInterest} onChange={(event) => updateField("leadInterest", event.target.value)}>
                      <option value="">--None--</option>
                      {LEAD_INTEREST_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field id="campaign" label="Campaign" required>
                    <Input id="campaign" placeholder="Search Campaigns..." value={formData.campaign} onChange={(event) => updateField("campaign", event.target.value)} />
                  </Field>
                  <Field id="sub-campaign" label="Sub Campaign" required>
                    <Input id="sub-campaign" placeholder="Search Sub Campaigns..." value={formData.subCampaign} onChange={(event) => updateField("subCampaign", event.target.value)} />
                  </Field>
                  <Field id="sales-user" label="Sales User">
                    <select id="sales-user" className={CONTROL_CLASS} value={formData.salesUserId} onChange={(event) => updateField("salesUserId", event.target.value)}>
                      <option value="">--Auto assign--</option>
                      {salesUsers.map((salesUser) => (
                        <option key={salesUser.id} value={salesUser.id}>
                          {[salesUser.firstName, salesUser.lastName].filter(Boolean).join(" ")}
                          {salesUser.profile?.name ? ` (${salesUser.profile.name})` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t bg-muted/20 p-4">
            <Button type="button" variant="outline" onClick={() => router.push("/leads")} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isLoading}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
