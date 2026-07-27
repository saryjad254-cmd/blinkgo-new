/**
 * PostCSS Configuration
 * ────────────────────
 * Production-stable PostCSS pipeline for Next.js 14.2.x + Tailwind CSS 3.4.x
 * 
 * Plugin versions are pinned in package.json (NOT devDependencies) so they
 * are ALWAYS installed by Vercel, regardless of NODE_ENV.
 * 
 * Order matters: tailwindcss first, then autoprefixer.
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
