import { ComingSoon } from '@/components/zone/ComingSoon';

export const dynamic = 'force-dynamic';

export default function ComingSoonPage({
  searchParams,
}: {
  searchParams: { distance?: string };
}) {
  const distanceKm = searchParams?.distance
    ? Number(searchParams.distance)
    : undefined;

  return <ComingSoon distanceKm={distanceKm} />;
}
