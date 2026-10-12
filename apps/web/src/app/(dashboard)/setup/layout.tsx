"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, isAuthenticated, isAdmin } = useAuth();

  React.useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdmin)) {
      router.replace(isAuthenticated ? "/home" : `/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, isAdmin, isLoading, pathname, router]);

  if (isLoading || !isAuthenticated || !isAdmin) return null;

  return children;
}
