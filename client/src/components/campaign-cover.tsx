import type { CampaignCoverDto, DrawnCampaignCoverDto } from '@lorkarium/contracts';
import { cn } from '@/lib/utils';
import { assetUrlOf } from '@/services/assets-api';

type CoverDrawing = Readonly<{ paths: readonly string[]; cx: number; cy: number }>;

// The three families of the mockup (docs/pages/home/Home.dc.html): a ring, a coast, a ridge.
const COVER_DRAWING_ART: readonly [CoverDrawing, CoverDrawing, CoverDrawing] = [
  {
    paths: [
      'M150 18 C210 10 262 40 264 72 C266 104 220 126 160 124 C100 122 52 104 54 72 C56 42 96 24 150 18 Z',
      'M152 40 C192 36 226 52 226 72 C226 92 196 104 158 104 C120 104 92 94 92 74 C92 54 116 42 152 40 Z',
      'M154 60 C172 58 186 64 186 72 C186 80 174 86 158 86 C142 86 132 80 132 73 C132 66 140 61 154 60 Z',
    ],
    cx: 236,
    cy: 104,
  },
  {
    paths: [
      'M0 92 C40 80 70 100 104 88 C140 76 150 50 186 54 C222 58 240 84 300 70',
      'M0 104 C40 92 70 112 104 100 C140 88 150 62 186 66 C222 70 240 96 300 82',
      'M210 22 C232 18 252 28 250 40 C248 52 228 56 212 52 C196 48 190 38 196 30 C200 25 204 23 210 22 Z',
    ],
    cx: 120,
    cy: 60,
  },
  {
    paths: [
      'M0 120 L50 70 L80 96 L130 36 L170 84 L200 60 L250 108 L300 80',
      'M0 132 L60 96 L96 118 L140 74 L182 110 L220 92 L300 126',
      'M116 54 L130 36 L144 54',
    ],
    cx: 200,
    cy: 60,
  },
];

const TONE_CLASS = ['text-chart-1', 'text-chart-2', 'text-chart-3', 'text-chart-4'];
const PATH_OPACITY = [0.3, 0.5, 0.75];

// A faint gold grid under the drawing: the board the campaign is played on.
const GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgb(197 164 109 / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(197 164 109 / 0.06) 1px, transparent 1px)',
  backgroundSize: '20px 20px',
};

export type CampaignCoverProps = Readonly<{ cover: CampaignCoverDto; className?: string }>;

/** Decorative cover of a campaign, hidden from assistive tech: the image the master sent, or one
 *  of the drawings in one of the `chart-1..4` tones.
 *
 *  Example: `<CampaignCover cover={campaign.cover} className="size-16" />` */
export function CampaignCover({ cover, className }: CampaignCoverProps): React.JSX.Element {
  if (cover.kind === 'image') {
    return (
      <div aria-hidden="true" className={cn('relative overflow-hidden bg-panel', className)}>
        <img
          src={assetUrlOf(cover.assetId)}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      </div>
    );
  }
  return <DrawnCover cover={cover} className={className} />;
}

type DrawnCoverProps = Readonly<{ cover: DrawnCampaignCoverDto; className?: string }>;

// The data attributes name the drawing and the tone for tests: the art has no accessible text.
function DrawnCover({ cover, className }: DrawnCoverProps): React.JSX.Element {
  const drawing = COVER_DRAWING_ART[cover.drawing] ?? COVER_DRAWING_ART[0];
  return (
    <div
      aria-hidden="true"
      data-cover-drawing={cover.drawing}
      data-cover-tone={cover.tone}
      style={GRID_STYLE}
      className={cn('relative overflow-hidden bg-[#13161b]', className)}
    >
      <svg
        viewBox="0 0 300 140"
        preserveAspectRatio="xMidYMid slice"
        className={cn('absolute inset-0 size-full', TONE_CLASS[cover.tone - 1])}
      >
        <g fill="none" stroke="currentColor" strokeWidth="1.3">
          {drawing.paths.map((path, index) => (
            <path key={path} d={path} strokeOpacity={PATH_OPACITY[index]} />
          ))}
        </g>
        <circle
          cx={drawing.cx}
          cy={drawing.cy}
          r="7"
          className="fill-background"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    </div>
  );
}
