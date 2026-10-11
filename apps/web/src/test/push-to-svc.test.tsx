import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

const testState = vi.hoisted(() => ({
  leadGet: vi.fn(),
  pushToSVC: vi.fn(),
  scheduleSiteVisit: vi.fn(),
  projectList: vi.fn(),
  getActivityHistory: vi.fn(),
  getAuditHistory: vi.fn(),
  getNotes: vi.fn(),
  profile: { name: "Presales" },
  leadUpdatePermission: true,
  effectivePermissions: [] as string[],
  toast: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "lead-1" }),
  useRouter: () => testState.router,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    profile: testState.profile,
    user: { id: "presales-1" },
    isLoading: false,
    isAdmin: false,
    isSuperAdmin: false,
    hasPermission: (_objectName: string, action?: string) => action !== "edit" || testState.leadUpdatePermission,
    hasEffectivePermission: (permission: string) => testState.effectivePermissions.includes(permission),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: testState.toast }),
}));

vi.mock("@/lib/api", () => ({
  leadApi: {
    get: testState.leadGet,
    pushToSVC: testState.pushToSVC,
    scheduleSiteVisit: testState.scheduleSiteVisit,
    getActivityHistory: testState.getActivityHistory,
    getAuditHistory: testState.getAuditHistory,
  },
  objectManagerApi: {
    getDefaultLayout: vi.fn().mockResolvedValue({ data: { data: null } }),
    listFields: vi.fn().mockResolvedValue({ data: { data: [] } }),
  },
  projectApi: { listAll: testState.projectList },
  unitApi: { list: vi.fn() },
  siteVisitApi: {},
  notesApi: { get: testState.getNotes },
  opportunityApi: {},
  activityApi: {},
  taskApi: {},
  followUpApi: {},
  quotationApi: {},
  bookingApi: {},
}));

vi.mock("@/components/admin/layout-driven-form", () => ({ default: () => null }));

import LeadDetailPage from "../app/(dashboard)/leads/[id]/page";

const incomingLead = {
  id: "lead-1",
  leadNumber: "L-001",
  firstName: "Taylor",
  lastName: "Customer",
  status: "INCOMING",
  ownerId: "presales-1",
  owner: { id: "presales-1", firstName: "Pre", lastName: "Sales" },
  siteVisits: [],
  opportunities: [],
  activities: [],
  tasks: [],
  followUps: [],
  auditLogs: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  testState.profile.name = "Presales";
  testState.leadUpdatePermission = true;
  testState.effectivePermissions = [];
  testState.getActivityHistory.mockResolvedValue({ data: { success: true, data: [] } });
  testState.getAuditHistory.mockResolvedValue({ data: { success: true, data: [] } });
  testState.getNotes.mockResolvedValue({ data: { success: true, data: { notes: "" } } });
  testState.leadGet
    .mockResolvedValueOnce({ data: { success: true, data: incomingLead } })
    .mockRejectedValue({ response: { status: 403, data: { error: "You do not have access to this lead" } } });
});

describe("Push to SVC", () => {
  it("shows SVC scheduling action with site-visit permission alone", async () => {
    testState.profile.name = "SVC";
    testState.leadUpdatePermission = false;
    testState.effectivePermissions = ["SITE_VISIT_CREATE"];
    testState.leadGet.mockReset();
    testState.leadGet.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          ...incomingLead,
          status: "PROSPECT",
          ownerId: "svc-1",
          owner: { id: "svc-1", firstName: "SVC", lastName: "Coordinator" },
        },
      },
    });

    render(<LeadDetailPage />);

    expect(await screen.findByRole("button", { name: "Schedule Site Visit" })).toBeInTheDocument();
  });

  it("shows success and updates local owner/status without refetching inaccessible Lead data", async () => {
    testState.leadGet.mockReset().mockResolvedValueOnce({
      data: { success: true, data: incomingLead },
    });
    testState.pushToSVC.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...incomingLead,
          status: "PROSPECT",
          ownerId: "svc-1",
          owner: { id: "svc-1", firstName: "Sam", lastName: "Coordinator" },
        },
      },
    });

    render(<LeadDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Push to SVC" }));
    fireEvent.change(screen.getByLabelText("Reason / Note *"), {
      target: { value: "Qualified for site visit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Push to SVC" }));

    await waitFor(() => {
      expect(testState.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Success",
          description: "Lead pushed to SVC successfully.",
        }),
      );
    });

    expect(testState.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Error" }),
    );
    expect(testState.leadGet).toHaveBeenCalledTimes(1);
    expect((await screen.findAllByText("Prospect")).length).toBeGreaterThan(0);
    expect(screen.getByText("Sam Coordinator")).toBeInTheDocument();
  });

  it("keeps genuine Push API failures visible as errors", async () => {
    testState.leadGet.mockReset().mockResolvedValueOnce({
      data: { success: true, data: incomingLead },
    });
    testState.pushToSVC.mockRejectedValue({
      response: { data: { error: "No active SVC Round Robin members configured" } },
    });

    render(<LeadDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Push to SVC" }));
    fireEvent.change(screen.getByLabelText("Reason / Note *"), {
      target: { value: "Qualified for site visit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Push to SVC" }));

    await waitFor(() => {
      expect(testState.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "No active SVC Round Robin members configured",
        }),
      );
    });
    expect(testState.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Success" }),
    );
    expect(testState.leadGet).toHaveBeenCalledTimes(1);
  });
});

describe("SVC Site Visit project selection", () => {
  const prospectLead = {
    ...incomingLead,
    status: "PROSPECT",
    ownerId: "svc-1",
    owner: { id: "svc-1", firstName: "Sam", lastName: "Coordinator" },
  };

  beforeEach(() => {
    testState.profile.name = "SVC";
    testState.leadGet.mockReset().mockResolvedValueOnce({
      data: { success: true, data: prospectLead },
    });
  });

  it("loads active tenant project choices once and updates the page from schedule success", async () => {
    const project = { id: "project-1", name: "North Tower", isActive: true };
    // projectApi.listAll() resolves to a flat, de-duplicable array of projects.
    testState.projectList.mockResolvedValue([project, project]);
    testState.scheduleSiteVisit.mockResolvedValue({
      data: {
        success: true,
        data: {
          lead: {
            ...prospectLead,
            status: "SITE_VISIT_SCHEDULED",
            owner: { id: "sales-1", firstName: "Sal", lastName: "Executive" },
          },
          siteVisit: {
            id: "visit-1",
            projectId: "project-1",
            project,
            status: "SCHEDULED",
            scheduledAt: "2026-10-01T09:00:00.000Z",
          },
        },
      },
    });

    render(<LeadDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Schedule Site Visit" }));
    expect(testState.projectList).toHaveBeenCalledWith({ isActive: true });

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Project *" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Project *" }));
    fireEvent.click(await screen.findByRole("option", { name: "North Tower" }));
    expect(screen.getByText("North Tower")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Note / Reason *"), {
      target: { value: "Customer requested a site visit" },
    });
    fireEvent.change(screen.getByLabelText("Visit Date *"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Visit Time *"), {
      target: { value: "14:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schedule Visit" }));

    await waitFor(() => {
      expect(testState.scheduleSiteVisit).toHaveBeenCalledWith(
        "lead-1",
        expect.objectContaining({
          projectId: "project-1",
          notes: "Customer requested a site visit",
        }),
      );
      expect(testState.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Success",
          description: "Site visit scheduled successfully.",
        }),
      );
    });

    expect(testState.projectList).toHaveBeenCalledTimes(1);
    expect(testState.leadGet).toHaveBeenCalledTimes(1);
    expect((await screen.findAllByText("Site Visit Scheduled")).length).toBeGreaterThan(0);
    expect(screen.getByText("Sal Executive")).toBeInTheDocument();
  });

  it("shows project-load errors inline and retries without an unhandled rejection", async () => {
    testState.projectList
      .mockRejectedValueOnce({
        response: { data: { error: "Insufficient permissions for Project:read" } },
      })
      .mockResolvedValueOnce([]);

    render(<LeadDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Schedule Site Visit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Insufficient permissions for Project:read");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("status")).toHaveTextContent("No projects available for this company.");
    expect(testState.projectList).toHaveBeenCalledTimes(2);
    expect(testState.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Error" }),
    );
  });
});