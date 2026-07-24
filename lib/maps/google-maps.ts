/**
 * Google Maps Configuration
 * ─────────────────────────
 * Production-grade loader for Google Maps JS API.
 * Handles all edge cases: SSR, script already loaded, slow networks, invalid keys.
 */

export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export const GOOGLE_MAPS_LIBRARIES: ('places' | 'geometry' | 'drawing' | 'visualization')[] = [
  'places',
  'geometry',
];

export const DEFAULT_MAP_OPTIONS: google.maps.MapOptions = {
  zoom: 14,
  center: { lat: 50.7374, lng: 7.0982 },
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  gestureHandling: 'greedy',
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0f' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
    { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
    { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] },
  ],
};

let loadingPromise: Promise<typeof google> | null = null;
let scriptLoaded = false;

export function isGoogleMapsLoaded(): boolean {
  return typeof window !== 'undefined' && 
         typeof google !== 'undefined' && 
         !!google.maps && 
         !!(google.maps as any).Map;
}

/**
 * Load Google Maps JS API. Safe to call multiple times.
 * Resolves with the full google.maps namespace (including Map class).
 * Rejects with a meaningful error if anything fails.
 */
export function loadGoogleMaps(): Promise<typeof google> {
  // SSR check
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Cannot load Google Maps on the server'));
  }

  // No API key
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set'));
  }

  // Already fully loaded
  if (isGoogleMapsLoaded()) {
    return Promise.resolve(google);
  }

  // Loading in progress
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise<typeof google>((resolve, reject) => {
    const TIMEOUT_MS = 12000;

    // Timeout safety net
    const timeout = setTimeout(() => {
      loadingPromise = null;
      reject(new Error(`Google Maps failed to load within ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    // Poll for the Map class to become available
    const checkInterval = setInterval(() => {
      if (isGoogleMapsLoaded()) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        resolve(google);
      }
    }, 100);

    // Inject the script if not already present
    let script = document.getElementById('google-maps-script') as HTMLScriptElement | null;
    
    if (!script) {
      script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=${GOOGLE_MAPS_LIBRARIES.join(',')}&v=weekly&loading=async&callback=__googleMapsReady`;
      script.async = true;
      script.defer = true;
      
      script.onerror = () => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        loadingPromise = null;
        reject(new Error('Failed to load Google Maps script (network or API key issue)'));
      };

      // Set up callback that gets invoked when the script is ready
      (window as any).__googleMapsReady = () => {
        scriptLoaded = true;
        // Don't resolve here - the polling will detect Map class
      };

      document.head.appendChild(script);
    }
  }).catch((err) => {
    loadingPromise = null; // allow retry
    throw err;
  });

  return loadingPromise;
}

// =============================================================================
// MAP UTILITIES
// =============================================================================

export function calculateDistance(
  lat1: number, lng1: number, 
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function estimateTravelTime(distanceKm: number, avgSpeedKmh = 25): number {
  return Math.ceil((distanceKm / avgSpeedKmh) * 60);
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; formatted_address: string } | null> {
  if (!GOOGLE_MAPS_API_KEY || !address.trim()) return null;
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`);
    const data = await res.json();
    if (data.status === 'OK' && data.results?.[0]) {
      const top = data.results[0];
      return {
        lat: top.geometry.location.lat,
        lng: top.geometry.location.lng,
        formatted_address: top.formatted_address,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function googleMapsUrl(lat: number, lng: number, label?: string): string {
  if (label) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=&query_string=${encodeURIComponent(label)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function googleMapsDirectionsUrl(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving'
): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=${mode}`;
}

export const MARKER_ICONS: Record<string, string> = {
  restaurant: '🍔',
  market: '🛒',
  pharmacy: '💊',
  customer: '🏠',
  driver: '🚗',
};
