'use client';

import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface OrderSuccessAnimationProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
}

const sizes = {
  sm: { wrap: 'w-16 h-16', icon: 'w-8 h-8' },
  md: { wrap: 'w-24 h-24', icon: 'w-12 h-12' },
  lg: { wrap: 'w-32 h-32', icon: 'w-16 h-16' },
  xl: { wrap: 'w-40 h-40', icon: 'w-20 h-20' },
};

/**
 * Animated success checkmark — used after successful actions.
 *  - 2 expanding circles (depth)
 *  - 1 bouncing checkmark (delight)
 *  - Subtle confetti feel via staggered children
 */
export function OrderSuccessAnimation({
  className,
  size = 'md',
  text,
}: OrderSuccessAnimationProps) {
  const s = sizes[size];
  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="relative">
        {/* Outermost ring */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.2, 1], opacity: [0, 0.5, 0.3] }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className={cn('absolute inset-0 rounded-full bg-success/30', s.wrap)}
        />
        {/* Mid ring */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.1, 1], opacity: [0, 0.7, 0.5] }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
          className={cn('absolute inset-0 rounded-full bg-success/40', s.wrap)}
        />
        {/* Main checkmark */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            duration: 0.5,
            delay: 0.2,
            type: 'spring',
            stiffness: 200,
            damping: 12,
          }}
          className={cn(
            'relative rounded-full bg-success-gradient flex items-center justify-center shadow-glow-success',
            s.wrap,
          )}
        >
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.4, delay: 0.5, type: 'spring', stiffness: 300 }}
          >
            <CheckCircle2 className={cn('text-white', s.icon)} strokeWidth={2.5} />
          </motion.div>
        </motion.div>
      </div>
      {text && (
        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="text-base font-bold text-text text-center"
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}
