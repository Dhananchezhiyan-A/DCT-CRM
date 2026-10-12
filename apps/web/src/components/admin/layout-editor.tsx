"use client";

import React, { useState, useMemo } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  GripVertical,
  Plus,
  Trash2,
  X,
  Save,
  ArrowLeft,
  LayoutList,
} from "lucide-react";

interface Section {
  name: string;
  fields: string[];
}

interface LayoutEditorProps {
  objectName: string;
  layout: any;
  fields: any[];
  onSave: (sections: Section[]) => Promise<void>;
  onCancel: () => void;
}

export default function LayoutEditor({
  objectName,
  layout,
  fields,
  onSave,
  onCancel,
}: LayoutEditorProps) {
  const initialSections: Section[] = useMemo(() => {
    if (layout?.sections && Array.isArray(layout.sections)) {
      return layout.sections.map((s: any) => ({
        name: s.name || "Untitled Section",
        fields: Array.isArray(s.fields) ? s.fields : [],
      }));
    }
    return [];
  }, [layout]);

  const [sections, setSections] = useState<Section[]>(initialSections);
  const [newSectionName, setNewSectionName] = useState("");
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(
    null
  );
  const [editingSectionName, setEditingSectionName] = useState("");
  const [saving, setSaving] = useState(false);

  const allFieldNames = useMemo(
    () => fields.map((f) => f.name || f.fieldName || f),
    [fields]
  );

  const fieldsInLayout = useMemo(
    () => new Set(sections.flatMap((s) => s.fields)),
    [sections]
  );

  const availableFields = useMemo(
    () => allFieldNames.filter((name) => !fieldsInLayout.has(name)),
    [allFieldNames, fieldsInLayout]
  );

  const getFieldLabel = (fieldName: string): string => {
    const field = fields.find(
      (f) => (f.name || f.fieldName) === fieldName
    );
    return field?.label || field?.displayName || fieldName;
  };

  const handleAddSection = () => {
    const name = newSectionName.trim();
    if (!name) return;
    setSections((prev) => [...prev, { name, fields: [] }]);
    setNewSectionName("");
  };

  const handleDeleteSection = (sectionIndex: number) => {
    setSections((prev) => prev.filter((_, i) => i !== sectionIndex));
  };

  const handleStartEditSectionName = (sectionIndex: number) => {
    setEditingSectionIndex(sectionIndex);
    setEditingSectionName(sections[sectionIndex].name);
  };

  const handleSaveSectionName = () => {
    if (editingSectionIndex === null) return;
    const name = editingSectionName.trim();
    if (!name) {
      setEditingSectionIndex(null);
      return;
    }
    setSections((prev) =>
      prev.map((s, i) =>
        i === editingSectionIndex ? { ...s, name } : s
      )
    );
    setEditingSectionIndex(null);
  };

  const handleRemoveFieldFromSection = (
    sectionIndex: number,
    fieldName: string
  ) => {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? { ...s, fields: s.fields.filter((f) => f !== fieldName) }
          : s
      )
    );
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;

    if (!destination) return;

    if (
      source.droppableId === "layout-sections" ||
      destination.droppableId === "layout-sections"
    ) {
      if (
        source.droppableId === "layout-sections" &&
        destination.droppableId === "layout-sections"
      ) {
        setSections((prev) => {
          const reordered = Array.from(prev);
          const [moved] = reordered.splice(source.index, 1);
          reordered.splice(destination.index, 0, moved);
          return reordered;
        });
      }
      return;
    }

    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    if (source.droppableId === "available-fields") {
      const fieldName = availableFields[source.index];

      if (destination.droppableId === "available-fields") {
        const reordered = Array.from(availableFields);
        const [removed] = reordered.splice(source.index, 1);
        reordered.splice(destination.index, 0, removed);
        return;
      }

      const destSectionIndex = parseInt(
        destination.droppableId.replace("section-", ""),
        10
      );

      setSections((prev) =>
        prev.map((s, i) => {
          if (i !== destSectionIndex) return s;
          const newFields = Array.from(s.fields);
          newFields.splice(destination.index, 0, fieldName);
          return { ...s, fields: newFields };
        })
      );
      return;
    }

    if (destination.droppableId === "available-fields") {
      const sourceSectionIndex = parseInt(
        source.droppableId.replace("section-", ""),
        10
      );

      setSections((prev) =>
        prev.map((s, i) => {
          if (i !== sourceSectionIndex) return s;
          const newFields = Array.from(s.fields);
          newFields.splice(source.index, 1);
          return { ...s, fields: newFields };
        })
      );
      return;
    }

    const sourceSectionIndex = parseInt(
      source.droppableId.replace("section-", ""),
      10
    );
    const destSectionIndex = parseInt(
      destination.droppableId.replace("section-", ""),
      10
    );

    if (sourceSectionIndex === destSectionIndex) {
      const section = sections[sourceSectionIndex];
      const newFields = Array.from(section.fields);
      const [removed] = newFields.splice(source.index, 1);
      newFields.splice(destination.index, 0, removed);

      setSections((prev) =>
        prev.map((s, i) =>
          i === sourceSectionIndex ? { ...s, fields: newFields } : s
        )
      );
    } else {
      const sourceSection = sections[sourceSectionIndex];
      const destSection = sections[destSectionIndex];

      const newSourceFields = Array.from(sourceSection.fields);
      const [removed] = newSourceFields.splice(source.index, 1);

      const newDestFields = Array.from(destSection.fields);
      newDestFields.splice(destination.index, 0, removed);

      setSections((prev) =>
        prev.map((s, i) => {
          if (i === sourceSectionIndex)
            return { ...s, fields: newSourceFields };
          if (i === destSectionIndex)
            return { ...s, fields: newDestFields };
          return s;
        })
      );
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(sections);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <LayoutList className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold">
                {objectName} Layout
              </h2>
              <p className="text-sm text-muted-foreground">
                Drag and drop fields to organize your page layout
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Saving..." : "Save Layout"}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-80 border-r bg-muted/30 flex flex-col">
            <div className="p-4 border-b">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Available Fields
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {availableFields.length} field
                {availableFields.length !== 1 ? "s" : ""} unassigned
              </p>
            </div>
            <Droppable droppableId="available-fields">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex-1 overflow-y-auto p-3 space-y-1.5 transition-colors ${
                    snapshot.isDraggingOver
                      ? "bg-accent/50"
                      : ""
                  }`}
                >
                  {availableFields.length === 0 && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      All fields have been assigned to sections
                    </div>
                  )}
                  {availableFields.map((fieldName, index) => (
                    <Draggable
                      key={fieldName}
                      draggableId={`available-${fieldName}`}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm cursor-grab select-none transition-shadow ${
                            snapshot.isDragging
                              ? "shadow-lg ring-2 ring-primary/20"
                              : "shadow-sm hover:shadow"
                          }`}
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate font-medium">
                            {getFieldLabel(fieldName)}
                          </span>
                          <Badge
                            variant="secondary"
                            className="ml-auto text-[11px] shrink-0"
                          >
                            {fieldName}
                          </Badge>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              <Droppable droppableId="layout-sections">
                {(sectionListProvided) => (
                  <div
                    ref={sectionListProvided.innerRef}
                    {...sectionListProvided.droppableProps}
                    className="space-y-4"
                  >
                    {sections.map((section, sectionIndex) => (
                      <Draggable
                        key={`section-${sectionIndex}`}
                        draggableId={`section-${sectionIndex}`}
                        index={sectionIndex}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                          >
                            <Card
                              className={`transition-shadow ${
                                snapshot.isDragging ? "shadow-lg" : ""
                              }`}
                            >
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <div
                              {...provided.dragHandleProps}
                              className="cursor-grab active:cursor-grabbing"
                            >
                              <GripVertical className="h-5 w-5 text-muted-foreground" />
                            </div>

                            {editingSectionIndex === sectionIndex ? (
                              <div className="flex items-center gap-2 flex-1">
                                <Input
                                  value={editingSectionName}
                                  onChange={(e) =>
                                    setEditingSectionName(e.target.value)
                                  }
                                  onBlur={handleSaveSectionName}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveSectionName();
                                    if (e.key === "Escape") {
                                      setEditingSectionIndex(null);
                                    }
                                  }}
                                  className="h-8 text-sm font-semibold"
                                  autoFocus
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={handleSaveSectionName}
                                >
                                  <Save className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <CardTitle
                                className="text-base cursor-pointer hover:text-primary transition-colors flex-1"
                                onClick={() =>
                                  handleStartEditSectionName(sectionIndex)
                                }
                              >
                                {section.name}
                              </CardTitle>
                            )}

                            <Badge variant="outline" className="text-xs">
                              {section.fields.length} field
                              {section.fields.length !== 1 ? "s" : ""}
                            </Badge>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                handleDeleteSection(sectionIndex)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Droppable
                            droppableId={`section-${sectionIndex}`}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`min-h-[60px] rounded-md border border-dashed p-2 transition-colors ${
                                  snapshot.isDraggingOver
                                    ? "border-primary bg-primary/5"
                                    : "border-muted-foreground/25"
                                }`}
                              >
                                <div className="flex flex-wrap gap-1.5">
                                  {section.fields.map(
                                    (fieldName, fieldIndex) => (
                                      <Draggable
                                        key={`${sectionIndex}-${fieldName}`}
                                        draggableId={`section-${sectionIndex}-field-${fieldName}`}
                                        index={fieldIndex}
                                      >
                                        {(provided, snapshot) => (
                                          <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                            className={`inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs cursor-grab select-none transition-shadow ${
                                              snapshot.isDragging
                                                ? "shadow-md ring-1 ring-primary/20"
                                                : ""
                                            }`}
                                          >
                                            <GripVertical className="h-3 w-3 text-muted-foreground" />
                                            <span className="font-medium">
                                              {getFieldLabel(fieldName)}
                                            </span>
                                            <button
                                              type="button"
                                              className="ml-0.5 rounded-full p-0.5 hover:bg-muted transition-colors"
                                              onClick={() =>
                                                handleRemoveFieldFromSection(
                                                  sectionIndex,
                                                  fieldName
                                                )
                                              }
                                            >
                                              <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                            </button>
                                          </div>
                                        )}
                                      </Draggable>
                                    )
                                  )}
                                  {provided.placeholder}
                                </div>
                                {section.fields.length === 0 && (
                                  <p className="text-xs text-muted-foreground text-center py-2">
                                    Drag fields here or click below to add
                                  </p>
                                )}
                              </div>
                            )}
                          </Droppable>

                          {availableFields.length > 0 && (
                            <div className="mt-3">
                              <AddFieldDropdown
                                sectionIndex={sectionIndex}
                                availableFields={availableFields}
                                onAddField={(fieldName) => {
                                  setSections((prev) =>
                                    prev.map((s, i) =>
                                      i === sectionIndex
                                        ? {
                                            ...s,
                                            fields: [...s.fields, fieldName],
                                          }
                                        : s
                                    )
                                  );
                                }}
                                getFieldLabel={getFieldLabel}
                              />
                            </div>
                          )}
                        </CardContent>
                            </Card>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {sectionListProvided.placeholder}
                  </div>
                )}
              </Droppable>

              <div className="flex items-center gap-2 pt-2">
                <Input
                  placeholder="New section name..."
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddSection();
                  }}
                  className="h-9"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={handleAddSection}
                  disabled={!newSectionName.trim()}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Section
                </Button>
              </div>

              {sections.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <LayoutList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No sections yet</p>
                  <p className="text-xs mt-1">
                    Add a section above to start building your layout
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DragDropContext>
  );
}

function AddFieldDropdown({
  sectionIndex,
  availableFields,
  onAddField,
  getFieldLabel,
}: {
  sectionIndex: number;
  availableFields: string[];
  onAddField: (fieldName: string) => void;
  getFieldLabel: (fieldName: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = availableFields.filter((f) =>
    f.toLowerCase().includes(search.toLowerCase())
  );

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add field
      </Button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <Input
          placeholder="Search fields..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setSearch("");
            }
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => {
            setOpen(false);
            setSearch("");
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      {filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border bg-popover shadow-md">
          {filtered.map((fieldName) => (
            <button
              key={fieldName}
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
              onClick={() => {
                onAddField(fieldName);
                setOpen(false);
                setSearch("");
              }}
            >
              <span>{getFieldLabel(fieldName)}</span>
              <span className="text-muted-foreground text-[11px]">
                {fieldName}
              </span>
            </button>
          ))}
        </div>
      )}
      {filtered.length === 0 && search && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md p-3 text-xs text-muted-foreground text-center">
          No matching fields
        </div>
      )}
    </div>
  );
}