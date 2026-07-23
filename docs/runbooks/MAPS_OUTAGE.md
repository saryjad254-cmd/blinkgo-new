# Maps Outage Runbook

> **When to use**: Google Maps API errors, OSM tile failures, or geocoding broken.

## Symptoms

- Map doesn't load
- "For development purposes only" watermark on Google Maps
- Geocoding requests failing
- Distance calculations broken
- Customer/driver locations not displaying

## Immediate Actions

### 1. Identify Scope
```bash
# Check Google Maps API status
curl -H "Referer: https://app.blinkgo.com" \
  "https://maps.googleapis.com/maps/api/js?key=$GOOGLE_MAPS_KEY" \
  -o /dev/null -w "%{http_code}\n"

# Check our error rate
curl http://localhost:3000/api/metrics | grep -E "maps_|geocoding_"
```

### 2. Fall Back to OpenStreetMap
The app already has OSM as a fallback. Verify it's active:

```typescript
// In map components
const useOSM = !googleMapsAvailable || isOffline;
```

## During Outage

### Customer Impact
- **Order placement**: Still works, uses cached addresses
- **Live tracking**: Falls back to approximate location (city-level)
- **Address search**: Use cached autocomplete + manual entry

### Driver Impact
- **Navigation**: Opens external app (Google Maps, Waze, Apple Maps) - works independently
- **GPS tracking**: Still works (device GPS, no map API needed)
- **Route calculation**: Falls back to Haversine distance (less accurate but functional)

### Restaurant Impact
- **Address display**: Still works (cached data)
- **New restaurant onboarding**: Manual address entry only

## Implementation Notes

### Already-Built Fallbacks
- ✅ Haversine distance calculation (`lib/utils/driver-eta.ts`)
- ✅ OSM tile support (`lib/maps/osm-tiles.ts`)
- ✅ Cached geocoding results
- ✅ External navigation deep links

### Code Locations
- Map components: `components/maps/`
- Distance: `lib/maps/distance.ts`
- Geocoding: `lib/maps/geocoding.ts`

## Recovery

### 1. Verify API Recovery
```bash
curl -H "Referer: https://app.blinkgo.com" \
  "https://maps.googleapis.com/maps/api/geocode/json?address=Bonn&key=$GOOGLE_MAPS_KEY"
```

### 2. Clear Cache if Needed
```bash
redis-cli FLUSHDB
# Or in our app:
curl -X POST http://localhost:3000/api/admin/cache/clear \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 3. Verify Maps Loading
- Open https://app.blinkgo.com
- Check browser console for map errors
- Test address autocomplete
- Verify directions work

## Cost-Saving Tips During Outage
- Switch off Street View
- Reduce zoom levels
- Disable Places autocomplete
- Use static map images only
