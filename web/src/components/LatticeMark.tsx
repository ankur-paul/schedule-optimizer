// The Lattice logo without its tile: a 3×3 timetable grid with the cells of an L filled in.
// Drawn in currentColor, so it takes the colour of whatever tile it sits on. web/public/logo.svg and logo-light.svg are the same mark on a dark and a light tile.
const L_CELLS = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 2],
  [2, 2],
]
const OTHER_CELLS = [
  [1, 0],
  [2, 0],
  [1, 1],
  [2, 1],
]

const cell = ([col, row]: number[]) => (
  <rect key={`${col}-${row}`} x={col * 8 + 1} y={row * 8 + 1} width={6} height={6} rx={1.5} />
)

export function LatticeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <g>{L_CELLS.map(cell)}</g>
      <g fillOpacity={0.3}>{OTHER_CELLS.map(cell)}</g>
    </svg>
  )
}
