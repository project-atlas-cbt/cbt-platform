import Image from 'next/image';

/**
 * A product screen in a plain browser frame.
 *
 * Until the showcase screens are polished and captured from the real app
 * (decided 2026-10-04: no retouched screenshots), each shot renders a
 * labelled schematic of the screen's real layout instead. Passing `src`
 * swaps in the captured screenshot without touching the pages.
 */
export type ShotKind = 'exam' | 'control' | 'review' | 'results' | 'setup';

export function ProductShot({
  kind,
  title,
  caption,
  src,
  priority = false,
}: {
  kind: ShotKind;
  title: string;
  caption?: string;
  src?: string;
  priority?: boolean;
}) {
  return (
    <figure className="w-full">
      <div className="overflow-hidden rounded-xl border border-rule bg-surface shadow-[0_1px_2px_rgb(20_22_27/0.06),0_18px_40px_-24px_rgb(20_22_27/0.35)]">
        <div
          className="flex items-center gap-1.5 border-b border-rule bg-surface-muted px-3 py-2"
          aria-hidden="true"
        >
          <span className="size-2.5 rounded-full bg-rule" />
          <span className="size-2.5 rounded-full bg-rule" />
          <span className="size-2.5 rounded-full bg-rule" />
        </div>
        {src ? (
          <Image
            src={src}
            alt={title}
            width={1366}
            height={768}
            priority={priority}
            className="h-auto w-full"
          />
        ) : (
          <Schematic kind={kind} title={title} />
        )}
      </div>
      {caption ? (
        <figcaption className="mt-3 text-sm leading-relaxed text-ink-muted">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

const ink = '#14161b';
const muted = '#c9ced8';
const faint = '#eef1f7';
const accent = '#1d4ed8';
const tick = '#15803d';
const amber = '#b45309';

function Schematic({ kind, title }: { kind: ShotKind; title: string }) {
  return (
    <svg
      viewBox="0 0 683 384"
      role="img"
      aria-label={`Illustration: ${title}`}
      className="block h-auto w-full bg-white"
    >
      {kind === 'exam' ? <ExamScreen /> : null}
      {kind === 'control' ? <ControlScreen /> : null}
      {kind === 'review' ? <ReviewScreen /> : null}
      {kind === 'results' ? <ResultsScreen /> : null}
      {kind === 'setup' ? <SetupScreen /> : null}
      <text x="671" y="376" textAnchor="end" fontSize="9" fill="#8a8f98" fontFamily="sans-serif">
        Illustration
      </text>
    </svg>
  );
}

function Bar({
  x,
  y,
  w,
  h = 7,
  fill = muted,
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  fill?: string;
}) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
}

/** Student exam screen: question, four options, own timer, question palette. */
function ExamScreen() {
  const options = ['A', 'B', 'C', 'D'];
  return (
    <g fontFamily="sans-serif">
      <rect x="0" y="0" width="683" height="44" fill={faint} />
      <Bar x={20} y={18} w={150} fill="#a9b0bd" />
      <rect x="560" y="11" width="104" height="22" rx="11" fill="#fff" stroke={muted} />
      <text x="612" y="26" textAnchor="middle" fontSize="11" fill={ink} fontWeight="600">
        38:12
      </text>
      <Bar x={32} y={74} w={90} h={8} fill={accent} />
      <Bar x={32} y={98} w={430} h={9} fill="#9aa1ad" />
      <Bar x={32} y={116} w={360} h={9} fill="#9aa1ad" />
      {options.map((o, i) => {
        const y = 146 + i * 46;
        const chosen = i === 2;
        return (
          <g key={o}>
            <rect
              x="32"
              y={y}
              width="440"
              height="36"
              rx="8"
              fill={chosen ? '#e7efff' : '#fff'}
              stroke={chosen ? accent : muted}
            />
            <circle
              cx="54"
              cy={y + 18}
              r="10"
              fill={chosen ? accent : '#fff'}
              stroke={chosen ? accent : '#8a8f98'}
              strokeWidth="1.5"
            />
            <text
              x="54"
              y={y + 22}
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill={chosen ? '#fff' : '#5c6068'}
            >
              {o}
            </text>
            <Bar x={76} y={y + 14} w={[220, 180, 250, 160][i]!} fill={chosen ? '#7c9be8' : muted} />
          </g>
        );
      })}
      <rect x="500" y="66" width="164" height="226" rx="10" fill="#fff" stroke={muted} />
      <Bar x={514} y={80} w={70} fill="#a9b0bd" />
      {Array.from({ length: 30 }, (_, i) => {
        const col = i % 5;
        const row = Math.floor(i / 5);
        const answered = i < 13 && i !== 7;
        const current = i === 13;
        return (
          <rect
            key={i}
            x={514 + col * 29}
            y={100 + row * 29}
            width="22"
            height="22"
            rx="5"
            fill={current ? '#fff' : answered ? accent : faint}
            stroke={current ? accent : 'none'}
            strokeWidth="2"
          />
        );
      })}
      <rect x="32" y="336" width="98" height="30" rx="7" fill="#fff" stroke={muted} />
      <rect x="374" y="336" width="98" height="30" rx="7" fill={accent} />
      <circle cx="514" cy="318" r="5" fill={tick} />
      <Bar x={526} y={314} w={96} fill="#b7dcc4" />
    </g>
  );
}

/** Exam Control Center: live attempt table with states and a disconnected flag. */
function ControlScreen() {
  const rows = [
    ['#e7efff', accent, 'In progress'],
    ['#fdf3e6', amber, 'Disconnected'],
    ['#e7efff', accent, 'In progress'],
    ['#e9f6ee', tick, 'Submitted'],
    ['#e9f6ee', tick, 'Submitted'],
    ['#eef1f7', '#5c6068', 'Not started'],
  ] as const;
  return (
    <g fontFamily="sans-serif">
      <rect x="0" y="0" width="150" height="384" fill={faint} />
      {[30, 54, 78, 102, 126].map((y, i) => (
        <Bar key={y} x={20} y={y} w={i === 2 ? 96 : 84} fill={i === 2 ? accent : '#b9bfca'} />
      ))}
      <Bar x={174} y={26} w={210} h={10} fill="#8a8f98" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect
            x={174 + i * 124}
            y="50"
            width="112"
            height="54"
            rx="8"
            fill="#fff"
            stroke={muted}
          />
          <text x={186 + i * 124} y="82" fontSize="18" fontWeight="700" fill={ink}>
            {['42', '3', '17', '2'][i]}
          </text>
          <Bar x={186 + i * 124} y={89} w={60} h={6} />
        </g>
      ))}
      <rect x="174" y="118" width="490" height="250" rx="8" fill="#fff" stroke={muted} />
      <rect x="174" y="118" width="490" height="28" rx="8" fill={faint} />
      {rows.map(([bg, fg, label], i) => {
        const y = 156 + i * 34;
        return (
          <g key={i}>
            <Bar x={190} y={y + 8} w={110} />
            <Bar x={330} y={y + 8} w={60} />
            <rect x="420" y={y + 2} width="92" height="20" rx="10" fill={bg} />
            <text x="466" y={y + 16} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={fg}>
              {label}
            </text>
            <Bar x={540} y={y + 8} w={90} />
            {i < 5 ? <line x1="186" x2="652" y1={y + 30} y2={y + 30} stroke={faint} /> : null}
          </g>
        );
      })}
    </g>
  );
}

/** HOD review: question preview beside the approve and return actions. */
function ReviewScreen() {
  return (
    <g fontFamily="sans-serif">
      <rect x="0" y="0" width="150" height="384" fill={faint} />
      {[30, 54, 78, 102].map((y, i) => (
        <Bar key={y} x={20} y={y} w={i === 1 ? 96 : 84} fill={i === 1 ? accent : '#b9bfca'} />
      ))}
      <rect x="174" y="24" width="300" height="340" rx="8" fill="#fff" stroke={muted} />
      <Bar x={192} y={44} w={120} fill={accent} />
      <Bar x={192} y={68} w={250} h={9} fill="#9aa1ad" />
      <Bar x={192} y={84} w={200} h={9} fill="#9aa1ad" />
      {['A', 'B', 'C', 'D'].map((o, i) => (
        <g key={o}>
          <circle
            cx="202"
            cy={120 + i * 32}
            r="9"
            fill={i === 1 ? '#e9f6ee' : '#fff'}
            stroke={i === 1 ? tick : '#8a8f98'}
            strokeWidth="1.5"
          />
          <text
            x="202"
            y={124 + i * 32}
            textAnchor="middle"
            fontSize="9"
            fontWeight="600"
            fill={i === 1 ? tick : '#5c6068'}
          >
            {o}
          </text>
          <Bar x={220} y={116 + i * 32} w={[150, 170, 120, 140][i]!} />
        </g>
      ))}
      <Bar x={192} y={262} w={80} fill="#a9b0bd" />
      <Bar x={192} y={280} w={240} />
      <Bar x={192} y={296} w={200} />
      <rect x="492" y="24" width="172" height="200" rx="8" fill="#fff" stroke={muted} />
      <Bar x={508} y={42} w={90} fill="#a9b0bd" />
      {[66, 88, 110, 132].map((y) => (
        <g key={y}>
          <Bar x={508} y={y} w={52} h={6} />
          <Bar x={572} y={y} w={74} h={6} fill="#a9b0bd" />
        </g>
      ))}
      <rect x="508" y="160" width="140" height="26" rx="6" fill={tick} />
      <text x="578" y="177" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#fff">
        Approve
      </text>
      <rect x="508" y="192" width="140" height="24" rx="6" fill="#fff" stroke={muted} />
      <text x="578" y="208" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={ink}>
        Request changes
      </text>
    </g>
  );
}

/** Results: score distribution and a publish control. */
function ResultsScreen() {
  const bars = [18, 34, 58, 86, 120, 98, 70, 40, 22];
  return (
    <g fontFamily="sans-serif">
      <rect x="0" y="0" width="150" height="384" fill={faint} />
      {[30, 54, 78, 102].map((y, i) => (
        <Bar key={y} x={20} y={y} w={i === 3 ? 96 : 84} fill={i === 3 ? accent : '#b9bfca'} />
      ))}
      <Bar x={174} y={26} w={180} h={10} fill="#8a8f98" />
      <rect x="520" y="18" width="144" height="28" rx="7" fill={accent} />
      <text x="592" y="36" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">
        Publish results
      </text>
      <rect x="174" y="60" width="490" height="168" rx="8" fill="#fff" stroke={muted} />
      {bars.map((h, i) => (
        <rect
          key={i}
          x={204 + i * 50}
          y={210 - h}
          width="32"
          height={h}
          rx="3"
          fill={i === 4 ? accent : '#a8bdf0'}
        />
      ))}
      <line x1="190" x2="648" y1="210" y2="210" stroke={muted} />
      <rect x="174" y="242" width="490" height="126" rx="8" fill="#fff" stroke={muted} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Bar x={192} y={262 + i * 34} w={130} />
          <Bar x={360} y={262 + i * 34} w={40} fill="#9aa1ad" />
          <rect x="440" y={256 + i * 34} width="70" height="20" rx="10" fill="#e9f6ee" />
          <text
            x="475"
            y={270 + i * 34}
            textAnchor="middle"
            fontSize="9.5"
            fontWeight="600"
            fill={tick}
          >
            Final
          </text>
        </g>
      ))}
    </g>
  );
}

/** The setup wizard: steps on the left, the school's logo and colour on the right. */
function SetupScreen() {
  const steps = [
    'School profile',
    'Branding',
    'Academic session',
    'Terms',
    'Departments',
    'Classes',
    'Subjects',
    'Staff',
    'Students',
    'Review & finish',
  ];
  return (
    <g fontFamily="sans-serif">
      <rect x="0" y="0" width="683" height="384" fill={faint} />
      <rect x="40" y="28" width="603" height="328" rx="10" fill="#fff" stroke={muted} />
      {steps.map((s, i) => (
        <g key={s}>
          <circle
            cx="76"
            cy={58 + i * 29}
            r="10"
            fill={i < 1 ? tick : i === 1 ? accent : '#fff'}
            stroke={i > 1 ? '#8a8f98' : 'none'}
            strokeWidth="1.5"
          />
          <text
            x="76"
            y={62 + i * 29}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill={i > 1 ? '#5c6068' : '#fff'}
          >
            {i < 1 ? '✓' : i + 1}
          </text>
          <text
            x="94"
            y={62 + i * 29}
            fontSize="11.5"
            fill={i === 1 ? ink : '#5c6068'}
            fontWeight={i === 1 ? 600 : 400}
          >
            {s}
          </text>
        </g>
      ))}
      <line x1="236" x2="236" y1="48" y2="336" stroke={faint} strokeWidth="2" />
      <Bar x={262} y={56} w={140} h={10} fill="#8a8f98" />
      <rect
        x="262"
        y="84"
        width="96"
        height="96"
        rx="10"
        fill={faint}
        stroke={muted}
        strokeDasharray="4 4"
      />
      <circle cx="310" cy="132" r="26" fill="#0b6b3a" />
      <Bar x={378} y={100} w={160} />
      <Bar x={378} y={118} w={120} />
      <Bar x={262} y={206} w={90} fill="#a9b0bd" />
      {['#0b6b3a', '#1d4ed8', '#7a1f2b', '#4b2e83', '#b45309'].map((c, i) => (
        <circle
          key={c}
          cx={276 + i * 34}
          cy="240"
          r="12"
          fill={c}
          stroke={i === 0 ? ink : 'none'}
          strokeWidth="2.5"
        />
      ))}
      <rect x="262" y="270" width="350" height="40" rx="8" fill="#e8f2ec" />
      <rect x="276" y="282" width="80" height="16" rx="4" fill="#0b6b3a" />
      <Bar x={370} y={287} w={120} h={6} fill="#9ab8a6" />
      <rect x="512" y="320" width="100" height="26" rx="6" fill={accent} />
    </g>
  );
}
