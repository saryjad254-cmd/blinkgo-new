/** Compatibility wrapper kept for older screens. New code uses BlinkLogo. */
import { BlinkLogo } from './BlinkLogo';

interface BlinkGoWordmarkProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'inverse';
}

export function BlinkGoWordmark({
  className,
  size = 'md',
}: BlinkGoWordmarkProps) {
  return <BlinkLogo variant="wordmark" size={size} className={className} />;
}
