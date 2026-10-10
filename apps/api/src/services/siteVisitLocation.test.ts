import { describe, expect, it } from 'vitest';
import {
  checkSiteVisitLocation,
  SITE_VISIT_GEOFENCE_RADIUS_METERS,
} from './siteVisitLocation';

describe('checkSiteVisitLocation', () => {
  it.each([
    ['DCT Paradise', 13.003789, 80.262671],
    ['DCT Heights', 13.0294519, 80.1952235],
  ])('allows an exact match at %s', (projectName, latitude, longitude) => {
    expect(checkSiteVisitLocation(projectName, latitude, longitude, 100, latitude, longitude, 10)).toEqual({
      allowed: true,
      distanceMeters: 0,
      radiusMeters: 100,
    });
  });

  it('allows coordinates within 100 meters', () => {
    const check = checkSiteVisitLocation('DCT Paradise', 13.003789, 80.262671, 100, 13.004, 80.262671, 10);

    expect(check.allowed).toBe(true);
    if (check.allowed) {
      expect(check.distanceMeters).toBeLessThanOrEqual(SITE_VISIT_GEOFENCE_RADIUS_METERS);
    }
  });

  it('rejects coordinates outside the 100-meter radius', () => {
    expect(checkSiteVisitLocation('DCT Paradise', 13.003789, 80.262671, 100, 13.005, 80.262671, 10)).toEqual({
      allowed: false,
      code: 'OUTSIDE_RADIUS',
      error: 'You are currently 135 meters from DCT Paradise. You must be within 100 meters to complete this Site Visit.',
      distanceMeters: expect.any(Number),
      radiusMeters: 100,
    });
  });

  it('rejects a valid location when it belongs to the other project', () => {
    expect(checkSiteVisitLocation('DCT Heights', 13.0294519, 80.1952235, 100, 13.003789, 80.262671, 10)).toMatchObject({
      allowed: false,
      code: 'OUTSIDE_RADIUS',
      radiusMeters: 100,
    });
  });

  it('rejects projects without a configured location', () => {
    expect(checkSiteVisitLocation('Other Project', null, null, 100, 13.003789, 80.262671, 10)).toEqual({
      allowed: false,
      code: 'LOCATION_NOT_CONFIGURED',
      error: 'Location coordinates are not configured for Other Project.',
      radiusMeters: 100,
    });
  });

  it('allows an on-site reading with typical reduced GPS accuracy', () => {
    expect(checkSiteVisitLocation('DCT Heights', 13.0294519, 80.1952235, 100, 13.0294519, 80.1952235, 150)).toEqual({
      allowed: true,
      distanceMeters: 0,
      radiusMeters: 100,
    });
  });

  it('rejects GPS accuracy greater than 500 meters', () => {
    expect(checkSiteVisitLocation('DCT Heights', 13.0294519, 80.1952235, 100, 13.0294519, 80.1952235, 501)).toMatchObject({
      allowed: false,
      code: 'INACCURATE',
      radiusMeters: 100,
    });
  });

  it('uses the project allowed radius', () => {
    const check = checkSiteVisitLocation('DCT Heights', 13.0294519, 80.1952235, 200, 13.031, 80.1952235, 10);
    expect(check.allowed).toBe(true);
    if (check.allowed) expect(check.radiusMeters).toBe(200);
  });
});
