"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/crm/data-table";
import { FilterBar, FilterField } from "@/components/crm/filters";
import { Plus, MoreHorizontal, Eye, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { taskApi } from "@/lib/api";

interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in-progress" | "completed" | "cancelled";
  assignedTo: string;
  relatedTo?: string;
  relatedHref?: string;
  completedAt?: string;
  salesforceStatus?: string;
  callType?: string;
  name?: string;
}

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800",
  "in-progress": "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const columns: ColumnDef<Task>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
  },
  {
    accessorKey: "title",
    header: "Task",
    cell: ({ row }) => {
      const task = row.original;
      return (
        <div>
          <Link href={`/tasks/${task.id}`} className="hover:underline font-medium">
            {task.title}
          </Link>
          <p className="text-sm text-muted-foreground line-clamp-1">{task.description}</p>
        </div>
      );
    },
  },
  {
    accessorKey: "dueDate",
    header: "Due Date",
    cell: ({ row }) => {
      const value = row.getValue("dueDate");
      if (!value) return "-";
      const date = new Date(value as string);
      const isOverdue = date < new Date();
      return (
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span className={isOverdue ? "text-red-500" : ""}>
            {formatDateTime(date)}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "priority",
    header: "Priority",
    cell: ({ row }) => {
      const priority = row.getValue("priority") as string;
      return (
        <Badge className={priorityColors[priority] || priorityColors.medium}>
          {priority}
        </Badge>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge className={statusColors[status] || statusColors.pending}>
          {status.replace("-", " ")}
        </Badge>
      );
    },
  },
  {
    accessorKey: "assignedTo",
    header: "Assigned To",
  },
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "relatedTo",
    header: "Related To",
    cell: ({ row }) => {
      const task = row.original;
      if (!task.relatedTo) return "-";
      if (!task.relatedHref) return task.relatedTo;
      return (
        <Link href={task.relatedHref} className="hover:underline text-primary">
          {task.relatedTo}
        </Link>
      );
    },
  },
  {
      accessorKey: "callType",
      header: "Call Type",
      cell: ({ row }) => row.original.callType || "-",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const task = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/tasks/${task.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

function mapTask(item: any): Task {
  const owner = item.owner
    ? `${item.owner.firstName || ""} ${item.owner.lastName || ""}`.trim()
    : "";
  let relatedTo: string | undefined;
  let relatedHref: string | undefined;
  if (item.siteVisit) {
    relatedTo = item.siteVisit.siteVisitNumber || "Site Visit";
    relatedHref = `/site-visits/${item.siteVisit.id}`;
  } else if (item.opportunity) {
    relatedTo = item.opportunity.name;
    relatedHref = `/opportunities/${item.opportunity.id}`;
  } else if (item.booking) {
    relatedTo = item.booking.number || "Booking";
    relatedHref = `/bookings/${item.booking.id}`;
  } else if (item.project) {
    relatedTo = item.project.name;
    relatedHref = `/projects/${item.project.id}`;
  } else if (item.unit) {
    relatedTo = item.unit.number || "Unit";
  }
  return {
    id: item.id,
    title: item.subject || item.title,
    description: item.description || "",
    dueDate: item.dueDate || "",
    priority: item.priority,
    status: item.status,
    assignedTo: owner || "-",
    relatedTo,
    relatedHref,
    completedAt: item.completedAt,
    salesforceStatus: item.salesforceStatus,
    callType: item.callType,
    name: item.lead
      ? `${item.lead.firstName || ""} ${item.lead.lastName || ""}`.trim() || item.lead.phone
      : undefined,
  };
}

export default function TasksPage() {
  const [currentPage, setCurrentPage] = React.useState(1);
  const [filters, setFilters] = React.useState({ priority: "", status: "" });
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    const fetchTasks = async () => {
      try {
        setIsLoading(true);
        const params: Record<string, any> = { page: currentPage, limit: 20 };
        if (filters.priority) params.priority = filters.priority;
        if (filters.status) params.status = filters.status;
        const res = await taskApi.list(params);
        if (!isMounted) return;
        if (res.data.success && res.data.data) {
          setTasks(res.data.data.map(mapTask));
          setTotalItems(res.data.pagination?.total ?? res.data.data.length);
        } else {
          setTasks([]);
          setTotalItems(0);
        }
      } catch {
        if (isMounted) {
          setTasks([]);
          setTotalItems(0);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchTasks();
    return () => {
      isMounted = false;
    };
  }, [currentPage, filters.priority, filters.status]);

  const handleFilterChange = (key: "priority" | "status", value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tasks</h1>
          <p className="text-muted-foreground">
            Manage your tasks and stay on top of your work
          </p>
        </div>
        <Button asChild>
          <Link href="/tasks/new">
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Link>
        </Button>
      </div>

      <div className="space-y-4">
        <FilterBar
          onReset={() => {
            setFilters({ priority: "", status: "" });
            setCurrentPage(1);
          }}
        >
          <FilterField
            label="Priority"
            type="select"
            value={filters.priority}
            onChange={(value) => handleFilterChange("priority", value as string)}
            options={[
              { label: "Low", value: "low" },
              { label: "Medium", value: "medium" },
              { label: "High", value: "high" },
              { label: "Urgent", value: "urgent" },
            ]}
            placeholder="All Priorities"
          />
          <FilterField
            label="Status"
            type="select"
            value={filters.status}
            onChange={(value) => handleFilterChange("status", value as string)}
            options={[
              { label: "Pending", value: "pending" },
              { label: "In Progress", value: "in-progress" },
              { label: "Completed", value: "completed" },
              { label: "Cancelled", value: "cancelled" },
            ]}
            placeholder="All Statuses"
          />
        </FilterBar>

        <DataTable
          columns={columns}
          data={tasks}
          isLoading={isLoading}
          searchKey="title"
          searchPlaceholder="Search tasks..."
          totalItems={totalItems}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          serverPagination
        />
      </div>
    </div>
  );
}