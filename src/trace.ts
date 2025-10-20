import { z } from "zod";
import Year2024 from "./years/2024";
import Year2025 from "./years/2025";
import { attempt } from "ts-utils/check";

export class TraceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TraceError';
    }
}

export const DecompressedTraceSchema = z.array(z.tuple([
    z.number().min(0).max(600).int(),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.union([
        z.string(),
        // .refine(val => val in {
        //     ...Year2024.actions,
        //     ...Year2025.actions
        // }, {
        //     message: 'Invalid action code',
        // }),
        z.literal(0),
    ])
]));

export type Action = keyof typeof Year2024.actions | keyof typeof Year2025.actions;

const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const compressNum = (num: number) => {
    if (!Number.isInteger(num)) throw new Error(`Expected integer, got ${num}`);
    if (num < 0) num = 0;
    if (num > 999) num = 999;
    
    const base = chars.length;
    
    // Convert to base-52, ensuring exactly 2 characters
    const firstChar = chars[Math.floor(num / base)];
    const secondChar = chars[num % base];
    
    return firstChar + secondChar; // Always 2 characters: AA, AB, AC, ..., tZ
}

const decompressNum = (str: string) => {
    if (str.length !== 2) {
        throw new Error(`Expected 2 characters, got ${str.length}: ${str}`);
    }
    
    const base = chars.length;
    const firstCharIndex = chars.indexOf(str[0]);
    const secondCharIndex = chars.indexOf(str[1]);
    
    if (firstCharIndex === -1 || secondCharIndex === -1) {
        throw new Error(`Invalid characters in compressed string: ${str}`);
    }
    
    return firstCharIndex * base + secondCharIndex;
}

const compressPoint = (p: P) => {
    return compressNum(p[0]) + compressNum(p[1]) + compressNum(p[2]) + (p[3] === 0 ? '0' : p[3]);
};

const decompressPoint = (p: string) => {
    // Extract the three 2-character numbers and the action
    const i = p.slice(0, 2);
    const x = p.slice(2, 4);
    const y = p.slice(4, 6);
    const a = p.slice(6); // Everything after the 6th character is the action
    
    return [
        decompressNum(i),
        decompressNum(x),
        decompressNum(y),
        a === '0' ? 0 : a,
    ] as P;
}
const compress = (trace: TraceArray) => {
    return trace.map(compressPoint).join(';');
};

const decompress = (trace: string) => {
    return trace.split(';').map(decompressPoint);
}

export type P = [number, number, number, Action | 0];


export type TraceArray = P[];

export class Trace {
    static expand(trace: TraceArray) {
        if (trace.length === 600) {
            return trace;
        }
        // fill in missing points
        const expanded: TraceArray = [];
        for (let i = 0; i < trace.length - 1; i++) {
            const point = trace[i];
            const nextPoint = trace[i + 1];
            expanded.push(point);

            const filler: TraceArray = [];

            try {
                filler.push(
                    ...(Array.from({
                        length: nextPoint[0] - point[0] - 1
                    }).map((_, i) => {
                        return [point[0] + i + 1, point[1], point[2], 0];
                    }) as TraceArray)
                );
            } catch {
                // do nothing as the length is 0
            }

            expanded.push(...filler);
        }

        // fill in the remaining points to reach 600
        const lastPoint = trace[trace.length - 1];
        const remaining: TraceArray = [];

        try {
            remaining.push(
                ...(Array.from({
                    length: 600 - lastPoint[0] - 1
                }).map((_, i) => {
                    return [lastPoint[0] + i + 1, lastPoint[1], lastPoint[2], 0];
                }) as TraceArray)
            );
        } catch {
            // do nothing as the length is 0
        }

        expanded.push(lastPoint);
        expanded.push(...remaining);

        return expanded;
    }

    
    static deExpand(trace: TraceArray) {
        const deExpanded: TraceArray = [];
        // remove all points that have the same x, y as the previous point and action 0
        let lastPoint: P | null = null;
        for (const point of trace) {
            if (
                lastPoint &&
                point[1] === lastPoint[1] &&
                point[2] === lastPoint[2] &&
                point[3] === 0
            ) {
                // skip this point
            } else {
                deExpanded.push(point);
                lastPoint = point;
            }
        }
        return deExpanded;
    }


    public static parse(data: unknown) {
        return attempt(() => {
            let parsed: unknown;
            if (typeof data === 'string') {
                parsed = JSON.parse(data);
            } else {
                parsed = data;
            }
            const res = z.object({
                state: z.union([
                    z.literal('compressed'),
                    z.literal('parsed'),
                    z.literal('expanded'),
                ]),
                trace: z.unknown(),
            }).parse(parsed);

            if (res.state === 'compressed') {
                if (typeof res.trace !== 'string') throw new TraceError('Expected trace to be a string for compressed state');
                const decompressed = decompress(res.trace);
                return new Trace(Trace.expand(decompressed));
            }

            if (res.state === 'parsed') {
                if (!Array.isArray(res.trace)) throw new TraceError('Expected trace to be an array for parsed state');
                const parsedTrace = DecompressedTraceSchema.parse(res.trace);
                return new Trace(Trace.expand(parsedTrace as TraceArray));
            }

            if (res.state === 'expanded') {
                if (!Array.isArray(res.trace)) throw new TraceError('Expected trace to be an array for expanded state');
                const expandedTrace = DecompressedTraceSchema.parse(res.trace);
                return new Trace(expandedTrace as TraceArray);
            }
        });
    }

    constructor(
        public readonly points: z.infer<typeof DecompressedTraceSchema>
    ) {
        if (points.length !== 600) {
            throw new Error(`Trace must have exactly 600 points. Got ${points.length}`);
        }
    }

    velocityMap(): number[] {
        return this.points
            .map((p1, i, a) => {
                if (i === a.length - 1) return null;

                const [, x1, y1] = p1;
                const [, x2, y2] = a[i + 1];

                const dx = (x2 - x1) * 54;
                const dy = (y2 - y1) * 27;

                const distance = Math.sqrt(dx * dx + dy * dy);

                return distance * 4;
            })
            .filter(p => p !== null) as number[];
    }

    velocityHistogram(bins: number): number[] {
        const m = this.velocityMap();
        const sorted = m.sort((a, b) => a - b);
        const max = sorted[sorted.length - 1];

        const buckets: number[] = new Array(bins).fill(0);
        const bucketSize = max / bins;

        for (const v of m) {
            const bucket = Math.floor(v / bucketSize);
            buckets[bucket]++;
        }

        return buckets;
    }

    averageVelocity(): number {
        const m = this.velocityMap();
        const sum = m.reduce((a, b) => a + b, 0);
        return sum / m.length;
    }

    filterAction(action: Action) {
        return this.points.filter(p => p[3] === action);
    }

    serialize(compressed = true): string {
        if (compressed) {
            return JSON.stringify({
                state: 'compressed',
                trace: compress(this.points as TraceArray),
            });
        } else {
            return JSON.stringify({
                state: 'parsed',
                trace: Trace.deExpand(this.points as TraceArray),
            });
        }
    }
}