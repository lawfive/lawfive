import { useMemo } from "react";
import { encode } from "uqr";
import { boardColors, markFive, markFold, markL, markTransform, markViewBox } from "../logo.ts";

// A QR code (APP-13, APP-14): dark on white in light and dark mode alike, as scanners expect, with
// the L5 mark (WEB-25) on a small board tile at its center (the strongest error correction reads
// through it) and corner arcs on the tile, like the corners of a pitch. Drawn here so it matches the
// rest of the app.

const finder = 7;

export function QrCode({ text, label }: { text: string; label: string }) {
    const { size, modules, hole, from } = useMemo(() => {
        const qr = encode(text, { ecc: "H", border: 0 });
        const hole = Math.ceil(qr.size * 0.2) | 1;
        const from = (qr.size - hole) / 2;
        const inFinder = (x: number, y: number) => (x < finder || x >= qr.size - finder) && y < finder || x < finder && y >= qr.size - finder;
        const inHole = (x: number, y: number) => x >= from && x < from + hole && y >= from && y < from + hole;
        let d = "";
        qr.data.forEach((row, y) => row.forEach((on, x) => {
            if (on && !inFinder(x, y) && !inHole(x, y)) {
                d += `M${x + 0.28} ${y + 0.04}h.44a.24.24 0 0 1 .24.24v.44a.24.24 0 0 1-.24.24h-.44a.24.24 0 0 1-.24-.24v-.44a.24.24 0 0 1 .24-.24z`;
            }
        }));
        return { size: qr.size, modules: d, hole, from };
    }, [text]);
    // The mark on the board, as the favicon has it, the same in light and dark like the code.
    const tile = hole - 0.4;
    const markWidth = tile * 0.74;
    const markHeight = (markWidth * 100) / 126;
    const corners = [[0, 0], [size - finder, 0], [0, size - finder]];

    return (
        <div className="qr-tile">
            <svg className="qr-arcs" viewBox="0 0 100 100" aria-hidden>
                <path d="M1 7a6 6 0 0 0 6-6M93 1a6 6 0 0 0 6 6M99 93a6 6 0 0 0-6 6M7 99a6 6 0 0 0-6-6" />
            </svg>
            <svg className="qr-code" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
                <path d={modules} />
                {corners.map(([x, y]) => (
                    <g key={`${x},${y}`}>
                        <path fillRule="evenodd" d={`M${x + 1.8} ${y}h3.4a1.8 1.8 0 0 1 1.8 1.8v3.4a1.8 1.8 0 0 1-1.8 1.8h-3.4a1.8 1.8 0 0 1-1.8-1.8v-3.4a1.8 1.8 0 0 1 1.8-1.8zM${x + 1.8} ${y + 1}a.8.8 0 0 0-.8.8v3.4a.8.8 0 0 0 .8.8h3.4a.8.8 0 0 0 .8-.8v-3.4a.8.8 0 0 0-.8-.8z`} />
                        <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.7} />
                    </g>
                ))}
                <rect x={from + 0.2} y={from + 0.2} width={tile} height={tile} rx={tile * 0.16} fill={boardColors.board} />
                <svg x={size / 2 - markWidth / 2 + tile * 0.02} y={size / 2 - markHeight / 2} width={markWidth} height={markHeight} viewBox={markViewBox}>
                    <g transform={markTransform}>
                        <path fill={boardColors.l} d={markL} />
                        <path fill={boardColors.five} d={markFive} />
                        <path fill={boardColors.fold} d={markFold} />
                    </g>
                </svg>
            </svg>
        </div>
    );
}
