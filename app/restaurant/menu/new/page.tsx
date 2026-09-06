import { redirect } from 'next/navigation';

export default function LegacyNewProductPage() {
  redirect('/restaurant/menu/requests/new');
}
