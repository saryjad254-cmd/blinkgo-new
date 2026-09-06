import { createServiceClient } from '@/lib/supabase/service';

export async function resolveOwnedRestaurant(userId: string, preferredRestaurantId?: string) {
  const service = createServiceClient();
  if (preferredRestaurantId) {
    const { data: preferred, error: preferredError } = await service
      .from('restaurants')
      .select('id')
      .eq('id', preferredRestaurantId)
      .eq('owner_id', userId)
      .maybeSingle();
    if (preferredError) throw preferredError;
    return { service, restaurantId: preferred?.id as string | undefined };
  }

  const { data: profile, error: profileError } = await service
    .from('users')
    .select('restaurant_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;

  if (profile?.restaurant_id) {
    const { data: linked, error: linkedError } = await service
      .from('restaurants')
      .select('id')
      .eq('id', profile.restaurant_id)
      .eq('owner_id', userId)
      .maybeSingle();
    if (linkedError) throw linkedError;
    if (linked) return { service, restaurantId: linked.id as string };
  }

  const { data: owned, error: ownedError } = await service
    .from('restaurants')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ownedError) throw ownedError;
  return { service, restaurantId: owned?.id as string | undefined };
}
