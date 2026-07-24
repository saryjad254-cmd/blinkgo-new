'use client';

import { Logo } from '@/components/ui/Logo';
import { motion } from 'framer-motion';

/**
 * Premium splash screen — used during app init and route transitions.
 *
 * - Animated brand logo
 * - Subtle particle effect (orbs)
 * - Loading indicator
 */
export function SplashScreen({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-brand-red-500/20 blur-3xl"
          animate={{ x: [0, 50, 0], y: [0, -30, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-brand-yellow-500/15 blur-3xl"
          animate={{ x: [0, -40, 0], y: [0, 40, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Logo */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative z-10"
      >
        <Logo size="xl" variant="mark" />
      </motion.div>

      {/* Brand name */}
      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="relative z-10 mt-6 text-3xl font-black bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active bg-clip-text text-transparent"
      >
        BlinkGo
      </motion.h1>

      {/* Loading indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className="relative z-10 mt-8"
      >
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-brand-red-500"
              animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
        {message && (
          <p className="text-sm text-text-muted mt-3 text-center">{message}</p>
        )}
      </motion.div>
    </div>
  );
}
