import { describe, expect, it } from 'vitest';
import { getBookingAccess } from './booking-access';

describe('getBookingAccess', () => {
  it('requires BOOKING_CREATE before showing the new booking button', () => {
    const access = getBookingAccess((permission) => permission === 'BOOKING_READ' || permission === 'BOOKING_DELETE');

    expect(access.canCreate).toBe(false);
    expect(access.canView).toBe(true);
    expect(access.canCancel).toBe(true);
  });

  it('allows creating when the user has the create permission', () => {
    const access = getBookingAccess((permission) => permission === 'BOOKING_CREATE');

    expect(access.canCreate).toBe(true);
    expect(access.canView).toBe(false);
    expect(access.canEdit).toBe(false);
  });
});
