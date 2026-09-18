import { brand } from '@/config/brand';
import { cn } from '@/lib/cn';

/**
 * The app mark: a slip with a torn edge and a tick.
 * Kept to two shapes and one stroke weight so it stays legible at 16px.
 */
export function SlipMark({ size = 32, className, tone = 'brand' }: { size?: number; className?: string; tone?: 'brand' | 'inverse' }) {
  const bg = tone === 'inverse' ? '#FFFFFF' : 'hsl(162 60% 10%)';
  const fg = tone === 'inverse' ? 'hsl(162 60% 10%)' : '#FFFFFF';
  const accent = tone === 'inverse' ? 'hsl(146 62% 33%)' : 'hsl(150 45% 76%)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={`${brand.name} logo`}
      className={cn('shrink-0', className)}
    >
      <rect width="48" height="48" rx="12.2" fill={bg} />
      <path
        d="M16.9 11.3h14.2a1.1 1.1 0 0 1 1.1 1.1v24.2l-2.7-1.9-2.8 1.9-2.7-1.9-2.8 1.9-2.7-1.9-2.8 1.9V12.4a1.1 1.1 0 0 1 1.1-1.1Z"
        fill="none"
        stroke={fg}
        strokeWidth="2.44"
        strokeLinejoin="round"
      />
      <path d="M19.1 16.9h9.8" stroke={accent} strokeWidth="2.25" strokeLinecap="round" />
      <path d="M19.1 21.8h6.4" stroke={accent} strokeWidth="2.25" strokeLinecap="round" />
      <path
        d="m19.1 28.1 3.2 3.2 6.6-7.1"
        fill="none"
        stroke={accent}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wordmark: mark + name, used in navigation and on auth screens. */
export function Wordmark({
  size = 'md',
  tone = 'brand',
  showTagline = false,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'brand' | 'inverse';
  showTagline?: boolean;
  className?: string;
}) {
  const markSize = size === 'lg' ? 44 : size === 'sm' ? 26 : 34;
  const textSize = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-2xl';

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <SlipMark size={markSize} tone={tone} />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-extrabold tracking-[-0.03em]',
            textSize,
            tone === 'inverse' ? 'text-white' : 'text-forest-900',
          )}
        >
          {brand.name}
        </span>
        {showTagline ? (
          <span className={cn('mt-1 text-xs font-medium', tone === 'inverse' ? 'text-mint-200' : 'text-ink-500')}>
            {brand.tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
