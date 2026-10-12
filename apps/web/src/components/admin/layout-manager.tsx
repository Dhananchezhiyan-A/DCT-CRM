"use client";

import * as React from "react";
import { objectManagerApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Trash2,
  LayoutList,
  RotateCcw,
  Star,
} from "lucide-react";
import LayoutEditor from "@/components/admin/layout-editor";

interface LayoutManagerProps {
  objectName: string;
  fields: any[];
}

export default function LayoutManager({ objectName, fields }: LayoutManagerProps) {
  const { toast } = useToast();
  const [layouts, setLayouts] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [editingLayout, setEditingLayout] = React.useState<any>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [newLayoutName, setNewLayoutName] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<any>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const loadLayouts = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await objectManagerApi.listLayouts(objectName);
      setLayouts(res.data.data || []);
    } catch {
      toast({ title: "Error", description: "Failed to load layouts", variant: "destructive" as any });
    } finally {
      setIsLoading(false);
    }
  }, [objectName, toast]);

  React.useEffect(() => {
    loadLayouts();
  }, [loadLayouts]);

  const handleCreateLayout = async () => {
    if (!newLayoutName.trim()) return;
    try {
      const defaultSections = [
        { name: "Information", fields: fields.filter(f => !f.isSystemField).map(f => f.name) },
      ];
      await objectManagerApi.createLayout(objectName, {
        name: newLayoutName.trim(),
        isDefault: layouts.length === 0,
        sections: defaultSections,
      });
      toast({ title: "Success", description: "Layout created" });
      setShowCreateDialog(false);
      setNewLayoutName("");
      await loadLayouts();
    } catch {
      toast({ title: "Error", description: "Failed to create layout", variant: "destructive" as any });
    }
  };

  const handleSaveLayout = async (sections: any[]) => {
    if (!editingLayout) return;
    setIsSaving(true);
    try {
      await objectManagerApi.updateLayout(objectName, editingLayout.id, {
        sections,
      });
      toast({
        title: "Success",
        description: objectName === "Lead"
          ? editingLayout.isDefault
            ? "Layout saved and applied to Lead record pages."
            : "Layout saved. Set it as Default for it to appear on Lead record pages."
          : "Layout saved.",
      });
      setEditingLayout(null);
      await loadLayouts();
    } catch {
      toast({ title: "Error", description: "Failed to save layout", variant: "destructive" as any });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLayout = async () => {
    if (!deleteTarget) return;
    try {
      await objectManagerApi.deleteLayout(objectName, deleteTarget.id);
      toast({ title: "Success", description: "Layout deleted" });
      setDeleteTarget(null);
      await loadLayouts();
    } catch {
      toast({ title: "Error", description: "Failed to delete layout", variant: "destructive" as any });
    }
  };

  const handleSetDefault = async (layout: any) => {
    try {
      await objectManagerApi.updateLayout(objectName, layout.id, {
        isDefault: true,
      });
      toast({ title: "Success", description: `"${layout.name}" set as default` });
      await loadLayouts();
    } catch {
      toast({ title: "Error", description: "Failed to set default", variant: "destructive" as any });
    }
  };

  const handleResetToDefault = async (layout: any) => {
    try {
      const defaultSections = [
        { name: "Information", fields: fields.filter(f => !f.isSystemField).map(f => f.name) },
      ];
      await objectManagerApi.updateLayout(objectName, layout.id, {
        sections: defaultSections,
      });
      toast({ title: "Success", description: "Layout reset to default" });
      await loadLayouts();
    } catch {
      toast({ title: "Error", description: "Failed to reset layout", variant: "destructive" as any });
    }
  };

  if (editingLayout) {
    const parsedSections = typeof editingLayout.sections === "string"
      ? JSON.parse(editingLayout.sections)
      : editingLayout.sections;

    return (
      <div className="fixed inset-0 z-50 bg-background">
        <LayoutEditor
          objectName={objectName}
          layout={{ ...editingLayout, sections: parsedSections }}
          fields={fields}
          onSave={handleSaveLayout}
          onCancel={() => setEditingLayout(null)}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading layouts...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Page Layouts</h3>
          <p className="text-sm text-muted-foreground">
            Configure the sections and fields shown on this object. The Default layout is used on Lead record pages.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Layout
        </Button>
      </div>

      {layouts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <LayoutList className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No layouts yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a layout to define how fields appear on this object
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Layout Name</TableHead>
                <TableHead>Sections</TableHead>
                <TableHead>Fields</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {layouts.map((layout) => {
                const sections = typeof layout.sections === "string"
                  ? JSON.parse(layout.sections)
                  : layout.sections || [];
                const totalFields = sections.reduce((acc: number, s: any) => acc + (s.fields?.length || 0), 0);

                return (
                  <TableRow key={layout.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <LayoutList className="h-4 w-4 text-muted-foreground" />
                        {layout.name}
                      </div>
                    </TableCell>
                    <TableCell>{sections.length}</TableCell>
                    <TableCell>{totalFields}</TableCell>
                    <TableCell>
                      {layout.isDefault ? (
                        <Badge variant="default" className="bg-green-600">
                          <Star className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingLayout(layout)}
                          title="Edit Layout"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!layout.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetDefault(layout)}
                            title="Set as Default"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResetToDefault(layout)}
                          title="Reset to Default"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        {!layout.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(layout)}
                            title="Delete Layout"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Layout</DialogTitle>
            <DialogDescription>
              Give your layout a name. All available fields will be added to a default section.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Layout name..."
            value={newLayoutName}
            onChange={(e) => setNewLayoutName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateLayout(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setNewLayoutName(""); }}>
              Cancel
            </Button>
            <Button onClick={handleCreateLayout} disabled={!newLayoutName.trim()}>
              Create Layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Layout</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteLayout}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}