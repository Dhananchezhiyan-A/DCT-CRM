export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export type GeolocationPermissionState = "granted" | "prompt" | "denied";

const MAX_LOCATION_ACCURACY_METERS = 500;
const LOCATION_SAMPLE_TIMEOUT_MS = 20_000;

export class GeolocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeolocationError';
  }
}

const toGeolocationError = (error: GeolocationPositionError): GeolocationError => {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new GeolocationError('Location permission was denied. Allow location access to complete the site visit.');
    case error.POSITION_UNAVAILABLE:
      return new GeolocationError('Your location could not be determined. Please try again.');
    case error.TIMEOUT:
      return new GeolocationError('Location request timed out. Please try again.');
    default:
      return new GeolocationError('Unable to read your location. Please try again.');
  }
};

export async function getGeolocationPermission(): Promise<GeolocationPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions) return "prompt";

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    return permission.state;
  } catch {
    return "prompt";
  }
}

export function getLocationSettingsInstructions(userAgent: string): string {
  const agent = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(agent)) {
    return "On iPhone or iPad, open Settings > Privacy & Security > Location Services. Turn on Location Services and allow your browser to access location. Then return here and retry.";
  }
  if (agent.includes("edg/")) {
    return "In Microsoft Edge, select the site controls icon beside the address, open Permissions for this site, set Location to Allow, then return here and retry.";
  }
  if (agent.includes("firefox/")) {
    return "In Firefox, select the permissions icon beside the address and allow Location for this site. If needed, open Settings > Privacy & Security > Permissions > Location and review this site's permission.";
  }
  if (agent.includes("chrome/") || agent.includes("chromium/")) {
    return "In Chrome, select the site controls icon beside the address, open Site settings, set Location to Allow, then return here and retry.";
  }
  if (agent.includes("safari/")) {
    return "In Safari on Mac, open Safari > Settings > Websites > Location and allow this site. Also check System Settings > Privacy & Security > Location Services.";
  }
  return "Open this site's permissions from the browser controls beside the address, set Location to Allow, and make sure Location Services are enabled for your device and browser.";
}

export function getCurrentCoordinates(): Promise<Coordinates> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return Promise.reject(new Error("Location requires HTTPS or localhost. Open the CRM using a secure URL."));
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error('Your browser does not support location verification.'));
  }

  return getGeolocationPermission().then((permission) => {
    if (permission === "denied") {
      const error = new Error("Location access is blocked. Set this site's Location permission to Allow in your browser settings, then try again.") as Error & { code?: number };
      error.code = 1;
      throw error;
    }

    return requestCurrentCoordinates();
  });
}

function requestCurrentCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    const fail = (message: string, code?: number) => {
      const locationError = new Error(message) as Error & { code?: number };
      locationError.code = code;
      reject(locationError);
    };

    const onError = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        fail("Location access is blocked. Open this site's information beside the address bar, set Location to Allow, then try again.", error.code);
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        fail("Your device could not provide a location. Turn on Location Services and allow this site to access your location, then try again.", error.code);
      } else if (error.code === error.TIMEOUT) {
        fail("Getting your current location timed out. Check Location Services and try again.", error.code);
      }
    };

    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords, timestamp }) => {
          const reading: Coordinates = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            timestamp,
          };
          if (!Number.isFinite(reading.latitude) || reading.latitude < -90 || reading.latitude > 90 ||
              !Number.isFinite(reading.longitude) || reading.longitude < -180 || reading.longitude > 180 ||
              !Number.isFinite(reading.accuracy) || reading.accuracy <= 0) {
            fail("Your device returned invalid GPS coordinates. Try again.");
            return;
          }
          if (reading.accuracy > MAX_LOCATION_ACCURACY_METERS) {
            fail(`GPS accuracy must be ${MAX_LOCATION_ACCURACY_METERS} meters or better. Move outdoors, enable precise location, and try again.`);
            return;
          }
          resolve(reading);
        },
        onError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: LOCATION_SAMPLE_TIMEOUT_MS },
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unable to read your current location.');
    }
  });
}