import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const navState = vi.hoisted(() => ({
  pathname: '/admin/customize-home',
  params: {} as Record<string, string>,
}));

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  isSuperAdmin: false,
  isAdmin: true,
  hasFullAccess: false,
  hasEffectivePermission: vi.fn(() => false),
  user: {
    id: 'u1',
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@dctcrm.com',
    isSuperAdmin: false,
  },
  profile: { id: 'p1', name: 'Admin' },
  roles: [] as string[],
  permissions: {} as Record<string, unknown>,
  effectivePermissions: [] as string[],
  effectivePermissionsByModule: {} as Record<string, unknown>,
  tenant: null,
  logout: vi.fn(),
  stopImpersonating: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => navState.pathname,
  useParams: () => navState.params,
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/contexts/auth-context', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => authState,
}));

vi.mock('@/lib/api', () => ({
  analyticsApi: {
    getLeads: vi.fn().mockResolvedValue({ data: { data: { total: 0 } } }),
    getOpportunities: vi.fn().mockResolvedValue({ data: { data: { total: 0 } } }),
    getPipeline: vi.fn().mockResolvedValue({ data: { data: { totalPipeline: 0, stages: [] } } }),
  },
  taskApi: { list: vi.fn().mockResolvedValue({ data: { data: [] } }) },
  activityApi: { list: vi.fn().mockResolvedValue({ data: { data: [] } }) },
  opportunityApi: { list: vi.fn().mockResolvedValue({ data: { data: [] } }) },
  homepageApi: {
    list: vi.fn().mockResolvedValue({ data: [{ id: 'homepage-1', name: 'Executive Dashboard' }] }),
    assigned: vi.fn().mockResolvedValue({ data: [] }),
    get: vi.fn().mockResolvedValue({ data: null }),
  },
  profileApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  reportApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  aiApi: { chat: vi.fn().mockResolvedValue({ data: {} }) },
}));

vi.mock('@/components/crm/search-dialog', () => ({
  SearchDialog: () => null,
}));

vi.mock('@/components/ui/toaster', () => ({
  Toaster: () => null,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  window.HTMLElement.prototype.releasePointerCapture = () => undefined;
}

import CustomizeHomePage from '../app/(dashboard)/admin/customize-home/page';
import DashboardLayout from '../app/(dashboard)/layout';

beforeEach(() => {
  navState.pathname = '/admin/customize-home';
  navState.params = {};
  authState.isAdmin = true;
  authState.isSuperAdmin = false;
  authState.isLoading = false;
  authState.isAuthenticated = true;
  routerMock.replace.mockClear();
  routerMock.push.mockClear();
});

describe('Customize Home standard route', () => {
  it('renders the homepage builder on /admin/customize-home (no profileName param)', async () => {
    render(<CustomizeHomePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Untitled Homepage')).toBeInTheDocument();
    });
    expect(routerMock.replace).not.toHaveBeenCalledWith('/home');
  });

  it('still renders the builder for /admin/customize-home/create', async () => {
    navState.params = { profileName: 'create' };
    render(<CustomizeHomePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Untitled Homepage')).toBeInTheDocument();
    });
  });
});

describe('Dashboard access guard for /admin/customize-home', () => {
  it('allows a plain Admin (isAdmin, not superadmin) to access the route', async () => {
    render(
      <DashboardLayout>
        <div data-testid="guard-child">GUARD_CHILD</div>
      </DashboardLayout>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('guard-child')).toBeInTheDocument();
    });
    expect(routerMock.replace).not.toHaveBeenCalledWith('/home');
  });

  it('blocks non-admin users from the route (renders nothing, redirects to /home)', async () => {
    authState.isAdmin = false;
    render(
      <DashboardLayout>
        <div data-testid="guard-child">GUARD_CHILD</div>
      </DashboardLayout>,
    );
    expect(screen.queryByTestId('guard-child')).toBeNull();
    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith('/home');
    });
  });

  it('keeps other /admin routes superadmin-only (plain Admin still blocked)', async () => {
    navState.pathname = '/admin/users';
    render(
      <DashboardLayout>
        <div data-testid="guard-child">GUARD_CHILD</div>
      </DashboardLayout>,
    );
    expect(screen.queryByTestId('guard-child')).toBeNull();
    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith('/home');
    });
  });

  it('allows superadmin on other /admin routes', async () => {
    navState.pathname = '/admin/users';
    authState.isSuperAdmin = true;
    render(
      <DashboardLayout>
        <div data-testid="guard-child">GUARD_CHILD</div>
      </DashboardLayout>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('guard-child')).toBeInTheDocument();
    });
    expect(routerMock.replace).not.toHaveBeenCalledWith('/home');
  });
});
