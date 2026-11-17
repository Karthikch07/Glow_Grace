/**
 * Illustrated countryside behind the sign-in card on desktop: soft peach
 * hills, a windmill with turning sails, domed cottages and coral trees.
 * Hidden below the lg breakpoint so mobile keeps its plain layout.
 */

const C = {
  sky: "#FBF8F4",
  farHill: "#F5ECE4",
  midHill: "#F9DCCB",
  nearHill: "#F8C9B2",
  frontHill: "#F6B79C",
  coral: "#F26B4F",
  coralSoft: "#F79A80",
  tree: "#FA9C86",
  line: "#E9775C",
  white: "#FFFFFF",
  outline: "#F3B6A3",
};

function Cottage({ x, y, s = 1, flip = false }: { x: number; y: number; s?: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      {/* chimney + smoke */}
      <rect x="-26" y="-74" width="10" height="22" rx="2" fill={C.coralSoft} />
      <path d="M-21 -80 c -8 -10, 8 -16, 0 -28 c -6 -8, 6 -14, 2 -22" stroke={C.white} strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* dome */}
      <path d="M-46 0 V-28 A46 46 0 0 1 46 -28 V0 Z" fill={C.coralSoft} />
      <path d="M-34 0 V-26 A34 34 0 0 1 34 -26 V0 Z" fill={C.white} />
      {/* window + door */}
      <rect x="-14" y="-38" width="9" height="14" rx="4.5" fill={C.coralSoft} />
      <path d="M6 0 V-14 a7 7 0 0 1 14 0 V0 Z" fill={C.coralSoft} />
    </g>
  );
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 C 2 -30, -6 -52, 4 -80 M2 -40 C 12 -48, 20 -50, 30 -62" stroke={C.line} strokeWidth="4" strokeLinecap="round" fill="none" />
      <g fill={C.tree}>
        <circle cx="-14" cy="-88" r="22" />
        <circle cx="12" cy="-100" r="26" />
        <circle cx="28" cy="-82" r="20" />
        <circle cx="0" cy="-74" r="20" />
      </g>
      <g fill={C.coralSoft}>
        <circle cx="34" cy="-70" r="11" />
        <circle cx="44" cy="-74" r="9" />
      </g>
    </g>
  );
}

function Windmill({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* tower */}
      <path d="M-58 0 L-38 -230 H38 L58 0 Z" fill={C.white} stroke={C.outline} strokeWidth="3" />
      <path d="M-14 0 V-36 a14 18 0 0 1 28 0 V0 Z" fill={C.coral} />
      <ellipse cx="0" cy="-130" rx="11" ry="15" fill={C.coral} />
      {/* cap */}
      <path d="M-62 -224 C -60 -270, -20 -300, 18 -300 L 54 -232 Z" fill={C.coral} />
      <path d="M-46 -228 C -40 -262, -12 -284, 14 -284 L 40 -236 Z" fill={C.coralSoft} />
      {/* sails */}
      <g className="gg-windmill-sails" style={{ transformOrigin: "0px -250px" }}>
        {[38, -38].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 0 -250)`}>
            <rect x="-11" y="-430" width="22" height="360" rx="3" fill={C.coralSoft} opacity="0.9" />
            {Array.from({ length: 9 }, (_, i) => (
              <rect key={i} x="-11" y={-420 + i * 38} width="22" height="4" fill={C.white} opacity="0.8" />
            ))}
          </g>
        ))}
        <circle cx="0" cy="-250" r="9" fill={C.coral} />
      </g>
    </g>
  );
}

export function LoginBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block dark:opacity-[0.18]" aria-hidden>
      <style>{`
        @keyframes gg-sails { to { transform: rotate(360deg); } }
        .gg-windmill-sails { animation: gg-sails 40s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .gg-windmill-sails { animation: none; } }
      `}</style>
      <svg className="h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
        <rect width="1440" height="900" fill={C.sky} className="dark:hidden" />

        {/* far, mountain-like shapes */}
        <path d="M0 170 C 160 120, 300 150, 420 260 S 600 430, 700 460 L 700 900 H0Z" fill={C.farHill} />
        <path d="M1440 90 C 1300 100, 1180 160, 1120 300 S 1060 470, 900 520 L 900 900 H1440Z" fill={C.farHill} />

        {/* rolling hills */}
        <path d="M0 640 C 140 560, 300 560, 470 640 S 760 760, 900 740 V900 H0Z" fill={C.midHill} />
        <path d="M1440 610 C 1320 560, 1180 580, 1060 660 S 820 780, 700 790 V900 H1440Z" fill={C.midHill} />

        {/* left scene */}
        <Cottage x={70} y={690} s={1.05} />
        <Cottage x={160} y={705} s={0.8} flip />
        <Windmill x={330} y={840} />
        <Tree x={470} y={800} s={1} />
        <Tree x={540} y={720} s={0.55} />

        {/* right scene */}
        <Tree x={1190} y={790} s={0.9} />
        <Tree x={1110} y={720} s={0.5} />
        <Cottage x={1310} y={760} s={1.15} />
        <Cottage x={1410} y={700} s={0.95} flip />

        {/* foreground hills */}
        <path d="M0 790 C 180 730, 380 760, 560 830 S 760 900, 820 900 H0Z" fill={C.nearHill} />
        <path d="M1440 760 C 1280 740, 1120 780, 980 850 S 860 900, 820 900 H1440Z" fill={C.nearHill} />
        <path d="M0 860 C 160 830, 300 850, 420 900 H0Z" fill={C.frontHill} />
        <path d="M1440 850 C 1300 830, 1160 860, 1060 900 H1440Z" fill={C.frontHill} />
      </svg>
    </div>
  );
}
