/**
 * Geolocation helpers
 * - Browser geolocation wrapper
 * - Heading / bearing calculation
 * - Format helpers
 */

export interface GpsPosition {
  lat: number;
  lng: number;
  accuracy: number;       // meters
  heading: number | null; // degrees, 0=N, 90=E
  speed: number | null;   // m/s
  timestamp: number;      // ms epoch
}

let lastPosition: GpsPosition | null = null;

/**
 * Start watching the driver's GPS location
 * Returns an unsubscribe function
 */
export function watchPosition(
  onUpdate: (pos: GpsPosition) => void,
  onError?: (err: GeolocationPositionError | Error) => void
): () => void {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    onError?.(new Error('Geolocation not supported'));
    return () => {};
  }

  // Try to get a high-accuracy first reading quickly
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const p = toGpsPosition(pos);
      lastPosition = p;
      onUpdate(p);
    },
    (err) => onError?.(err),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const p = toGpsPosition(pos);
      lastPosition = p;
      onUpdate(p);
    },
    (err) => onError?.(err),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}

function toGpsPosition(pos: GeolocationPosition): GpsPosition {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy || 0,
    heading: pos.coords.heading,
    speed: pos.coords.speed,
    timestamp: pos.timestamp,
  };
}

export function getLastKnownPosition(): GpsPosition | null {
  return lastPosition;
}

/**
 * Calculate bearing between two points in degrees
 * 0=N, 90=E, 180=S, 270=W
 */
export function calculateBearing(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Haversine distance in meters
 */
export function haversineDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

export function formatDistance(meters: number, locale: 'ar' | 'de' | 'en' = 'de'): string {
  if (meters < 1000) {
    return locale === 'ar' ? `${Math.round(meters)} م` : `${Math.round(meters)} m`;
  }
  const km = (meters / 1000).toFixed(1);
  return locale === 'ar' ? `${km} كم` : `${km} km`;
}

export function formatDuration(seconds: number, locale: 'ar' | 'de' | 'en' = 'de'): string {
  if (seconds < 60) {
    return locale === 'ar' ? `${Math.round(seconds)} ث` : `${Math.round(seconds)} s`;
  }
  const mins = Math.round(seconds / 60);
  if (mins < 60) {
    return locale === 'ar' ? `${mins} د` : `${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return locale === 'ar' ? `${hours} س ${rem} د` : `${hours}h ${rem}m`;
}
