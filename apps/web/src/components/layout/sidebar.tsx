"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/auth-context";
import {
  LayoutDashboard,
  Users,
  Contact,
  Building2,
  MapPin,
  TrendingUp,
  FileText,
  CalendarCheck,
  CreditCard,
  Receipt,
  FolderKanban,
  Building,
  CheckSquare,
  BarChart3,
  Settings,
  ChevronRight,
  Clock3,
  X,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function getNavigationByProfile(
  profileName: string | undefined,
  roles: string[],
  hasEffectivePermission: (perm: string) => boolean,
  isSuperAdmin: boolean,
  isAdmin: boolean
): NavItem[] {
  void roles;

  const nav: NavItem[] = [{ title: "Home", href: "/home", icon: LayoutDashboard }];

  if (isSuperAdmin) {
    nav.push({ title: "Companies", href: "/admin/companies", icon: Building2 });
  }

  if (hasEffectivePermission("LEAD_READ")) {
    nav.push({ title: "Leads", href: "/leads", icon: Contact });
  }
  if (hasEffectivePermission("SITE_VISIT_READ")) {
    nav.push({ title: "Site Visits", href: "/site-visits", icon: MapPin });
  }
  if (hasEffectivePermission("OPPORTUNITY_READ")) {
    nav.push({ title: "Opportunities", href: "/opportunities", icon: TrendingUp });
  }
  if (hasEffectivePermission("QUOTATION_READ")) {
    nav.push({ title: "Quotations", href: "/quotations", icon: FileText });
  }
  if (hasEffectivePermission("BOOKING_READ")) {
    nav.push({ title: "Bookings", href: "/bookings", icon: CalendarCheck });
  }
  if (hasEffectivePermission("PAYMENT_READ")) {
    nav.push({ title: "Payments", href: "/payments", icon: CreditCard });
  }
  if (hasEffectivePermission("RECEIPT_READ")) {
    nav.push({ title: "Receipts", href: "/receipts", icon: Receipt });
  }
  if (profileName?.toLowerCase() !== "sales" && hasEffectivePermission("PROJECT_READ")) {
    nav.push({ title: "Projects", href: "/projects", icon: FolderKanban });
  }
  if (hasEffectivePermission("UNIT_READ")) {
    nav.push({ title: "Units", href: "/units", icon: Building });
  }
  if (hasEffectivePermission("TASK_READ")) {
    nav.push({ title: "Tasks", href: "/tasks", icon: CheckSquare });
  }
  // Dashboards nav is admin-only. DASHBOARD_READ alone is NOT sufficient — every
  // profile holds it because the home page API (homepages.ts) requires it.
  if ((isSuperAdmin || isAdmin) && hasEffectivePermission("DASHBOARD_READ")) {
    nav.push({ title: "Dashboards", href: "/dashboards", icon: LayoutDashboard });
  }
  // Reports is always offered in the nav; actual report access is enforced
  // server-side by authorize('Report', 'read') on every reports endpoint.
  nav.push({ title: "Reports", href: "/reports", icon: BarChart3 });
  if (!isSuperAdmin && !isAdmin && hasEffectivePermission("FOLLOW_UP_READ")) {
    nav.push({ title: "Followups", href: "/follow-ups", icon: Clock3 });
  }

  if (isSuperAdmin || isAdmin) {
    nav.push({ title: "Setup Home", href: "/setup", icon: Settings });
  }

  return nav;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { profile, roles, hasEffectivePermission, isSuperAdmin, isAdmin, tenant } = useAuth();

  const navigation = getNavigationByProfile(
    profile?.name,
    roles,
    hasEffectivePermission,
    isSuperAdmin,
    isAdmin
  );

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,#278db8_0%,#1479a8_55%,#075d91_100%)] text-white shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-44 opacity-30">
          <svg viewBox="0 0 256 176" preserveAspectRatio="none" className="h-full w-full">
            <path d="M0 92C58 42 95 76 145 48s76-25 111-4v132H0Z" fill="#55c7ee" />
            <path d="M0 126c49-41 91-28 139-54s83-25 117-11v115H0Z" fill="#074f86" />
          </svg>
        </div>
        <div className="relative z-10 flex h-16 items-center justify-between border-b border-white/15 px-4">
          <Link href="/home" className="flex items-center gap-2">
            {tenant && (tenant as any).logo ? (
              <img
                src={`/api/proxy/api/super-admin/logos/${(tenant as any).logo}`}
                alt={tenant.name}
                className="h-7 w-7 rounded object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 shadow-sm">
                <span className="text-xs font-bold text-white">DCT</span>
              </div>
            )}
            <span className="text-sm font-semibold text-white">{isSuperAdmin ? "CRM" : tenant?.name || "CRM"}</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/15 hover:text-white lg:hidden">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="relative z-10 h-[calc(100vh-4rem)] py-3">
          <nav className="space-y-0.5 px-2">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-white/90 transition-colors hover:bg-white/15 hover:text-white",
                  isActive(item.href)
                    ? "bg-white/20 text-white shadow-sm ring-1 ring-inset ring-white/10"
                    : ""
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.title}
                {isActive(item.href) && <ChevronRight className="ml-auto h-3.5 w-3.5" />}
              </Link>
            ))}
          </nav>
        </ScrollArea>
      </aside>
    </>
  );
}