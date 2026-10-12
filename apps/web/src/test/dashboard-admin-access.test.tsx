import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/admin/object-manager/lead",
  hasObjectPermission: true,
  router: { replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => state.router,
}));

vi.mock("@/contexts/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    isSuperAdmin: false,
    isAdmin: true,
    hasFullAccess: false,
    hasEffectivePermission: (permission: string) =>
      permission === "PROFILE_PERMISSION_MANAGE" && state.hasObjectPermission,
    user: {},
    stopImpersonating: vi.fn(),
  }),
}));

vi.mock("@/components/layout/sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/breadcrumb", () => ({ Breadcrumb: () => null }));
vi.mock("@/components/ai/chatbot", () => ({ Chatbot: () => null }));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));

import DashboardLayout from "../app/(dashboard)/layout";

describe("dashboard admin route access", () => {
  beforeEach(() => {
    state.pathname = "/admin/object-manager/lead";
    state.hasObjectPermission = true;
    state.router.replace.mockClear();
  });

  it("allows admins with object-management permission to open object details", () => {
    render(
      <DashboardLayout>
        <div>Object details</div>
      </DashboardLayout>,
    );

    expect(screen.getByText("Object details")).toBeInTheDocument();
    expect(state.router.replace).not.toHaveBeenCalledWith("/home");
  });

  it("redirects admins without object-management permission", () => {
    state.hasObjectPermission = false;

    render(
      <DashboardLayout>
        <div>Object details</div>
      </DashboardLayout>,
    );

    expect(screen.queryByText("Object details")).not.toBeInTheDocument();
    expect(state.router.replace).toHaveBeenCalledWith("/home");
  });
});
