"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import * as React from "react";
import { objectManagerApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface LayoutSection {
  name: string;
  fields: string[];
}

interface LayoutField {
  name: string;
  label: string;
  fieldType: string;
  required: boolean;
  editable: boolean;
  visible: boolean;
  isSystemField: boolean;
  isStandardField: boolean;
  defaultValue?: string;
  lookupObject?: string;
  lookupField?: string;
  picklistValues?: { label: string; value: string; isActive: boolean }[];
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
}

interface LayoutDrivenFormProps {
  objectName: string;
  mode: "create" | "edit" | "detail";
  data?: Record<string, any>;
  onChange?: (field: string, value: any) => void;
  onSubmit?: (data: Record<string, any>) => void;
  layout?: any;
  fields?: any[];
  projects?: { id: string; name: string; isActive?: boolean }[];
  fieldErrors?: Record<string, string>;
  onBeginEdit?: (fieldName: string) => void;
}

export default function LayoutDrivenForm({
  objectName,
  mode,
  data = {},
  onChange,
  onSubmit,
  layout: propLayout,
  fields: propFields,
  projects = [],
  fieldErrors,
  onBeginEdit,
}: LayoutDrivenFormProps) {
  const [layout, setLayout] = React.useState<any>(propLayout || null);
  const [fields, setFields] = React.useState<LayoutField[]>(propFields || []);
  const [isLoading, setIsLoading] = React.useState(!propLayout);
  const [lookupOptions, setLookupOptions] = React.useState<Record<string, any[]>>({});

  React.useEffect(() => {
    if (propLayout) {
      setLayout(propLayout);
    }
    if (propFields) {
      setFields(propFields);
    }
    if (!propLayout || !propFields) {
      loadData();
    }
  }, [objectName, propLayout, propFields]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [layoutRes, fieldsRes] = await Promise.all([
        objectManagerApi.getDefaultLayout(objectName),
        objectManagerApi.listFields(objectName, { includeSystem: true }),
      ]);
      setLayout(layoutRes.data.data);
      setFields(fieldsRes.data.data || []);
    } catch {
      console.error("Failed to load layout");
    } finally {
      setIsLoading(false);
    }
  };

  const sections: LayoutSection[] = React.useMemo(() => {
    if (!layout) return [];
    const raw = typeof layout.sections === "string"
      ? JSON.parse(layout.sections)
      : layout.sections;
    const configuredSections: LayoutSection[] = Array.isArray(raw)
      ? raw
          .filter((section): section is LayoutSection =>
            !!section &&
            typeof section.name === "string" &&
            Array.isArray(section.fields),
          )
          .map((section) => ({
            name: section.name,
            fields: section.fields.filter((field): field is string => typeof field === "string"),
          }))
      : [];
    if (objectName !== "Lead") {
      return configuredSections;
    }
    const leadInformationIndex = configuredSections.findIndex(
      (section) => section.name === "Lead Information" || section.name === "Lead Details",
    );
    if (leadInformationIndex < 0) {
      return [
        ...configuredSections.map((section) => ({
          ...section,
          fields: section.fields.filter((field) => field !== "projectId"),
        })),
        { name: "Lead Information", fields: ["projectId"] },
      ];
    }
    return configuredSections.flatMap((section, index) => {
      const fields = section.fields.filter((field) => field !== "projectId");
      if (index !== leadInformationIndex) {
        return [{ ...section, fields }];
      }
      return [{
        name: "Lead Information",
        fields: ["projectId", ...fields],
      }];
    });
  }, [layout, objectName]);

  const formFields = React.useMemo(() => {
    if (objectName !== "Lead" || fields.some((field) => field.name === "projectId")) return fields;
    return [...fields, {
      name: "projectId",
      label: "Project",
      fieldType: "lookup",
      required: false,
      editable: true,
      visible: true,
      isSystemField: false,
      isStandardField: true,
      lookupObject: "Project",
    }];
  }, [fields, objectName]);

  const getFieldDef = (fieldName: string): LayoutField | undefined =>
    formFields.find((f) => f.name === fieldName);

  const handleFieldChange = (fieldName: string, value: any) => {
    if (onChange) onChange(fieldName, value);
  };

  const renderField = (field: LayoutField, value: any) => {
    const isDisabled = mode === "detail" || !field.editable || field.isSystemField;

    switch (field.fieldType) {
      case "text":
      case "autoNumber":
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            placeholder={field.label}
            maxLength={field.maxLength}
          />
        );

      case "email":
        return (
          <Input
            type="email"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            placeholder={field.label}
          />
        );

      case "phone":
        return (
          <Input
            type="tel"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            placeholder={field.label}
          />
        );

      case "url":
        return (
          <Input
            type="url"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            placeholder={field.label}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value ? Number(e.target.value) : null)}
            disabled={isDisabled}
            min={field.minValue}
            max={field.maxValue}
          />
        );

      case "currency":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value ? Number(e.target.value) : null)}
            disabled={isDisabled}
            min={field.minValue || 0}
            step="0.01"
          />
        );

      case "boolean":
        return (
          <Switch
            checked={!!value}
            onCheckedChange={(checked: boolean) => handleFieldChange(field.name, checked)}
            disabled={isDisabled}
          />
        );

      case "date":
        return (
          <Input
            type="date"
            value={value ? new Date(value).toISOString().split("T")[0] : ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value || null)}
            disabled={isDisabled}
          />
        );

      case "dateTime":
        return (
          <Input
            type="datetime-local"
            value={value ? new Date(value).toISOString().slice(0, 16) : ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value || null)}
            disabled={isDisabled}
          />
        );

      case "time":
        return (
          <Input
            type="time"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value || null)}
            disabled={isDisabled}
          />
        );

      case "picklist":
        return (
          <Select
            value={value || ""}
            onValueChange={(v) => handleFieldChange(field.name, v || null)}
            disabled={isDisabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.picklistValues
                ?.filter((pv) => pv.isActive)
                .map((pv) => (
                  <SelectItem key={pv.value} value={pv.value}>
                    {pv.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        );

      case "lookup":
        if (field.name === "projectId" || field.lookupObject === "Project") {
          return (
            <Select
              value={value || "__no_project__"}
              onValueChange={(selected) => handleFieldChange(field.name, selected === "__no_project__" ? null : selected)}
              disabled={isDisabled}
            >
              <SelectTrigger aria-label={field.label}>
                <SelectValue placeholder="Select Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__no_project__">No Project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            placeholder={`Lookup: ${field.lookupObject}`}
          />
        );

      case "longText":
      case "richText":
        return (
          <Textarea
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            rows={3}
            maxLength={field.maxLength}
          />
        );

      default:
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
          />
        );
    }
  };

  const displayValue = (field: LayoutField, value: any): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (field.fieldType === "boolean") return value ? "Yes" : "No";
    if (field.fieldType === "date" || field.fieldType === "dateTime") {
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? String(value)
        : date.toLocaleString(undefined, field.fieldType === "date"
          ? { year: "numeric", month: "2-digit", day: "2-digit" }
          : { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    }
    if (field.fieldType === "currency") {
      const amount = Number(value);
      return Number.isFinite(amount)
        ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount)
        : String(value);
    }
    if (field.fieldType === "picklist") {
      return field.picklistValues?.find((option) => option.value === value)?.label || String(value);
    }
    if (field.fieldType === "multiPicklist" && Array.isArray(value)) {
      return value
        .map((item) => field.picklistValues?.find((option) => option.value === item)?.label || String(item))
        .join(", ");
    }
    if (typeof value === "object") {
      return String(value.name || value.label || value.displayName || value.id || "—");
    }
    if (field.fieldType === "lookup") {
      const relation = data[field.name.replace(/Id$/, "")];
      if (relation && typeof relation === "object") {
        return String(relation.name || relation.title || relation.label || relation.recordNumber || value);
      }
    }
    return String(value);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2].map((j) => (
                <div key={j} className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No layout configured for this object.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section, sectionIdx) => {
        const visibleFields = section.fields
          .map((fieldName) => getFieldDef(fieldName))
          .filter((f): f is LayoutField => !!f && f.visible !== false);

        if (visibleFields.length === 0) return null;

        return (
          <Card
            key={sectionIdx}
            className={objectName === "Lead" ? "rounded-md border-slate-200 shadow-sm" : undefined}
          >
            <CardHeader className={`pb-3 ${objectName === "Lead" ? "border-b border-sky-100 bg-[#f5faff] px-4 py-3" : ""}`}>
              <CardTitle className={`font-medium ${objectName === "Lead" ? "text-[12px] text-slate-700" : "text-sm text-muted-foreground"}`}>
                {section.name}
              </CardTitle>
            </CardHeader>
            <CardContent className={objectName === "Lead" ? "px-4 py-2" : undefined}>
              <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
                {visibleFields.map((field) => (
                  <div
                    key={field.name}
                    className={`${
                      field.fieldType === "longText" || field.fieldType === "richText"
                        ? "md:col-span-2"
                        : ""
                    }`}
                  >
                    {mode === "detail" ? (
                      <div className={`flex min-h-10 items-center justify-between gap-3 border-b py-2 ${objectName === "Lead" ? "border-sky-100" : ""}`}>
                        <Label className={`w-2/5 shrink-0 font-medium text-muted-foreground ${objectName === "Lead" ? "text-[10px]" : "text-xs"}`}>
                          {field.label}
                        </Label>
                        <div className={`min-w-0 flex-1 break-words font-medium ${objectName === "Lead" ? "text-[12px]" : "text-sm"}`}>
                          {displayValue(field, data[field.name])}
                          {fieldErrors?.[field.name] && (
                            <p className={objectName === "Lead" ? "text-[11px] text-destructive" : "text-sm text-destructive"} data-testid={`error-${field.name}`}>
                              {fieldErrors[field.name]}
                            </p>
                          )}
                        </div>
                        {onBeginEdit && field.editable && !field.isSystemField && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 shrink-0 ${objectName === "Lead" ? "text-blue-500 hover:bg-sky-50 hover:text-blue-700" : "text-muted-foreground"}`}
                            aria-label={`Edit ${field.label}`}
                            onClick={() => onBeginEdit(field.name)}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-sm">
                          {field.label}
                          {field.required && mode === "create" && (
                            <span className="ml-1 text-destructive">*</span>
                          )}
                        </Label>
                        {renderField(field, data[field.name])}
                        {fieldErrors?.[field.name] && (
                          <p className="text-sm text-destructive" data-testid={`error-${field.name}`}>
                            {fieldErrors[field.name]}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}