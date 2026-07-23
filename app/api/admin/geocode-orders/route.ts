/**
 * Admin: Geocode active orders' delivery addresses
 * 
 * For each active order with a delivery_address string (no coords),
 * use a simple keyword lookup to set reasonable coordinates.
 * 
 * In production, this would use Google Geocoding API.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { getApiUserWithRole } from '@/lib/auth-helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const auth = await getApiUserWithRole();
    if (!auth || auth.profile?.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }
    const supabase = createServiceClient();

    // Get all active orders
    const { data: orders } = await supabase
      .from('orders')
      .select('id, delivery_address, customer_latitude, customer_longitude')
      .in('status', ['confirmed', 'preparing', 'ready', 'picked_up', 'delivering']);

    if (!orders) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    let updated = 0;
    const results: any[] = [];

    for (const o of orders) {
      // Skip if already has coords
      if (o.customer_latitude && o.customer_longitude) {
        results.push({ id: o.id, skipped: 'has_coords' });
        continue;
      }

      // Get address string
      let addr: any = o.delivery_address;
      if (typeof addr === 'string') {
        try { addr = JSON.parse(addr); } catch { /* keep string */ }
      }
      const addrStr = typeof addr === 'object' ? (addr?.formatted_address || addr?.address || JSON.stringify(addr)) : (addr || '');

      // Determine coordinates based on address keywords
      let lat: number | null = null;
      let lng: number | null = null;

      // Default to Bonn center if nothing matches
      const DEFAULT_LAT = 50.7374;
      const DEFAULT_LNG = 7.0982;

      // Add some variation so different orders have different positions
      const offset = (o.id.charCodeAt(0) % 20) / 1000; // 0-0.019
      
      // Match by street name
      if (addrStr.includes('Sechtemer')) {
        // Sechtemer Str. - south of Bonn
        lat = 50.705 + offset;
        lng = 7.085;
      } else if (addrStr.includes('Kölnstraße')) {
        lat = 50.732;
        lng = 7.09;
      } else if (addrStr.includes('Meckenheim') || addrStr.includes('Rheinbach')) {
        lat = 50.625;
        lng = 7.025;
      } else if (addrStr.includes('Wesseling')) {
        lat = 50.825;
        lng = 6.985;
      } else if (addrStr.includes('Bornheim')) {
        lat = 50.755;
        lng = 6.985;
      } else if (addrStr.includes('Sankt Augustin')) {
        lat = 50.775;
        lng = 7.185;
      } else {
        // Default with small offset
        lat = DEFAULT_LAT + (offset - 0.01);
        lng = DEFAULT_LNG + (offset - 0.01);
      }

      // Parse JSON delivery_address if needed
      let newDeliveryAddress: any;
      if (typeof addr === 'object' && addr !== null) {
        newDeliveryAddress = { ...addr, lat, lng };
      } else {
        newDeliveryAddress = {
          formatted_address: addrStr,
          address: addrStr,
          lat,
          lng,
        };
      }

      const { error } = await supabase
        .from('orders')
        .update({
          customer_latitude: lat,
          customer_longitude: lng,
          delivery_address: newDeliveryAddress,
        })
        .eq('id', o.id);

      if (error) {
        results.push({ id: o.id, error: error.message });
      } else {
        updated++;
        results.push({ id: o.id, lat, lng });
      }
    }

    return NextResponse.json({ ok: true, updated, results });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
