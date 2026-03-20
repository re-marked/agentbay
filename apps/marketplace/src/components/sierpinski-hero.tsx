/**
 * Upside-down Sierpinski triangle, order 3.
 * 27 filled sub-triangles forming the fractal pattern.
 * Used on the landing page hero — distinct from the order-2 site logo.
 */
export function SierpinskiHero({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 111"
      className={className}
      role="img"
      aria-label="AgentBay fractal"
    >
      {/* Solid background triangle — blocks rays from showing through gaps */}
      <polygon points="0,0 128,0 64,110.8" fill="oklch(21.62% 0.0019 67.72)" />

      <g fill="currentColor">
        {/* Row 1: top-left order-2 block */}
        <polygon points="0,0 16,0 8,13.85" />
        <polygon points="16,0 32,0 24,13.85" />
        <polygon points="8,13.85 24,13.85 16,27.7" />

        <polygon points="32,0 48,0 40,13.85" />
        <polygon points="48,0 64,0 56,13.85" />
        <polygon points="40,13.85 56,13.85 48,27.7" />

        <polygon points="16,27.7 32,27.7 24,41.55" />
        <polygon points="32,27.7 48,27.7 40,41.55" />
        <polygon points="24,41.55 40,41.55 32,55.4" />

        {/* Row 1: top-right order-2 block */}
        <polygon points="64,0 80,0 72,13.85" />
        <polygon points="80,0 96,0 88,13.85" />
        <polygon points="72,13.85 88,13.85 80,27.7" />

        <polygon points="96,0 112,0 104,13.85" />
        <polygon points="112,0 128,0 120,13.85" />
        <polygon points="104,13.85 120,13.85 112,27.7" />

        <polygon points="80,27.7 96,27.7 88,41.55" />
        <polygon points="96,27.7 112,27.7 104,41.55" />
        <polygon points="88,41.55 104,41.55 96,55.4" />

        {/* Row 2: bottom order-2 block */}
        <polygon points="32,55.4 48,55.4 40,69.25" />
        <polygon points="48,55.4 64,55.4 56,69.25" />
        <polygon points="40,69.25 56,69.25 48,83.1" />

        <polygon points="64,55.4 80,55.4 72,69.25" />
        <polygon points="80,55.4 96,55.4 88,69.25" />
        <polygon points="72,69.25 88,69.25 80,83.1" />

        <polygon points="48,83.1 64,83.1 56,96.95" />
        <polygon points="64,83.1 80,83.1 72,96.95" />
        <polygon points="56,96.95 72,96.95 64,110.8" />
      </g>
    </svg>
  )
}
