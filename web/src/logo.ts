// The LawFive mark (WEB-25): a heavy italic L and a 5 with a fold at its foot, drawn upright on a
// 100-high grid and slanted 12° like the wordmark. Shared by the app (`LogoMark` in ui.tsx) and the
// icon script (scripts/icons.ts), so the two never drift.

/** The viewBox the slanted mark fills. */
export const markViewBox = "0 0 126 100";
/** The slant, applied to all three shapes (shifted so the foot stays inside the box). */
export const markTransform = "translate(22 0) skewX(-12)";
export const markL = "M0 0H26V76H52L41 100H0Z";
export const markFive = "M35 0H104L99 22H60V32H78A22 22 0 0 1 100 54V78A22 22 0 0 1 78 100H54L64 78H75V55H35Z";
/** The darker fold at the 5's foot; left out under 24px, where it would blur. */
export const markFold = "M54 100L64 78H84Z";

/** The mark's colors on the stadium board, as the favicon and home-screen icons show it. */
export const boardColors = { board: "#0b0e0d", l: "#f4f2e9", five: "#2fae7a", fold: "#1d7a54" };

/** The mark as an SVG file's contents, `size` px square on the board with corners of `radius` (of 512). */
export function markIcon({ radius = 112, scale = 0.7, fold = true }: { radius?: number; scale?: number; fold?: boolean } = {}): string {
    const c = boardColors;
    const w = 512 * scale;
    const h = (w * 100) / 126;
    const x = (512 - w) / 2 + 4;
    const y = (512 - h) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${radius}" fill="${c.board}"/>
  <svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${markViewBox}">
    <g transform="${markTransform}">
      <path fill="${c.l}" d="${markL}"/>
      <path fill="${c.five}" d="${markFive}"/>${fold ? `\n      <path fill="${c.fold}" d="${markFold}"/>` : ""}
    </g>
  </svg>
</svg>
`;
}
