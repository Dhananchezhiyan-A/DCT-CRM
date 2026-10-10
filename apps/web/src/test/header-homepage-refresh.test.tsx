import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const routeState = vi.hoisted(() => ({ value: '/home' }));
const searchState = vi.hoisted(() => ({ value: '' }));

const homepageApiMock = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue({
    data: [{ id: 'homepage-1', name: 'Executive Dashboard' }],
  }),
}));

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
    user: { firstName: 'Admin', lastName: 'User' },
    profile: null,
    logout: vi.fn(),
    isAdmin: true,
  }),
}));

vi.mock('@/lib/api', () => ({
  homepageApi: homepageApiMock,
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
    vi.clearAllMocks();
    routeState.value = '/home';
    searchState.value = '';
    homepageApiMock.list.mockResolvedValue({
      data: [{ id: 'homepage-1', name: 'Executive Dashboard' }],
    });
    profileApiMock.list.mockResolvedValue({ data: [] });
  });

  it('refreshes the admin homepages list on mount, not on route change, but on dropdown open', async () => {
    const { rerender, getByRole } = render(<Header onMenuClick={() => undefined} />);

    await waitFor(() => {
      expect(homepageApiMock.list).toHaveBeenCalledTimes(1);
    });

    routeState.value = '/admin/customize-home';
    rerender(<Header onMenuClick={() => undefined} />);
    expect(homepageApiMock.list).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(getByRole('button', { name: /Admin Home/i }), { key: 'Enter' });

    await waitFor(() => {
      expect(homepageApiMock.list).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the selected homepage name and restores Admin Home as the fallback', async () => {
    searchState.value = 'homepage=homepage-1';
    const { rerender, getByRole } = render(<Header onMenuClick={() => undefined} />);

    await waitFor(() => {
      expect(getByRole('button', { name: /Executive Dashboard/i })).toBeTruthy();
    });

    searchState.value = '';
    rerender(<Header onMenuClick={() => undefined} />);

    await waitFor(() => {
      expect(getByRole('button', { name: /Admin Home/i })).toBeTruthy();
    });
  });
});