import { ComingSoon } from '@/components/zone/ComingSoon';

export const dynamic = 'force-dynamic';

export default async function ComingSoonPage(
  props: {
    searchParams: Promise<{ distance?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const distanceKm = searchParams?.distance
    ? Number(searchParams.distance)
    : undefined;

  return <ComingSoon distanceKm={distanceKm} />;
}
