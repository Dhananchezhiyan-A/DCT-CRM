export const SITE_VISIT_GEOFENCE_RADIUS_METERS = 100;
export const MAX_SITE_VISIT_GPS_ACCURACY_METERS = 500;

export type SiteVisitLocationCheck =
  | { allowed: true; distanceMeters: number; radiusMeters: number }
  | {
      allowed: false;
      code: 'LOCATION_NOT_CONFIGURED' | 'INACCURATE' | 'OUTSIDE_RADIUS';
      error: string;
      distanceMeters?: number;
      radiusMeters: number;
    };

function distanceInMeters(
  latitude: number,
  longitude: number,
  targetLatitude: number,
  targetLongitude: number,
): number {
  const radians = (degrees: number) => degrees * (Math.PI / 180);
  const latitudeDelta = radians(targetLatitude - latitude);
  const longitudeDelta = radians(targetLongitude - longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitude)) *
      Math.cos(radians(targetLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

export function checkSiteVisitLocation(
  projectName: string | null | undefined,
  projectLatitude: number | null | undefined,
  projectLongitude: number | null | undefined,
  radiusMeters: number | null | undefined,
  latitude: number,
  longitude: number,
  accuracyMeters: number,
): SiteVisitLocationCheck {
  const allowedRadius = radiusMeters ?? SITE_VISIT_GEOFENCE_RADIUS_METERS;

  if (projectLatitude == null || projectLongitude == null) {
    return {
      allowed: false,
      code: 'LOCATION_NOT_CONFIGURED',
      error: `Location coordinates are not configured for ${projectName || 'this project'}.`,
      radiusMeters: allowedRadius,
    };
  }

  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0 || accuracyMeters > MAX_SITE_VISIT_GPS_ACCURACY_METERS) {
    return {
      allowed: false,
      code: 'INACCURATE',
      error: `Your GPS location is not accurate enough (accuracy must be ${MAX_SITE_VISIT_GPS_ACCURACY_METERS} meters or better). Move outdoors or enable precise location, then try again.`,
      radiusMeters: allowedRadius,
    };
  }

  const distanceMeters = distanceInMeters(
    latitude,
    longitude,
    projectLatitude,
    projectLongitude,
  );

  if (distanceMeters > allowedRadius) {
    return {
      allowed: false,
      code: 'OUTSIDE_RADIUS',
      error: `You are currently ${Math.round(distanceMeters)} meters from ${projectName || 'the project'}. You must be within ${allowedRadius} meters to complete this Site Visit.`,
      distanceMeters,
      radiusMeters: allowedRadius,
    };
  }

  return { allowed: true, distanceMeters, radiusMeters: allowedRadius };
}