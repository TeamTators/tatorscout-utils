import { z } from "zod";
import Year2024 from "./years/2024";
import Year2025 from "./years/2025";
import { attempt } from "ts-utils/check";

/**
 * Custom error class for trace-related operations
 * Thrown when trace parsing, validation, or processing fails
 * 
 * @extends Error
 * @example
 * ```typescript
 * try {
 *   const trace = Trace.parse(invalidData);
 * } catch (error) {
 *   if (error instanceof TraceError) {
 *     console.log('Trace operation failed:', error.message);
 *   }
 * }
 * ```
 */
export class TraceError extends Error {
    /**
     * Creates a new TraceError instance
     * @param {string} message - Error description
     */
    constructor(message: string) {
        super(message);
        this.name = 'TraceError';
    }
}

/**
 * Zod schema for validating decompressed trace data
 * Ensures trace points have valid structure and value ranges
 * - Index: 0-600 (quarter-second intervals in a match)
 * - X/Y coordinates: 0-1 (normalized field positions)
 * - Action: string code or 0 (no action)
 */
export const TraceSchema = z.array(z.tuple([
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

/**
 * Union type of all valid action codes across supported game years
 * Includes actions from both 2024 CRESCENDO and 2025 REEFSCAPE
 * @typedef {Action}
 */
export type Action = keyof typeof Year2024.actions | keyof typeof Year2025.actions;

/**
 * Character set used for base-52 number compression
 * Provides 52 unique characters for efficient numeric encoding
 */
const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Compresses a number into a 2-character base-52 string
 * Used for efficient storage of trace coordinates and timestamps
 * 
 * @param {number} num - Integer to compress (0-999)
 * @returns {string} 2-character compressed representation
 * @throws {Error} If input is not an integer
 * 
 * @example
 * ```typescript
 * compressNum(0)   // "AA"
 * compressNum(1)   // "AB" 
 * compressNum(52)  // "BA"
 * compressNum(999) // "SL"
 * ```
 */
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

/**
 * Decompresses a 2-character base-52 string back to a number
 * Inverse operation of compressNum
 * 
 * @param {string} str - 2-character compressed string
 * @returns {number} Original number (0-999)
 * @throws {Error} If string is not exactly 2 characters or contains invalid characters
 * 
 * @example
 * ```typescript
 * decompressNum("AA") // 0
 * decompressNum("AB") // 1
 * decompressNum("BA") // 52
 * ```
 */
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

/**
 * Compresses a trace point into a compact string representation
 * Combines 3 compressed numbers (time, x, y) with the action code
 * 
 * @param {P} p - Trace point [time, x, y, action]
 * @returns {string} Compressed point string (6 chars + action)
 * 
 * @example
 * ```typescript
 * compressPoint([0, 0.5, 0.3, 'spk']) // "AAAAAAAA0spk"
 * compressPoint([65, 0.8, 0.2, 0])    // "ABAAAA0"
 * ```
 */
const compressPoint = (p: P) => {
    return compressNum(p[0]) + compressNum(p[1]) + compressNum(p[2]) + (p[3] === 0 ? '0' : p[3]);
};

/**
 * Decompresses a point string back to trace point tuple
 * Extracts time, coordinates, and action from compressed format
 * 
 * @param {string} p - Compressed point string
 * @returns {P} Trace point [time, x, y, action]
 * 
 * @example
 * ```typescript
 * decompressPoint("AAAAAAAA0spk") // [0, 0, 0, 'spk']
 * decompressPoint("ABAAAA0")      // [1, 0, 0, 0]
 * ```
 */
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

/**
 * Compresses an entire trace array into a compact string
 * Joins compressed points with semicolons for storage efficiency
 * 
 * @param {TraceArray} trace - Array of trace points to compress
 * @returns {string} Compressed trace string
 * 
 * @example
 * ```typescript
 * const compressed = compress([[0, 0.5, 0.3, 'spk'], [1, 0.6, 0.4, 0]]);
 * // Returns: "AAAAAAAA0spk;ABAAAA0"
 * ```
 */
const compress = (trace: TraceArray) => {
    return trace.map(compressPoint).join(';');
};

/**
 * Decompresses a trace string back to trace array
 * Splits on semicolons and decompresses each point
 * 
 * @param {string} trace - Compressed trace string
 * @returns {TraceArray} Array of decompressed trace points
 * 
 * @example
 * ```typescript
 * const trace = decompress("AAAAAAAA0spk;ABAAAA0");
 * // Returns: [[0, 0, 0, 'spk'], [1, 0, 0, 0]]
 * ```
 */
const decompress = (trace: string) => {
    return trace.split(';').map(decompressPoint);
}

/**
 * Trace point tuple representing robot state at a specific time
 * @typedef {[number, number, number, Action | 0]} P
 * - [0]: Time index (0-599, quarter-second intervals)
 * - [1]: X coordinate (0-1, normalized field position)  
 * - [2]: Y coordinate (0-1, normalized field position)
 * - [3]: Action code or 0 (no action)
 */
export type P = [number, number, number, Action | 0];

/**
 * Array of trace points representing complete robot movement and actions
 * @typedef {P[]} TraceArray
 */
export type TraceArray = P[];

/**
 * Represents robot movement and action data throughout a match
 * Provides methods for parsing, compression, analysis, and manipulation of trace data
 * 
 * @class Trace
 * @example
 * ```typescript
 * // Parse from various formats
 * const trace = Trace.parse(compressedData);
 * 
 * // Analyze performance
 * const avgVelocity = trace.averageVelocity();
 * const speakerShots = trace.filterAction('spk');
 * 
 * // Export in different formats
 * const compressed = trace.serialize(true);
 * const readable = trace.serialize(false);
 * ```
 */
export class Trace {
    /**
     * Expands a sparse trace array to exactly 600 points (full match length)
     * Fills gaps between recorded points with interpolated positions
     * 
     * @static
     * @param {TraceArray} trace - Sparse trace data to expand
     * @returns {TraceArray} Complete 600-point trace
     * 
     * @example
     * ```typescript
     * const sparse = [[0, 0.1, 0.1, 0], [10, 0.2, 0.2, 'spk']];
     * const full = Trace.expand(sparse); // 600 points with interpolation
     * ```
     */
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

    /**
     * Removes redundant points from an expanded trace to create sparse representation
     * Eliminates consecutive points with same position and no action
     * 
     * @static
     * @param {TraceArray} trace - Expanded trace to compress
     * @returns {TraceArray} Sparse trace with redundant points removed
     * 
     * @example
     * ```typescript
     * const expanded = [...]; // 600 points
     * const sparse = Trace.deExpand(expanded); // Much smaller array
     * ```
     */
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

    /**
     * Parses trace data from various formats (compressed, parsed, or expanded)
     * Handles automatic format detection and conversion to full Trace instance
     * 
     * @static
     * @param {unknown} data - Raw trace data in any supported format
     * @returns {import('ts-utils/check').Result<Trace>} Result containing parsed Trace or error
     * 
     * @example
     * ```typescript
     * // From compressed string
     * const result1 = Trace.parse({ state: 'compressed', trace: 'AAAA...' });
     * 
     * // From parsed array
     * const result2 = Trace.parse({ state: 'parsed', trace: [[0,0.1,0.1,0]] });
     * 
     * // From JSON string
     * const result3 = Trace.parse('{"state":"compressed","trace":"..."}');
     * 
     * if (result1.success) {
     *   const trace = result1.data;
     *   console.log(`Average velocity: ${trace.averageVelocity()}`);
     * }
     * ```
     */
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
                const parsedTrace = TraceSchema.parse(res.trace);
                return new Trace(Trace.expand(parsedTrace as TraceArray));
            }

            if (res.state === 'expanded') {
                if (!Array.isArray(res.trace)) throw new TraceError('Expected trace to be an array for expanded state');
                const expandedTrace = TraceSchema.parse(res.trace);
                return new Trace(expandedTrace as TraceArray);
            }
        });
    }

    /**
     * Creates a new Trace instance with validated point data
     * Ensures trace contains exactly 600 points (full match duration)
     * 
     * @param {z.infer<typeof TraceSchema>} points - Array of exactly 600 trace points
     * @throws {Error} If points array is not exactly 600 elements
     * 
     * @example
     * ```typescript
     * const expandedTrace = Trace.expand(sparseData);
     * const trace = new Trace(expandedTrace);
     * console.log(`Trace has ${trace.points.length} points`); // Always 600
     * ```
     */
    constructor(
        public readonly points: z.infer<typeof TraceSchema>
    ) {
        if (points.length !== 600) {
            throw new Error(`Trace must have exactly 600 points. Got ${points.length}`);
        }
    }

    /**
     * Calculates velocity between consecutive trace points
     * Returns array of velocities in feet per second
     * 
     * @returns {number[]} Array of velocity values (fps)
     * 
     * @example
     * ```typescript
     * const velocities = trace.velocityMap();
     * const maxVelocity = Math.max(...velocities);
     * console.log(`Peak velocity: ${maxVelocity.toFixed(1)} fps`);
     * ```
     */
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

    /**
     * Generates a histogram of velocity distribution
     * Useful for analyzing robot movement patterns and performance characteristics
     * 
     * @param {number} bins - Number of histogram bins to create
     * @returns {number[]} Array of counts for each velocity bin
     * 
     * @example
     * ```typescript
     * const histogram = trace.velocityHistogram(10);
     * console.log(`Most common velocity range has ${Math.max(...histogram)} occurrences`);
     * 
     * // Visualize velocity distribution
     * histogram.forEach((count, i) => {
     *   const velocity = (i * maxVelocity / bins).toFixed(1);
     *   console.log(`${velocity} fps: ${'█'.repeat(count / 10)}`);
     * });
     * ```
     */
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

    /**
     * Calculates average velocity across entire trace
     * Provides overall measure of robot movement speed
     * 
     * @returns {number} Average velocity in feet per second
     * 
     * @example
     * ```typescript
     * const avgVel = trace.averageVelocity();
     * console.log(`Average velocity: ${avgVel.toFixed(2)} fps`);
     * 
     * // Compare with league average
     * if (avgVel > 8.0) {
     *   console.log("Above average mobility");
     * }
     * ```
     */
    averageVelocity(): number {
        const m = this.velocityMap();
        const sum = m.reduce((a, b) => a + b, 0);
        return sum / m.length;
    }

    /**
     * Filters trace points by specific action type
     * Returns all points where the robot performed the specified action
     * 
     * @param {Action} action - Action code to filter for
     * @returns {P[]} Array of points where action occurred
     * 
     * @example
     * ```typescript
     * // Count speaker shots
     * const speakerShots = trace.filterAction('spk');
     * console.log(`Speaker attempts: ${speakerShots.length}`);
     * 
     * // Analyze climb timing
     * const climbs = trace.filterAction('clb');
     * const climbTimes = climbs.map(p => p[0] / 4); // Convert to seconds
     * console.log(`Climbs at: ${climbTimes.join(', ')}s`);
     * ```
     */
    filterAction(action: Action) {
        return this.points.filter(p => p[3] === action);
    }

    /**
     * Serializes trace to JSON string in specified format
     * Supports both compressed (efficient storage) and parsed (human readable) formats
     * 
     * @param {boolean} [compressed=true] - Whether to use compressed format
     * @returns {string} JSON string representation of trace
     * 
     * @example
     * ```typescript
     * // For storage/transmission (smaller size)
     * const compressed = trace.serialize(true);
     * 
     * // For debugging/analysis (readable format) 
     * const readable = trace.serialize(false);
     * 
     * // Parse back to Trace object
     * const restored = Trace.parse(compressed);
     * ```
     */
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