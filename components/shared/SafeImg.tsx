'use client';

/**
 * SafeImg — plain <img> that hides itself on load error so the styled
 * fallback behind it shows instead of the browser's broken-image icon.
 * Needed because Server Components cannot pass onError handlers to <img>.
 */
import { useState } from 'react';

export function SafeImg(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  if (failed || !props.src) return null;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...props} onError={() => setFailed(true)} />;
}
