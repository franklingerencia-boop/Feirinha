"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MAP_ELEMENT } from "@/lib/labels";

export type MapStall = { id: string; code: string; x: number; y: number; w: number; h: number; color?: string | null };
export type MapEl = { id?: string; kind: string; label: string | null; x: number; y: number; w: number; h: number };
export type Occ = { status: "reserved" | "confirmed"; name?: string | null };

export const MAP_W = 1000;
export const MAP_H = 700;

const ELEMENT_STYLE: Record<string, { fill: string; text: string }> = {
  entrance: { fill: "#bbf7d0", text: "#14532d" },
  exit: { fill: "#fecaca", text: "#7f1d1d" },
  stage: { fill: "#ddd6fe", text: "#3b0764" },
  restroom: { fill: "#bae6fd", text: "#0c4a6e" },
  support: { fill: "#fde68a", text: "#78350f" },
  food: { fill: "#fed7aa", text: "#7c2d12" },
  parking: { fill: "#e5e7eb", text: "#1f2937" },
  other: { fill: "#f5f5f4", text: "#292524" },
};

export const OCC_STYLE = {
  available: { fill: "#ffffff", stroke: "#a8a29e", label: "Disponível" },
  reserved: { fill: "#fde68a", stroke: "#d97706", label: "Reservada" },
  confirmed: { fill: "#86efac", stroke: "#15803d", label: "Confirmada" },
};

export function MapLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs" aria-label="Legenda">
      {Object.values(OCC_STYLE).map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1">
          <span className="inline-block h-3.5 w-3.5 rounded border-2" style={{ background: s.fill, borderColor: s.stroke }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Planta do evento em SVG. Editável (arrastar) quando onMove é informado. */
export function StallMap({
  stalls,
  elements,
  occupancy,
  selectedId,
  onSelect,
  onMove,
  showNames = false,
}: {
  stalls: MapStall[];
  elements: MapEl[];
  occupancy: Record<string, Occ | undefined>;
  selectedId?: string | null;
  onSelect?: (kind: "stall" | "element", id: string) => void;
  onMove?: (kind: "stall" | "element", id: string, x: number, y: number) => void;
  showNames?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: "stall" | "element"; id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const [live, setLive] = useState<Record<string, { x: number; y: number }>>({});

  const toSvg = (e: PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const snap = (v: number) => Math.round(v / 10) * 10;

  const start = (kind: "stall" | "element", id: string, x: number, y: number) => (e: PointerEvent) => {
    onSelect?.(kind, id);
    if (!onMove) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toSvg(e);
    drag.current = { kind, id, dx: p.x - x, dy: p.y - y, moved: false };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toSvg(e);
    d.moved = true;
    setLive((l) => ({ ...l, [d.id]: { x: clamp(snap(p.x - d.dx), 0, MAP_W - 20), y: clamp(snap(p.y - d.dy), 0, MAP_H - 20) } }));
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && live[d.id]) onMove?.(d.kind, d.id, live[d.id].x, live[d.id].y);
  };
  const keyMove = (kind: "stall" | "element", id: string, x: number, y: number) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(kind, id);
      return;
    }
    if (!onMove) return;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
    const dlt = delta[e.key];
    if (!dlt) return;
    e.preventDefault();
    const nx = clamp(x + dlt[0], 0, MAP_W - 20);
    const ny = clamp(y + dlt[1], 0, MAP_H - 20);
    setLive((l) => ({ ...l, [id]: { x: nx, y: ny } }));
    onMove(kind, id, nx, ny);
  };

  return (
    <div className="w-full overflow-auto rounded-2xl border border-line bg-[#fafaf9]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="h-auto w-full min-w-[640px] touch-none select-none"
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        role="img"
        aria-label="Planta do evento com barracas"
      >
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e7e5e4" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="url(#grid)" />
        {elements.map((el, i) => {
          const id = el.id ?? `el-${i}`;
          const pos = live[id] ?? el;
          const st = ELEMENT_STYLE[el.kind] ?? ELEMENT_STYLE.other;
          return (
            <g
              key={id}
              transform={`translate(${pos.x},${pos.y})`}
              onPointerDown={el.id ? start("element", el.id, pos.x, pos.y) : undefined}
              onKeyDown={el.id ? keyMove("element", el.id, pos.x, pos.y) : undefined}
              tabIndex={onSelect && el.id ? 0 : -1}
              role={onSelect ? "button" : undefined}
              aria-label={`${MAP_ELEMENT[el.kind] ?? el.kind}${el.label ? `: ${el.label}` : ""}`}
              className={onMove ? "cursor-move" : ""}
            >
              <rect width={el.w} height={el.h} rx="8" fill={st.fill} stroke={selectedId === el.id ? "#e2600f" : st.text} strokeWidth={selectedId === el.id ? 3 : 1} strokeDasharray="4 3" />
              <text x={el.w / 2} y={el.h / 2} textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" fill={st.text}>
                {el.label || MAP_ELEMENT[el.kind]}
              </text>
            </g>
          );
        })}
        {stalls.map((s) => {
          const pos = live[s.id] ?? s;
          const occ = occupancy[s.id];
          const style = OCC_STYLE[occ?.status ?? "available"];
          const sel = selectedId === s.id;
          return (
            <g
              key={s.id}
              transform={`translate(${pos.x},${pos.y})`}
              onPointerDown={start("stall", s.id, pos.x, pos.y)}
              onKeyDown={keyMove("stall", s.id, pos.x, pos.y)}
              tabIndex={onSelect ? 0 : -1}
              role={onSelect ? "button" : undefined}
              aria-label={`Barraca ${s.code}: ${style.label}${occ?.name ? `, ${occ.name}` : ""}`}
              className={onMove ? "cursor-move" : onSelect ? "cursor-pointer" : ""}
            >
              <rect width={s.w} height={s.h} rx="6" fill={style.fill} stroke={sel ? "#e2600f" : style.stroke} strokeWidth={sel ? 4 : 2} />
              {s.color && <rect width={s.w} height="6" rx="3" fill={s.color} />}
              <text x={s.w / 2} y={s.h / 2 - (showNames && occ?.name ? 7 : 0)} textAnchor="middle" dominantBaseline="central" fontSize="16" fontWeight="800" fill="#2a211b">
                {s.code}
              </text>
              {showNames && occ?.name && (
                <text x={s.w / 2} y={s.h / 2 + 12} textAnchor="middle" fontSize="9" fill="#2a211b">
                  {occ.name.length > 12 ? occ.name.slice(0, 11) + "…" : occ.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}
