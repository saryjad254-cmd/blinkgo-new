import type * as Leaflet from 'leaflet';

type LeafletApi = typeof Leaflet;

let leafletPromise: Promise<LeafletApi> | null = null;
let clusterPromise: Promise<LeafletApi> | null = null;

/** Load the bundled Leaflet runtime without injecting third-party scripts. */
export function loadLeaflet(): Promise<LeafletApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Leaflet is browser-only'));
  if (!leafletPromise) {
    leafletPromise = import('leaflet').then((module) => {
      const api = (module.default ?? module) as unknown as LeafletApi;
      (window as typeof window & { L?: LeafletApi }).L = api;
      return api;
    });
  }
  return leafletPromise;
}

/** Load Leaflet plus the locally bundled marker-clustering plugin. */
export function loadLeafletWithCluster(): Promise<LeafletApi> {
  if (!clusterPromise) {
    clusterPromise = loadLeaflet().then(async (api) => {
      await import('leaflet.markercluster');
      return api;
    });
  }
  return clusterPromise;
}
