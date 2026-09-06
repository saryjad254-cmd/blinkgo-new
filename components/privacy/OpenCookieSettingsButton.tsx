'use client';

import Settings2 from 'lucide-react/dist/esm/icons/settings-2';

export function OpenCookieSettingsButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('blinkgo:open-consent'))}
      className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e10600] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffc107]"
      data-testid="open-cookie-settings"
    >
      <Settings2 className="h-4 w-4" />
      {label}
    </button>
  );
}
