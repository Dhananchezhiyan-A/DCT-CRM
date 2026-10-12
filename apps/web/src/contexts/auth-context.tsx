"use client";

import * as React from "react";
import { normalizePermissionName } from "@dct-crm/shared";
import { authApi, ApiResponse } from "@/lib/api";

export interface UserProfile {
  id: string;
  name: string;
  description?: string;
  isAdmin?: boolean;
}

export interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  phone?: string;
  isSuperAdmin?: boolean;
  impersonatedBy?: string | null;
}

export interface AuthContextType {
  user: UserData | null;
  profile: UserProfile | null;
  roles: string[];
  permissions: Record<string, any>;
  effectivePermissions: string[];
  effectivePermissionsByModule: Record<string, string[]>;
  hasFullAccess: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  tenant: { id: string; name: string; slug: string } | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasRole: (role: string) => boolean;
  hasPermission: (objectName: string, action: string) => boolean;
  hasEffectivePermission: (permissionName: string) => boolean;
  hasAnyEffectivePermission: (permissionNames: string[]) => boolean;
  hasModulePermission: (module: string, action: string) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<UserData | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [roles, setRoles] = React.useState<string[]>([]);
  const [permissions, setPermissions] = React.useState<Record<string, any>>({});
  const [effectivePermissions, setEffectivePermissions] = React.useState<string[]>([]);
  const [effectivePermissionsByModule, setEffectivePermissionsByModule] = React.useState<Record<string, string[]>>({});
  const [hasFullAccess, setHasFullAccess] = React.useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [tenant, setTenant] = React.useState<{ id: string; name: string; slug: string } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadUser = React.useCallback(async () => {
    try {
      const res = await authApi.me();
      if (res.data.success && res.data.data) {
        const data = res.data.data;
        setUser(data.user);
        setRoles(data.roles || []);
        setPermissions(data.permissions || {});
        setEffectivePermissions(data.effectivePermissions || []);
        setEffectivePermissionsByModule(data.effectivePermissionsByModule || {});
        setHasFullAccess(data.hasFullAccess || false);
        setIsSuperAdmin(data.user?.isSuperAdmin || false);
        setTenant(data.tenant);
        if (data.profile) {
          setProfile(data.profile);
        }
        setIsAdmin(Boolean(data.user?.isSuperAdmin || data.profile?.isAdmin));
      }
    } catch (error) {
      // Not authenticated - will redirect to login via API interceptor
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadUser();
  }, [loadUser]);

  const hasRole = React.useCallback(
    (role: string) => roles.includes(role),
    [roles]
  );

  const hasEffectivePermission = React.useCallback(
    (permissionName: string) => {
      if (hasFullAccess) return true;
      const requestedPermission = normalizePermissionName(permissionName);
      return effectivePermissions.some(
        (grantedPermission) => normalizePermissionName(grantedPermission) === requestedPermission
      );
    },
    [effectivePermissions, hasFullAccess]
  );

  const hasPermission = React.useCallback(
    (objectName: string, action?: string) => {
      if (!action) {
        return hasEffectivePermission(objectName);
      }

      const normalizedAction = (action || "").toLowerCase();
      const aliasMap: Record<string, string> = {
        view: "read",
        edit: "update",
        delect: "delete",
      };
      const normalizedPermission = aliasMap[normalizedAction] || normalizedAction;

      const objectNameCandidates = new Set<string>([
        objectName,
        objectName.replace(/([a-z])([A-Z])/g, "$1_$2"),
        objectName.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase(),
      ]);

      const objPerms = Array.from(objectNameCandidates).reduce<Record<string, any> | undefined>((result, candidate) => {
        if (result) return result;
        return permissions[candidate] || result;
      }, undefined);

      if (objPerms) {
        if (objPerms.modifyAll) return true;
        if (normalizedPermission === "read" && objPerms.viewAll) return true;
        return !!objPerms[normalizedPermission];
      }

      const moduleName = objectName.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
      const permissionName = `${moduleName}_${normalizedPermission.toUpperCase()}`;
      if (normalizedPermission === "read" && hasEffectivePermission(`${moduleName}_VIEW_ALL`)) return true;
      if (normalizedPermission === "delete" && hasEffectivePermission(`${moduleName}_MODIFY_ALL`)) return true;
      if (normalizedPermission === "update" && hasEffectivePermission(`${moduleName}_MODIFY_ALL`)) return true;
      return hasEffectivePermission(permissionName);
    },
    [hasEffectivePermission, permissions]
  );

  const hasAnyEffectivePermission = React.useCallback(
    (permissionNames: string[]) => {
      if (hasFullAccess) return true;
      return permissionNames.some((name) => hasEffectivePermission(name));
    },
    [hasEffectivePermission, hasFullAccess]
  );

  const hasModulePermission = React.useCallback(
    (module: string, action: string) => {
      if (hasFullAccess) return true;
      return hasEffectivePermission(`${module}_${action}`);
    },
    [hasEffectivePermission, hasFullAccess]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        roles,
        permissions,
        effectivePermissions,
        effectivePermissionsByModule,
        hasFullAccess,
        isSuperAdmin,
        isAdmin,
        tenant,
        isLoading,
        isAuthenticated: !!user,
        hasRole,
        hasPermission,
        hasEffectivePermission,
        hasAnyEffectivePermission,
        hasModulePermission,
        refresh: loadUser,
        logout: async () => {
          try {
            await authApi.logout();
          } catch (e) {
            // ignore
          } finally {
            setUser(null);
            setProfile(null);
            setRoles([]);
            setPermissions({});
            setEffectivePermissions([]);
            setEffectivePermissionsByModule({});
            setHasFullAccess(false);
            setIsSuperAdmin(false);
            setIsAdmin(false);
            setTenant(null);
            window.location.href = "/login";
          }
        },
        stopImpersonating: async () => {
          try {
            await authApi.stopImpersonation();
          } finally {
            window.location.href = "/home";
          }
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
