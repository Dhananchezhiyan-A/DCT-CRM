import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SetupPage from "./page";

const auth = vi.hoisted(() => ({ canManageObjects: true }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    isAdmin: true,
    isSuperAdmin: false,
    hasFullAccess: false,
    hasEffectivePermission: () => auth.canManageObjects,
  }),
}));

describe("SetupPage", () => {
  it("provides links to GRE Forms and Object Manager to admins with object-management permission", () => {
    render(<SetupPage />);

    expect(screen.getByRole("link", { name: /GRE Forms/i })).toHaveAttribute(
      "href",
      "/setup/developer/gre",
    );
    expect(screen.getByRole("link", { name: /Object Manager/i })).toHaveAttribute(
      "href",
      "/admin/object-manager",
    );
  });

  it("hides Object Manager from admins without object-management permission", () => {
    auth.canManageObjects = false;

    render(<SetupPage />);

    expect(screen.getByRole("link", { name: /GRE Forms/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Object Manager/i })).not.toBeInTheDocument();
    auth.canManageObjects = true;
  });

  it("groups portal links under Custom Portal Details and omits duplicate and recycle-bin links", () => {
    render(<SetupPage />);

    expect(screen.getByRole("heading", { name: "Custom Portal Details" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /CP Portal$/i })).toHaveAttribute(
      "href",
      "http://localhost:3002/login",
    );
    expect(screen.getByRole("link", { name: /GRE Forms/i })).toHaveAttribute(
      "href",
      "/setup/developer/gre",
    );
    expect(screen.queryByRole("heading", { name: "Sites" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "GRE" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Duplicate Management/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Recycle Bin/i })).not.toBeInTheDocument();
  });
});
