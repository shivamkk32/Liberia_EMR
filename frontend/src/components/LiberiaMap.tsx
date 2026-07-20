// Stylized honeycomb map of Liberia's 15 counties. The selected county is
// extruded as a raised 3D block; the rest stay flat. Clicking a county selects it.
import { LIBERIA_COUNTIES } from "../lib/regions";

// County layout in rough north→south rows (tapering to the SE tip).
const ROWS: string[][] = [
  ["Grand Cape Mount", "Gbarpolu", "Lofa", "Nimba"],
  ["Bomi", "Montserrado", "Bong", "Grand Gedeh", "River Gee"],
  ["Margibi", "Grand Bassa", "Rivercess", "Sinoe"],
  ["Grand Kru", "Maryland"],
];

const R = 30;                       // hex radius
const HW = Math.sqrt(3) * R;        // hex width
const ROW_STEP = 1.5 * R;
const ORIGIN_Y = 52;
const CENTER_X = 180;
const DEPTH = 16;                   // 3D extrusion height

function hexPts(cx: number, cy: number, r = R): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
const poly = (pts: [number, number][]) => pts.map((p) => p.join(",")).join(" ");

const SHORT: Record<string, string> = {
  "Grand Cape Mount": "GCM", "Gbarpolu": "Gbp", "Lofa": "Lofa", "Nimba": "Nim",
  "Bomi": "Bomi", "Montserrado": "Mon", "Bong": "Bong", "Grand Gedeh": "GGe", "River Gee": "RGe",
  "Margibi": "Mgb", "Grand Bassa": "GBa", "Rivercess": "Rvc", "Sinoe": "Sin",
  "Grand Kru": "GKr", "Maryland": "Mld",
};
const abbr = (name: string) => SHORT[name] ?? name.slice(0, 3);

interface Placed { name: string; cx: number; cy: number; }

function layout(): Placed[] {
  const out: Placed[] = [];
  ROWS.forEach((row, r) => {
    const startX = CENTER_X - ((row.length - 1) * HW) / 2;
    row.forEach((name, j) => {
      out.push({ name, cx: startX + j * HW, cy: ORIGIN_Y + r * ROW_STEP });
    });
  });
  return out;
}

export default function LiberiaMap({ selected, onSelect }:
  { selected: string; onSelect: (name: string) => void }) {
  const placed = layout();
  const sel = placed.find((p) => p.name === selected);
  const capital = LIBERIA_COUNTIES.find((c) => c.name === selected)?.capital;

  return (
    <div className="liberia-map">
      <svg viewBox="0 0 360 300" width="100%" role="img" aria-label="Map of Liberia counties">
        <defs>
          <linearGradient id="hexSel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#37cf94" />
            <stop offset="1" stopColor="#1a6b4c" />
          </linearGradient>
          <filter id="hexShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#0b2a20" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Flat counties */}
        {placed.filter((p) => p.name !== selected).map((p) => (
          <g key={p.name} className="hex-flat" onClick={() => onSelect(p.name)}>
            <polygon points={poly(hexPts(p.cx, p.cy))} />
            <text x={p.cx} y={p.cy + 3} textAnchor="middle" className="hex-label">{abbr(p.name)}</text>
          </g>
        ))}

        {/* Selected county — raised 3D block */}
        {sel && (
          <g className="hex-raised" onClick={() => onSelect(sel.name)} filter="url(#hexShadow)">
            {/* side walls: base edges up to the lifted top */}
            {(() => {
              const base = hexPts(sel.cx, sel.cy);
              const top = hexPts(sel.cx, sel.cy - DEPTH);
              return base.map((_, i) => {
                const j = (i + 1) % 6;
                return (
                  <polygon key={i}
                    points={poly([base[i], base[j], top[j], top[i]])}
                    fill="#123a2b" stroke="#0f3d2e" strokeWidth="0.5" />
                );
              });
            })()}
            {/* lifted top face */}
            <polygon points={poly(hexPts(sel.cx, sel.cy - DEPTH))} fill="url(#hexSel)" stroke="#eafff6" strokeWidth="1.5" />
            <text x={sel.cx} y={sel.cy - DEPTH + 3} textAnchor="middle" className="hex-label-sel">{abbr(sel.name)}</text>
          </g>
        )}
      </svg>

      <div className="map-caption">
        📍 <strong>{selected || "Select a county"}</strong>{capital ? ` — ${capital}` : ""}
      </div>
    </div>
  );
}
