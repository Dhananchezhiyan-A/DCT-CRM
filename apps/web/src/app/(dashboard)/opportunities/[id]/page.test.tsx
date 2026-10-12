import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OpportunityDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  getOpportunity: vi.fn(),
  getFinancialSummary: vi.fn(),
  listProjects: vi.fn(),
  listUnits: vi.fn(),
  listQuotations: vi.fn(),
  getCompanySettings: vi.fn(),
  createQuotation: vi.fn(),
  downloadQuotation: vi.fn(),
  createPayment: vi.fn(),
  push: vi.fn(),
  router: { push: vi.fn() },
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "opportunity-a" }),
  useRouter: () => mocks.router,
}));

vi.mock("@/lib/api", () => ({
  opportunityApi: { get: mocks.getOpportunity, financialSummary: mocks.getFinancialSummary },
  projectApi: { list: mocks.listProjects },
  unitApi: { list: mocks.listUnits },
  companySettingsApi: { get: mocks.getCompanySettings },
  paymentApi: { create: mocks.createPayment },
  receiptApi: { issueForPayment: vi.fn() },
  quotationApi: { list: mocks.listQuotations, create: mocks.createQuotation, downloadPdf: mocks.downloadQuotation },
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ hasEffectivePermission: () => false, tenant: null }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

describe("OpportunityDetailPage GRE snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/opportunities/opportunity-a");
    mocks.listProjects.mockResolvedValue({ data: { success: true, data: [] } });
    mocks.listUnits.mockResolvedValue({ data: { success: true, data: [] } });
    mocks.listQuotations.mockResolvedValue({ data: { success: true, data: [] } });
    mocks.getFinancialSummary.mockResolvedValue({ data: { success: true, data: { payments: [] } } });
    mocks.getCompanySettings.mockResolvedValue({ data: { success: true, data: null } });
    mocks.getOpportunity.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: "opportunity-a",
          name: "Legacy opportunity title",
          amount: 100000,
          stage: "PROSPECTING",
          probability: 10,
          expectedCloseDate: null,
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-02T00:00:00.000Z",
          lead: {
            id: "lead-a",
            leadNumber: "LD-001",
            firstName: "Old",
            lastName: "Lead",
            email: "old@example.com",
            phone: "1111111111",
            mobile: null,
            company: "Old company",
            budget: 100000,
            preferredLocation: "Old area",
            project: { id: "project-a", name: "Old project" },
          },
          greRegistration: {
            referenceNumber: "GRE-2026-000002",
            submittedAt: "2026-10-07T10:00:00.000Z",
            lead: {
              firstName: "Updated",
              lastName: "Customer",
              email: "updated@example.com",
              phone: "+919876543210",
              company: "Updated company",
              budget: 500000,
              preferredLocation: "New area",
            },
            siteVisit: {
              date: "2026-10-07",
              time: "15:30",
              project: "New project",
              scheduledAt: "2026-10-07T10:00:00.000Z",
              visitType: "Revisit",
              visitorCount: 2,
            },
            company: { name: "Updated company", type: "Builder", industry: "REAL_ESTATE" },
          },
        },
      },
    });
  });

  it("loads and renders the latest GRE registration on a direct Opportunity URL", async () => {
    render(<OpportunityDetailPage />);

    expect(await screen.findByText("Latest GRE Registration")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Receipt" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Payments & Installments" })).toBeInTheDocument();
    expect(screen.getByText("GRE-2026-000002")).toBeInTheDocument();
    expect(screen.getByText("Updated Customer")).toBeInTheDocument();
    expect(screen.getByText("updated@example.com")).toBeInTheDocument();
    expect(screen.getByText("New project")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getOpportunity).toHaveBeenCalledWith("opportunity-a"));
  });

  it("selects a quotation belonging to the lead and calculates a partial-payment balance", async () => {
    mocks.listQuotations.mockResolvedValue({
      data: {
        success: true,
        data: [{
          id: "quotation-a",
          number: "QT-001",
          totalAmount: 100000,
          projectId: "project-a",
          project: { id: "project-a", name: "Old project" },
          unit: { id: "unit-a", number: "U001", area: 1000 },
          bookings: [{
            id: "booking-a",
            number: "BK-001",
            quotationId: "quotation-a",
            status: "PENDING",
            totalAmount: 100000,
          }],
        }],
      },
    });
    window.history.replaceState({}, "", "/opportunities/opportunity-a?tab=receipt");
    render(<OpportunityDetailPage />);

    const quotationSelect = await screen.findByLabelText("Lead quotation");
    await waitFor(() => expect(quotationSelect).toHaveValue("quotation-a"));
    expect(mocks.listQuotations).toHaveBeenCalledWith({ leadId: "lead-a", limit: 100 });

    fireEvent.change(screen.getByLabelText("Amount (₹)"), { target: { value: "100" } });
    expect(await screen.findByText("₹99,900")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount (₹)")).toHaveAttribute("max", "100000");
  });
});
