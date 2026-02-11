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
 * - Index: 0-640 (quarter-second intervals in a match and buffer)
 * - X/Y coordinates: 0-1 (normalized field positions)
 * - Action: string code or 0 (no action)
 */
export const TraceSchema = z.array(z.tuple([
    z.number().min(0).max(640).int(),
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
    
    const fn = (num: number): number => {
        if (num.toString().length < 3) {
            return parseInt(num.toString().padStart(3, '0')) / 1000;
        } else {
            return num / 1000;
        }
    };


    return [
        decompressNum(i),
        fn(decompressNum(x)),
        fn(decompressNum(y)),
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
        if (trace.length === 640) {
            return trace;
        }
        if (trace.length > 640) {
            // truncate to 640 points by removing duplicate time points
            const seen = new Set<number>();
            const truncated: TraceArray = [];
            for (const point of trace) {
                if (!seen.has(point[0]) && point[0] < 640) {
                    truncated.push(point);
                    seen.add(point[0]);
                }
                if (truncated.length === 640) break;
            }
            return truncated;
        }
        
        // Ensure we have a complete 640-point array
        const expanded: TraceArray = [];
        
        // Create a map of existing points by time index
        const pointMap = new Map<number, P>();
        for (const point of trace) {
            pointMap.set(point[0], point);
        }
        
        // Fill in all points from 0 to 639
        for (let i = 0; i < 640; i++) {
            if (pointMap.has(i)) {
                // Use existing point
                expanded.push(pointMap.get(i)!);
            } else {
                // Find the last known point before this time
                let lastKnownPoint: P = [0, 0, 0, 0]; // Default starting position
                for (let j = i - 1; j >= 0; j--) {
                    if (pointMap.has(j)) {
                        lastKnownPoint = pointMap.get(j)!;
                        break;
                    }
                }
                // Create filler point with same position as last known point
                expanded.push([i, lastKnownPoint[1], lastKnownPoint[2], 0]);
            }
        }

        return expanded;
    }

    static getSection(point: P) {
        if (!point) return null;

        const [time] = point;
        if (time < 15 * 4) return 'auto';
        if (time < 135 * 4) return 'teleop';
        if (time < 150 * 4) return 'endgame';

        return null;
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
            if (Array.isArray(parsed)) {
                const clamp = (num: number, min: number, max: number) => {
                    return Math.min(Math.max(num, min), max);
                }
                parsed = parsed.map(([i, x, y, a]) => {
                    return [
                        i,
                        clamp(x, 0, 1),
                        clamp(y, 0, 1),
                        a
                    ];
                });
                return new Trace(Trace.expand(TraceSchema.parse(parsed) as TraceArray));
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

            throw new Error('Invalid trace state');
        });
    }

    /**
     * Converts to new number scheme
     * @param trace 
     * @returns 
     */
    public static convert(trace: P[]): P[] {
        let hasDecimal = false;
        for (const p of trace) {
            if (!Number.isInteger(p[1]) || !Number.isInteger(p[2])) {
                hasDecimal = true;
                break;
            }
        }
        if (!hasDecimal) return trace.slice();
        const c = (n: number) => {
            n = Math.min(Math.max(n, 0), 1);
            if (n === 1) return '999';
            if (n === 0) return '000';
            const [,str] = n.toString().split('.');
            return str.slice(0, 3).padEnd(3, '0');
        }
        return trace.map(([i, x, y, a]) => [
            i,
            parseInt(c(x)),
            parseInt(c(y)),
            a
        ]);
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
        if (points.length !== 640) {
            throw new Error(`Trace must have exactly 640 points. Got ${points.length}`);
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
                trace: compress(Trace.convert(this.points as TraceArray)),
            });
        } else {
            return JSON.stringify({
                state: 'parsed',
                trace: Trace.deExpand(Trace.convert(this.points as TraceArray)),
            });
        }
    }

    /**
     * Calculates total time robot was effectively stationary
     * Counts intervals where velocity is below specified threshold
     * @param threshold - Velocity threshold to consider as "not moving" (fps)
     * @returns {number} Total time stationary in seconds
     */
    secondsNotMoving(threshold = 0.1): number {
        const velocities = this.velocityMap();
        let notMovingCount = 0;

        for (const v of velocities) {
            if (v < threshold) {
                notMovingCount++;
            }
        }

        return notMovingCount / 4; // Convert to seconds
    }

    /**
     * Retrieves trace points for specified match section
     * @param section Time section to retrieve
     * @returns {TraceArray} Array of trace points for the section
     */
    getSection(section: 'auto' | 'teleop' | 'endgame'): TraceArray {
        switch (section) {
            case 'auto':
                return this.points.slice(0, 15 * 4) as TraceArray;
            case 'teleop':
                return this.points.slice(15 * 4, 135 * 4) as TraceArray;
            case 'endgame':
                return this.points.slice(135 * 4, 150 * 4) as TraceArray;
            default:
                return [];
        }
    }
}



const traceString = `{"state":"compressed","trace":"AAAAAA0;ABObEl0;ACQQCW0;ADQQCW0;AEQQCW0;AFPoDG0;AGPHDj0;AHOWDy0;AINbEE0;AJNYEE0;AKNXEG0;ALNXEG0;AMNhEQ0;ANObEp0;AOPVFT0;APQDFf0;AQQmGF0;ARRWJF0;ASQhLt0;ATMvOx0;AUMKQE0;AVMRQh0;AWLDRb0;AXJbSH0;AYJASL0;AZJCRQ0;AaJNQc0;AbLxQQ0;AcOpOU0;AdQkJb0;AeRJIHspk;AfRJIH0;AgRJIHspk;AhRJIH0;AiRJIH0;AjRJIH0;AkQoJj0;AlQFLF0;AmPnLo0;AnPdMQ0;AoPcMe0;ApPbMe0;AqPZMi0;ArOhNb0;AsOGNx0;AtOAOE0;AuNBOs0;AvMNPi0;AwKzQL0;AxJcPN0;AyJOOj0;AzJUNr0;BAJkOW0;BBKcPg0;BCMHQI0;BDNbPg0;BEPSNY0;BFQWLJ0;BGQmKR0;BHQhKZ0;BIPbLe0;BJPKMB0;BKPKMB0;BLOyMG0;BMOrMK0;BNOrMK0;BOOrMK0;BPOrMK0;BQOrMW0;BROsMY0;BSOsMY0;BTOxMW0;BUPPLz0;BVPiLQ0;BWQCKZ0;BXQTJk0;BYQZJg0;BZQcJe0;BaQfJd0;BbQhJd0;BcQhJd0;BdQiJd0;BeQkJd0;BfQlJd0;BgQnJd0;BhQpJe0;BiQqJe0;BjQqJespk;BkQqJe0;BlQqJe0;BmQhIX0;BnQLJb0;BoPyJr0;BpPqKR0;BqPrKo0;BrPuKu0;BsQCKI0;BtQFJO0;BuPvHz0;BvPuHU0;BwQDGF0;BxQLEj0;ByQpDT0;BzRNCx0;CARNDD0;CBREDJ0;CCRBDJ0;CDRBDQ0;CEQyDT0;CFQxDY0;CGQwDi0;CHQwDs0;CIQxEB0;CJRBEJ0;CKRBEJ0;CLRCET0;CMQyFdspk;CNQyFd0;COQyFd0;CPQyFd0;CQQIGB0;CRQLFF0;CSQPEv0;CTQWEv0;CUQcEv0;CVQcFI0;CWOwHh0;CXNHHV0;CYLAJb0;CZIlJt0;CaHQKP0;CbFtLV0;CcEmNZ0;CdDxOy0;CeCQOm0;CfCQOl0;CgCoOd0;ChDjOc0;CiETOW0;CjFINZ0;CkGCMW0;ClDfQH0;CmDKQL0;CnDNQE0;CoDkPZ0;CpEKNx0;CqDzOB0;CrDUQF0;CsDWQH0;CtEDOp0;CuEUOX0;CvDrPT0;CwDMQR0;CxDKQU0;CyDKQU0;CzDKQg0;DADMQq0;DBDTQt0;DCDXQy0;DDDHQU0;DEDPQK0;DFEOQN0;DGEdQI0;DHEgQI0;DIEgQI0;DJEaQN0;DKEaQN0;DLEaQN0;DMEaQN0;DNEaQN0;DOFCQT0;DPGCQm0;DQHTQZ0;DRIeQX0;DSJjQL0;DTKQPd0;DULBOX0;DVLMNc0;DWLMMW0;DXLILY0;DYLUKY0;DZMLJX0;DaMwJG0;DbNUIz0;DcNrId0;DdORIC0;DeOlHn0;DfOuHm0;DgOuHm0;DhOuHm0;DiOwHg0;DjPsHH0;DkQDHI0;DlQDHIspk;DmQDHI0;DnQDHI0;DoPuGq0;DpPNIF0;DqPtJk0;DrQQKe0;DsPwLq0;DtOsMp0;DuOENl0;DvNVOW0;DwMgOj0;DxLzOX0;DyLaOA0;DzLMNj0;EAKnNd0;EBJoOM0;ECIiOy0;EDHNPI0;EEFUOu0;EFEcOU0;EGDkOK0;EHCnOp0;EICQPN0;EJCFPW0;EKCEPX0;ELCEPX0;EMCIPU0;ENCPPN0;EOCSPI0;EPCwOu0;EQEGOu0;ERFAOs0;ESFSOD0;ETFgNA0;EUFwLZ0;EVGZKY0;EWHKKP0;EXIUKq0;EYJfLI0;EZKVLD0;EaLCKi0;EbLlJx0;EcMlJF0;EdNnIY0;EeOrHz0;EfPvHT0;EgQiHB0;EhQnGq0;EiQnGk0;EjQnGh0;EkQmGf0;ElQmGfspk;EmQmGf0;EnQmGf0;EoQfGN0;EpQBGX0;EqPcIx0;ErQQLD0;EsOzMP0;EtNmLb0;EuMpKx0;EvLoKx0;EwLBLc0;ExKgMc0;EyKQNx0;EzJeOx0;FAHyPN0;FBGePr0;FCFhQH0;FDExQT0;FEEePi0;FFEJPE0;FGDdPF0;FHDFPU0;FICpPt0;FJCoQH0;FKCoQQ0;FLCmQT0;FMCmQT0;FNCnQH0;FOCqPy0;FPDMOo0;FQDsNV0;FREhNV0;FSFfMG0;FTGjKY0;FUHeKV0;FVINKM0;FWIlJq0;FXJGJJ0;FYJYIY0;FZJrHs0;FaKRHp0;FbKzHy0;FcLqJM0;FdMmIp0;FeNdGU0;FfOVFF0;FgPoFr0;FhQMGj0;FiQZGp0;FjQbGp0;FkQcGq0;FlQcGqspk;FmQcGq0;FnQcGq0;FoQVFz0;FpPIFX0;FqNRGq0;FrLuJq0;FsKrKc0;FtKCKb0;FuJZKf0;FvIpKx0;FwIHMG0;FxHWNg0;FyGWOX0;FzFaOr0;GAEoPK0;GBEOPg0;GCDrQO0;GDDeQf0;GEDeQd0;GFDfQZ0;GGDfQX0;GHDfQW0;GIDfQW0;GJDeQW0;GKDsQC0;GLEjOP0;GMFzNf0;GNGtNv0;GOHnOK0;GPJDNy0;GQKDNl0;GRKoNK0;GSKrMk0;GTKwLk0;GULdKJ0;GVMBJO0;GWLtHv0;GXLwFg0;GYMrEp0;GZNjFH0;GaOFFt0;GbOTGW0;GcOaGw0;GdOqHs0;GePJHz0;GfPdHj0;GgQKIj0;GhQkIP0;GiQwHw0;GjQyHw0;GkQyHwspk;GlQyHw0;GmQsIm0;GnQBIs0;GoOWHg0;GpNDGO0;GqLiFt0;GrKfGj0;GsKpIn0;GtKiKZ0;GuKLLZ0;GvJkMK0;GwIxNW0;GxHuOf0;GyHFPF0;GzGkPR0;HAGIPc0;HBFgPd0;HCFIPW0;HDEePW0;HEEZPc0;HFEuPy0;HGFRPz0;HHFRPz0;HIFBQC0;HJEoQC0;HKEoQC0;HLEYPs0;HMDhPd0;HNDJPi0;HOCsQB0;HPCsPt0;HQDEPl0;HRDWPf0;HSDPPo0;HTCpPi0;HUChPg0;HVCtPg0;HWDCPg0;HXDYPp0;HYDrPr0;HZELPs0;HaEYPs0;HbEaPs0;HcEaPs0;HdEZPs0;HeEMPt0;HfEHPt0;HgEFPt0;HhEDPt0;HiECPt0;HjEBPr0;HkEBPr0;HlECPw0;HmEDPw0;HnEDPz0;HoEDQH0;HpEFQK0;HqEGQK0;HrEKQO0;HsEjQc0;HtFlPg0;HuHUPZ0;HvJfNZ0;HwLhKI0;HxNHIq0;HyOLHk0;HzOuGt0;IAPOGW0;IBPdGE0;ICPwFN0;IDQIFj0;IEQHGh0;IFQIHV0;IGQPHQspk;IHQPHQ0;IIQPHQ0;IJQmFw0;IKOrGk0;ILNQIS0;IMMOJb0;INLLJx0;IOKbKU0;IPKDLD0;IQJlMH0;IRJgNK0;ISJTOG0;ITIxOj0;IUIlOs0;IVIdPA0;IWIYPE0;IXICPU0;IYHTPo0;IZGNPy0;IaFXPs0;IbEmPs0;IcEPPw0;IdDvQC0;IeDaQK0;IfDNQN0;IgDNQN0;IhDdQE0;IiEGQB0;IjEjQI0;IkFRQQ0;IlGIQF0;ImHLPv0;InIUPg0;IoJLPa0;IpJtPW0;IqKdPU0;IrLNPL0;IsLuOu0;ItNMNl0;IuOzLl0;IvPqKL0;IwQBIz0;IxPvHj0;IyQAGf0;IzQOFw0;JAQZFw0;JBQeGH0;JCQeGHspk;JDQeGH0;JEQeGH0;JFQIGH0;JGPOFj0;JHOxFd0;JIOwFc0;JJOwFc0;JKOwFc0;JLOyFd0;JMPPFw0;JNPkGQ0;JOPoGR0;JPQNGg0;JQQQGg0;JRQQGg0;JSQOGg0;JTPyGH0;JUPjFT0;JVPiGc0;JWQAGX0;JXQFGQ0;JYQGGO0;JZQHGN0;JaQHGL0;JbQHGL0;JcQHGL0;JdQHGLspk;JeQHGL0;JfQHGL0;JgQUFl0;JhQIFo0;JiQGFo0;JjQFFo0;JkQFFs0;JlQFFs0;JmQFFs0;JnQFFs0;JoQFFt0;JpQFFv0;JqQFFv0;JrQFFv0;JsQFFw0;JtQFFw0;JuQFFy0;JvQFFy0;JwQFFz0;JxQFGB0;JyQFGB0;JzPrGE0;KAPBGk0;KBORHw0;KCNwIO0;KDNvIO0;KENvIO0;KFNvIO0;KGNvIO0;KHNvIO0;KINvIO0;KJNvIO0;KKNvIO0;KLNvIO0;KMNvIO0;KNNvIO0;KONvIO0;KPNvIO0;KQNvIO0;KRNvIO0;KSNvIO0;KTNvIO0;KUNvIO0;KVNvIO0;KWNvIO0;KXNvIO0;KYNvIO0;KZNvIO0;KaNvIO0;KbNvIO0;KcNvIO0;KdNvIO0;KeNvIO0;KfNvIO0;KgNvIO0;KhNvIO0;KiNvIO0;KjNvIO0;KkNvIO0;KlNvIO0;KmNvIO0;KnNvIO0;KoNvIO0;KpNvIO0;KqNvIO0;KrNvIO0;KsNvIO0;KtNvIO0;KuNvIO0;KvNvIO0;KwNvIO0;KxNvIO0;KyNvIO0;KzNvIO0;LANvIO0;LBNvIO0;LCNvIO0;LDNvIO0;LENvIO0;LFNvIO0;LGNvIO0;LHNvIO0;LINvIO0;LJNvIO0;LKNvIO0;LLNvIO0;LMNvIO0;LNNvIO0;LONvIO0;LPNvIO0;LQNvIO0;LRNvIO0;LSNvIO0;LTNvIO0;LUNvIO0;LVNvIO0;LWNvIO0;LXNvIO0;LYNvIO0;LZNvIO0;LaNvIO0;LbNvIO0;LcNvIO0;LdNvIO0;LeNvIO0;LfNvIO0;LgNvIO0;LhNvIO0;LiNvIO0;LjNvIO0;LkNvIO0;LlNvIO0;LmNvIO0;LnNvIO0;LoNvIO0;LpNvIO0;LqNvIO0;LrNvIO0;LsNvIO0;LtNvIO0;LuNvIO0;LvNvIO0;LwNvIO0;LxNvIO0;LyNvIO0;LzNvIO0;MANvIO0;MBNvIO0;MCNvIO0;MDNvIO0;MENvIO0;MFNvIO0;MGNvIO0;MHNvIO0;MINvIO0;MJNvIO0;MKNvIO0;MLNvIO0;MMNvIO0;MNNvIO0;MONvIO0;MPNvIO0"}`;

const trace = Trace.parse(traceString).unwrap();

trace.velocityMap();