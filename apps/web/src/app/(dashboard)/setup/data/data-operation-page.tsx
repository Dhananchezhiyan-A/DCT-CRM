"use client";

import { useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { dataAdministrationApi, objectDefinitionApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function DataOperationPage({ mode }: { mode: "import" | "export" }) {
  const { hasEffectivePermission, hasFullAccess } = useAuth();
  const { toast } = useToast();
  const permission = mode === "import" ? "DATA_IMPORT" : "DATA_EXPORT";
  const allowed = hasFullAccess || hasEffectivePermission(permission);
  const [objects, setObjects] = useState<{ name: string; label: string; isActive?: boolean }[]>([]);
  const [fields, setFields] = useState<{ name: string; label: string; required?: boolean }[]>([]);
  const [objectName, setObjectName] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [csv, setCsv] = useState("");
  const [csvError, setCsvError] = useState("");
  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);

  useEffect(() => {
    objectDefinitionApi.list().then((response) => {
      const available = (response.data.data || []).filter((object: { name: string; label: string; isActive?: boolean }) => object.isActive !== false);
      setObjects(available);
    }).catch((error: any) => {
      toast({ title: "Unable to load objects", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    }).finally(() => setMetadataLoading(false));
  }, [toast]);

  useEffect(() => {
    if (!objectName) {
      setFields([]);
      setSelectedFields([]);
      return;
    }
    objectDefinitionApi.fields(objectName).then((response) => {
      const available = (response.data.data || []).filter((field: { name: string; label: string; required?: boolean; isActive?: boolean; isSystemField?: boolean }) => field.isActive !== false && field.isSystemField !== true);
      setFields(available);
      setSelectedFields(available.filter((field: { name: string; label: string; required?: boolean; isActive?: boolean; isSystemField?: boolean }) => field.required).map((field: { name: string }) => field.name));
    }).catch((error: any) => {
      setFields([]);
      setSelectedFields([]);
      toast({ title: "Unable to load fields", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    });
  }, [objectName, toast]);

  const runImport = async () => {
    if (csvError) {
      toast({ title: "Invalid CSV", description: csvError, variant: "destructive" as any });
      return;
    }
    const firstRowFields = csv.split(/\r?\n/).find((row) => row.trim())?.split(",").map((field) => field.trim().replace(/^"|"$/g, "")) || [];
    const missingHeaders = selectedFields.filter((field) => !firstRowFields.includes(field));
    if (missingHeaders.length > 0) {
      const message = "The first CSV row must be the header containing the selected field names.";
      setCsvError(message);
      toast({ title: "Invalid CSV", description: message, variant: "destructive" as any });
      return;
    }
    try {
      setLoading(true);
      const response = await dataAdministrationApi.import(objectName, selectedFields, csv);
      toast({ title: "Import complete", description: `${response.data.data?.count ?? "The CSV"} records processed.` });
    } catch (error: any) {
      toast({ title: "Import failed", description: error?.response?.data?.error || error.message, variant: "destructive" as any });
    } finally {
      setLoading(false);
    }
  };

  const requiredFields = fields.filter((field) => field.required);
  const missingRequiredFields = requiredFields.filter((field) => !selectedFields.includes(field.name));

  const runExport = async () => {
    try {
      setLoading(true);
      const response = await dataAdministrationApi.export(objectName, { fields: selectedFields.join(",") });
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${objectName || "crm-data"}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "The data file is ready." });
    } catch (error: any) {
      toast({ title: "Export failed", description: error?.response?.data?.error || error.message, variant: "destructive" as any });
    } finally {
      setLoading(false);
    }
  };

  if (!allowed) {
    return <div className="rounded-lg border p-6"><h2 className="font-medium">Access required</h2><p className="mt-2 text-sm text-muted-foreground">Ask an administrator to assign the {permission} permission through a Permission Set.</p></div>;
  }

  return <div className="max-w-2xl space-y-5 rounded-lg border bg-card p-6">
    <div><h2 className="font-medium">{mode === "import" ? "Import data" : "Export data"}</h2><p className="mt-1 text-sm text-muted-foreground">{mode === "import" ? "Select an object and fields, then upload a CSV file." : "Select an object and fields to download as CSV."}</p></div>
    <div className="space-y-2"><label htmlFor="data-object" className="text-sm font-medium">Object</label><select id="data-object" value={objectName} onChange={(event) => setObjectName(event.target.value)} disabled={metadataLoading} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="">Select an object</option>{objects.map((object) => <option key={object.name} value={object.name}>{object.label} ({object.name})</option>)}</select></div>
    <fieldset className="space-y-3"><legend className="text-sm font-medium">Fields</legend>{!objectName ? <p className="text-sm text-muted-foreground">Select an object first.</p> : fields.length === 0 ? <p className="text-sm text-muted-foreground">No fields available.</p> : <><div><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Required fields</p><div className="grid gap-2 sm:grid-cols-2">{fields.filter((field) => field.required).map((field) => <label key={field.name} className="flex items-center gap-2 text-sm"><input type="checkbox" checked disabled />{field.label} <span className="text-muted-foreground">({field.name})</span><span className="text-xs font-medium text-amber-700">Required</span></label>)}</div>{requiredFields.length === 0 && <p className="text-sm text-muted-foreground">No required fields configured.</p>}</div><div><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Optional fields</p><div className="grid gap-2 sm:grid-cols-2">{fields.filter((field) => !field.required).map((field) => <label key={field.name} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedFields.includes(field.name)} onChange={(event) => setSelectedFields((current) => event.target.checked ? [...current, field.name] : current.filter((name) => name !== field.name))} />{field.label} <span className="text-muted-foreground">({field.name})</span></label>)}</div></div></>}</fieldset>
    {mode === "import" && missingRequiredFields.length > 0 && <p className="text-sm text-destructive">Please select all required fields before continuing.</p>}
    {mode === "import" && <div className="space-y-2"><label htmlFor="data-csv" className="text-sm font-medium">CSV file</label><Input id="data-csv" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; file.text().then((content) => { const rows = content.split(/\r?\n/).filter((row) => row.trim()); setCsv(content); setCsvError(rows.length < 2 ? "CSV must contain a header row followed by at least one data row." : ""); }); }} />{csvError && <p className="text-sm text-destructive">{csvError}</p>}</div>}
    <Button onClick={mode === "import" ? runImport : runExport} disabled={loading || !objectName || selectedFields.length === 0 || missingRequiredFields.length > 0 || (mode === "import" && !csv)}><>{mode === "import" ? <Upload className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}{loading ? "Processing..." : mode === "import" ? "Import CSV" : "Export CSV"}</></Button>
  </div>;
}