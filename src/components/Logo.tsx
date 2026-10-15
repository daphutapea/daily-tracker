/**
 * The Daily Tracker mark: the day ruler with the teal "now" line, on an ink tile. The numbers come
 * from scripts/make-logo.swift, which also writes the favicon and docs/brand/; change them there
 * first. The colours are the brand's and don't follow the palette, so the mark looks the same
 * everywhere, like the app icon.
 */
export function LogoMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={`shrink-0 ${className}`}>
      <rect width="64" height="64" rx="14" fill="#0E1E33" />
      {/* Invisible on light surfaces; on dark ones --logo-edge outlines the tile (see index.css). */}
      <rect x="1.5" y="1.5" width="61" height="61" rx="12.5" fill="none" stroke="var(--logo-edge, transparent)" strokeWidth="3" />
      <path
        d="M12 40H52M12 40V31M22 40V35M32 40V31M42 40V35M52 40V31"
        fill="none"
        stroke="#8796AA"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M37 15V48" stroke="#2DD4BF" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}
