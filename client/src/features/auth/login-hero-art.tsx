/** The login panel illustration (grid, walked path, tokens with life bars, threat area, compass).
 *  Static decoration, not the interactive board: the board is PixiJS in `src/renderer/`.
 *
 *  Example: `<LoginHeroArt className="absolute inset-0 size-full" />` */
export function LoginHeroArt({ className }: Readonly<{ className?: string }>): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <pattern id="lk-hero-grid" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M56 0H0V56" fill="none" stroke="var(--primary)" strokeOpacity=".09" />
        </pattern>
        <radialGradient id="lk-hero-fade" cx="64%" cy="40%" r="62%">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="lk-hero-mask">
          <rect width="1000" height="1000" fill="url(#lk-hero-fade)" />
        </mask>
      </defs>
      <g mask="url(#lk-hero-mask)">
        <rect width="1000" height="1000" fill="url(#lk-hero-grid)" />
        <ContourLines />
        <ReachableCells />
        <path
          d="M476 700 L532 644 L588 644 L644 588"
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity=".55"
          strokeWidth="2"
          strokeDasharray="6 7"
          strokeLinecap="round"
        />
        <circle cx="476" cy="700" r="4" fill="var(--foreground)" fillOpacity=".5" />
        <circle
          cx="812"
          cy="420"
          r="118"
          fill="var(--destructive)"
          fillOpacity=".05"
          stroke="var(--destructive)"
          strokeOpacity=".45"
          strokeWidth="1.5"
          strokeDasharray="4 6"
        />
        <Tokens />
        <Compass />
      </g>
    </svg>
  );
}

function ContourLines(): React.JSX.Element {
  return (
    <g fill="none" stroke="var(--primary)" strokeWidth="1.2">
      <path
        strokeOpacity=".14"
        d="M440 60 C640 20 900 110 930 290 C960 470 800 580 620 560 C440 540 330 450 330 300 C330 170 360 80 440 60 Z"
      />
      <path
        strokeOpacity=".18"
        d="M520 120 C640 90 780 150 810 260 C840 370 760 460 640 470 C520 480 430 410 420 300 C410 200 440 140 520 120 Z"
      />
      <path
        strokeOpacity=".22"
        d="M560 190 C650 175 740 220 750 290 C760 360 700 410 620 412 C540 414 490 370 485 305 C480 240 500 200 560 190 Z"
      />
      <path
        strokeOpacity=".26"
        d="M600 250 C660 245 700 270 702 305 C704 340 670 362 625 362 C580 362 552 340 550 308 C548 276 565 254 600 250 Z"
      />
      <path
        strokeOpacity=".14"
        d="M140 520 C220 480 320 510 330 580 C340 650 270 700 190 690 C110 680 70 620 90 570 C100 545 115 532 140 520 Z"
      />
      <path
        strokeOpacity=".2"
        d="M175 560 C230 540 285 560 288 600 C291 640 245 660 195 652 C150 645 130 615 140 590 C146 575 158 566 175 560 Z"
      />
      <path
        strokeOpacity=".2"
        strokeWidth="2"
        d="M0 790 C120 750 220 810 330 770 C440 730 470 650 580 670 C690 690 760 790 1000 750"
      />
      <path
        strokeOpacity=".1"
        d="M0 802 C120 762 220 822 330 782 C440 742 470 662 580 682 C690 702 760 802 1000 762"
      />
    </g>
  );
}

const REACHABLE_CELLS: ReadonlyArray<readonly [number, number]> = [
  [588, 532],
  [644, 532],
  [532, 588],
  [588, 588],
  [532, 644],
  [476, 644],
  [644, 476],
];

function ReachableCells(): React.JSX.Element {
  return (
    <g fill="var(--primary)" fillOpacity=".07">
      {REACHABLE_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="56" height="56" />
      ))}
    </g>
  );
}

function LifeBar({
  x,
  y,
  filled,
  color,
}: Readonly<{ x: number; y: number; filled: number; color: string }>): React.JSX.Element {
  return (
    <>
      <rect x={x} y={y} width="36" height="4" rx="2" fill="var(--input)" />
      <rect x={x} y={y} width={filled} height="4" rx="2" fill={color} />
    </>
  );
}

function Tokens(): React.JSX.Element {
  return (
    <>
      <g>
        <circle
          cx="644"
          cy="588"
          r="21"
          fill="#16191e"
          stroke="var(--foreground)"
          strokeOpacity=".8"
          strokeWidth="1.6"
        />
        <path
          d="M644 576 L651 588 L644 600 L637 588 Z"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.4"
        />
        <LifeBar x={626} y={614} filled={27} color="var(--primary)" />
      </g>
      <g>
        <circle
          cx="700"
          cy="644"
          r="21"
          fill="#16191e"
          stroke="var(--foreground)"
          strokeOpacity=".6"
          strokeWidth="1.6"
        />
        <circle cx="700" cy="644" r="6" fill="none" stroke="var(--primary)" strokeWidth="1.4" />
        <LifeBar x={682} y={670} filled={33} color="var(--primary)" />
      </g>
      <g>
        <circle
          cx="812"
          cy="420"
          r="21"
          fill="#16191e"
          stroke="var(--destructive)"
          strokeWidth="1.8"
        />
        <path
          d="M804 412 L820 428 M820 412 L804 428"
          stroke="var(--destructive)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <LifeBar x={794} y={446} filled={13} color="var(--destructive)" />
      </g>
    </>
  );
}

function Compass(): React.JSX.Element {
  return (
    <>
      <g fill="none" stroke="var(--primary)" strokeOpacity=".45" strokeWidth="1.2">
        <circle cx="890" cy="130" r="38" />
        <circle cx="890" cy="130" r="30" strokeOpacity=".25" />
        <path d="M890 80 L897 123 L940 130 L897 137 L890 180 L883 137 L840 130 L883 123 Z" />
      </g>
      <text
        x="890"
        y="70"
        textAnchor="middle"
        fill="var(--primary)"
        fillOpacity=".6"
        fontFamily="'Cinzel Variable', Georgia, serif"
        fontSize="14"
        letterSpacing="2"
      >
        N
      </text>
    </>
  );
}
