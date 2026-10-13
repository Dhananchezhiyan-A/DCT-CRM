import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const routeState = vi.hoisted(() => ({ value: '/home' }));
const searchState = vi.hoisted(() => ({ value: '' }));

const profileApiMock = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => routeState.value,
  useSearchParams: () => new URLSearchParams(searchState.value),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { firstName: 'Admin', lastName: 'User', email: 'admin@example.test', phone: '1234567890' },
    profile: { id: 'profile-admin', name: 'Superadmin', description: 'Platform administrator' },
    roles: ['Administrator'],
    tenant: { id: 'tenant-1', name: 'Test Company', slug: 'test-company' },
    logout: vi.fn(),
    isAdmin: true,
    isSuperAdmin: false,
  }),
}));

vi.mock('@/lib/api', () => ({
  profileApi: profileApiMock,
}));

vi.mock('@/components/crm/search-dialog', () => ({
  SearchDialog: () => null,
}));

import { Header } from '../components/layout/header';

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
  window.HTMLElement.prototype.setPointerCapture = () => undefined;
  window.HTMLElement.prototype.releasePointerCapture = () => undefined;
}

describe('Header admin home refresh', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    routeState.value = '/home';
    searchState.value = '';
    profileApiMock.list.mockResolvedValue({ data: [] });
  });

  it('loads profiles on mount and refreshes them when the dropdown opens', async () => {
    const { rerender, getByRole } = render(<Header onMenuClick={() => undefined} />);

    await waitFor(() => {
      expect(profileApiMock.list).toHaveBeenCalledWith({ limit: 100 });
    });

    routeState.value = '/admin/customize-home';
    rerender(<Header onMenuClick={() => undefined} />);
    expect(profileApiMock.list).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(getByRole('button', { name: /Admin Home/i }), { key: 'Enter' });

    await waitFor(() => {
      expect(profileApiMock.list).toHaveBeenCalledTimes(2);
    });
  });

  it('does not show a custom homepages label for a selected homepage', async () => {
    searchState.value = 'homepage=homepage-1';
    const { getByRole } = render(<Header onMenuClick={() => undefined} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(getByRole('button', { name: /Admin Home/i })).toBeTruthy();
  });

  it('opens logged-in user details from the profile name', async () => {
    const { getByRole, getByText } = render(
      <Header onMenuClick={() => undefined} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => fireEvent.click(getByRole('button', { name: 'Superadmin' })));

    expect(getByRole('dialog')).toBeTruthy();
    expect(getByText('Admin User')).toBeTruthy();
    expect(getByText('admin@example.test')).toBeTruthy();
    expect(getByText('1234567890')).toBeTruthy();
    expect(getByText('Administrator')).toBeTruthy();
    expect(getByText('Test Company')).toBeTruthy();
  });
});