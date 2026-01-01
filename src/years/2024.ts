import { Point2D } from "math/point";
import { YearInfo } from ".";
import { Trace } from "../trace";
import { isInside } from "math/polygon";
import { attempt, Result } from "ts-utils/check";
import { Match2024Schema, TBAMatch, TBAMatch2024 } from "../tba";

/**
 * Global field zones for 2024 CRESCENDO game
 * These are neutral areas accessible to both alliances (stage areas)
 */
const globalZones2024 = {
    sta1: [
        [0.026, 0.227],
        [0.01, 0.16],
        [0.1, 0.028],
        [0.129, 0.067]
    ],
    sta2: [
        [0.869, 0.064],
        [0.9, 0.03],
        [0.99, 0.16],
        [0.975, 0.222]
    ],
    sta3: [
        [0.975, 0.776],
        [0.99, 0.846],
        [0.903, 0.969],
        [0.871, 0.937]
    ],
    sta4: [
        [0.027, 0.776],
        [0.131, 0.939],
        [0.097, 0.982],
        [0.009, 0.85]
    ]
};

/**
 * Alliance-specific zones for 2024 CRESCENDO game
 * Includes stages, amps, alliance zones, sources, and autonomous areas
 */
const allianceZones2024 = {
    stages: {
        blue: [
            [0.362, 0.330],
            [0.375, 0.347],
            [0.377, 0.648],
            [0.361, 0.665],
            [0.241, 0.518],
            [0.243, 0.476]
        ],
        red: [
            [0.624, 0.346],
            [0.639, 0.331],
            [0.758, 0.479],
            [0.759, 0.519],
            [0.639, 0.670],
            [0.623, 0.651]
        ]
    },
    amps: {
        blue: [
            [0.246, 0.044],
            [0.245, 0.095],
            [0.081, 0.092],
            [0.082, 0.046]
        ],
        red: [
            [0.755, 0.044],
            [0.754, 0.092],
            [0.919, 0.095],
            [0.919, 0.044]
        ]
    },
    zones: {
        blue: [
            [0.377, 0.046],
            [0.077, 0.038],
            [0.079, 0.226],
            [0.124, 0.282],
            [0.124, 0.398],
            [0.078, 0.451],
            [0.080, 0.772],
            [0.175, 0.892],
            [0.173, 0.953],
            [0.376, 0.949]
        ],
        red: [
            [0.624, 0.043],
            [0.920, 0.043],
            [0.920, 0.225],
            [0.874, 0.283],
            [0.875, 0.396],
            [0.920, 0.454],
            [0.920, 0.771],
            [0.827, 0.886],
            [0.826, 0.952],
            [0.624, 0.952]
        ]
    },
    srcs: {
        blue: [
            [0.827, 0.949],
            [0.921, 0.832],
            [0.919, 0.773],
            [0.828, 0.889]
        ],
        red: [
            [0.080, 0.776],
            [0.079, 0.830],
            [0.173, 0.950],
            [0.174, 0.891]
        ]
    },
    auto: {
        blue: [
            [0.079, 0.094],
            [0.175, 0.092],
            [0.176, 0.950],
            [0.080, 0.833],
            [0.080, 0.455],
            [0.124, 0.400],
            [0.124, 0.282],
            [0.080, 0.225]
        ],
        red: [
            [0.823, 0.095],
            [0.919, 0.097],
            [0.920, 0.224],
            [0.875, 0.285],
            [0.875, 0.396],
            [0.921, 0.449],
            [0.921, 0.832],
            [0.827, 0.949]
        ]
    }
};

/**
 * Action codes and display names for 2024 CRESCENDO game
 * Maps short codes to human-readable action descriptions
 */
const actions2024 = {
    spk: 'Speaker',
    amp: 'Amp',
    src: 'Source',
    trp: 'Trap',
    clb: 'Climb',
    lob: 'Lob',
    cne: 'Cone',
    cbe: 'Cube',
    bal: 'Balance',
    pck: 'Pick',
    nte: 'Note'
};

/**
 * Point values for each action in different game periods for 2024 CRESCENDO
 * Defines scoring system used for calculating team performance
 */
const scoreBreakdown2024 = {
    auto: {
        spk: 5,
        amp: 2
    },
    teleop: {
        spk: 2,
        lob: 0,
        amp: 1,
    },
    endgame: {
        clb: 3,
        park: 2,
        trp: 5
    },
}

/**
 * Structured score breakdown for 2024 CRESCENDO game
 * Provides detailed scoring information for autonomous, teleop, and endgame periods
 * @typedef {Readonly<object>} ParsedScoreBreakdown2024
 */
type ParsedScoreBreakdown2024 = Readonly<{
    auto: {
        spk: number;
        amp: number;
        total: number;
    };
    teleop: {
        spk: number;
        amp: number;
        lob: number;
        total: number;
    };
    endgame: {
        clb: number;
        park: number;
        trp: number;
        total: number;
    };
    total: number;
}>;

/**
 * Year-specific implementation for 2024 CRESCENDO game
 * Handles field layout, scoring calculations, alliance detection, and game-specific analysis
 * 
 * @extends YearInfo
 * @example
 * ```typescript
 * import year2024 from './2024';
 * 
 * const alliance = year2024.getAlliance(trace);
 * const score = year2024.parse(trace);
 * const climbData = year2024.climbTimes(trace);
 * const needsGroundPick = year2024.mustGroundPick(trace);
 * ```
 */
class YearInfo2024 extends YearInfo<
    typeof globalZones2024,
    typeof allianceZones2024,
    keyof typeof actions2024,
    typeof scoreBreakdown2024,
    ParsedScoreBreakdown2024
> {
    parseMatch(match: TBAMatch): Result<TBAMatch2024> {
        return attempt(() => {
            return Match2024Schema.parse(match);
        });
    }

    /**
     * Determines alliance based on robot's starting position
     * Uses the first trace point to check which alliance zone the robot starts in
     * 
     * @param {Trace} trace - Robot movement trace data
     * @returns {"red" | "blue" | "unknown"} Alliance color based on starting position
     */
    getAlliance(trace: Trace): "red" | "blue" | "unknown" {
        if (!trace.points.length) return 'unknown';
        const initPoint: Point2D = [trace.points[0][1], trace.points[0][2]];
        if (isInside(initPoint, this.allianceAreas.zones.red as Point2D[])) {
            return 'red';
        } else {
            return 'blue';
        }
    }

    /**
     * Parses a robot trace into detailed score breakdown for 2024 CRESCENDO
     * Calculates points for speaker shots, amp scores, climbs, traps, and parking
     * 
     * @param {Trace} trace - Robot movement and action trace data
     * @returns {ParsedScoreBreakdown2024} Detailed scoring breakdown by game period
     * 
     * @example
     * ```typescript
     * const scoreData = year2024.parse(robotTrace);
     * console.log(`Auto points: ${scoreData.auto.total}`);
     * console.log(`Endgame climbs: ${scoreData.endgame.clb}`);
     * ```
     */
    parse(trace: Trace): ParsedScoreBreakdown2024 {
        const alliance = this.getAlliance(trace);

        const { auto, teleop, endgame } = this.scoreBreakdown;

        const score = {
            auto: {
                spk: 0,
                amp: 0,
                lob: 0,
                total: 0,
            },
            teleop: {
                spk: 0,
                amp: 0,
                lob: 0,
                total: 0,
            },
            endgame: {
                clb: 0,
                park: 0,
                trp: 0,
                total: 0,
            },
            total: 0
        };

        if (alliance === 'unknown') {
            console.error('Cannot parse trace with unknown alliance');
            return score;
        }

        for (const p of trace.points) {
            if (p[0] <= 65) {
                if (p[3] === 'spk') score.auto.spk += auto.spk;
                if (p[3] === 'amp') score.auto.amp += auto.amp;
            } else {
                if (p[3] === 'spk') score.teleop.spk += teleop.spk;
                if (p[3] === 'amp') score.teleop.amp += teleop.amp;
                if (p[3] === 'clb') score.endgame.clb += endgame.clb;
                if (p[3] === 'trp') score.endgame.trp += endgame.trp;
                if (p[3] === 'lob') score.teleop.lob += teleop.lob;
            }
        }

        const parkZone = this.allianceAreas.stages[alliance];

        const noClimb = trace.points.every(p => p[3] !== 'clb');
        if (
            noClimb &&
            trace.points.length &&
            isInside(
                [
                    trace.points[trace.points.length - 1][1],
                    trace.points[trace.points.length - 1][2]
                ],
                parkZone as Point2D[]
            )
        ) {
            score.endgame.park += endgame.park;
        }

        score.auto.total =
            score.auto.spk + score.auto.amp;
        score.teleop.total =
            score.teleop.spk + score.teleop.amp;
        score.endgame.total = score.endgame.clb + score.endgame.park;
        score.total =
            score.auto.total + score.teleop.total + score.endgame.total;

        return score;
    }

    /**
     * Analyzes climb timing and duration from robot trace
     * Tracks time spent in stage area before each climb/trap action
     * 
     * @param {Trace} trace - Robot movement trace data
     * @returns {number[]} Array of time durations (in quarter-seconds) for each climb attempt
     * 
     * @example
     * ```typescript
     * const times = year2024.climbTimes(trace);
     * console.log(`Climbs attempted: ${times.length}`);
     * console.log(`Average climb time: ${times.reduce((a,b) => a+b) / times.length / 4}s`);
     * ```
     */
    climbTimes(trace: Trace): number[] {
        const alliance = this.getAlliance(trace);
        if (alliance === 'unknown') return [];
        const stage = this.allianceAreas.stages[alliance];

        const times: number[] = [];

        let time = 0;
        for (const p of trace.points) {
            if (isInside([p[1], p[2]], stage as Point2D[])) {
                time++;
            } else {
                time = 0;
            }

            if (['clb', 'trp'].includes(String(p[3]))) {
                times.push(time);
                time = 0;
            }
        }

        return times;
    }

    /**
     * Determines if robot must have performed ground pickups during the match
     * Compares speaker shots to source pickups to detect ground pickup necessity
     * 
     * @param {Trace} trace - Robot movement and action trace data
     * @returns {boolean} True if ground pickups were required (more shots than source pickups + preload)
     * 
     * @example
     * ```typescript
     * const needsGroundPick = year2024.mustGroundPick(trace);
     * if (needsGroundPick) {
     *   console.log("Robot performed ground pickups");
     * }
     * ```
     */
    mustGroundPick(trace: Trace): boolean {
        return (
            trace.filterAction('spk').length >
            trace.filterAction('src').length + 1
        );
    }
}

/**
 * Default instance of YearInfo2024 with complete field layout and scoring rules
 * Ready to use for 2024 CRESCENDO game analysis
 * 
 * @type {YearInfo2024}
 * @example
 * ```typescript
 * import year2024 from './years/2024';
 * 
 * const teamScore = year2024.parse(trace);
 * const alliance = year2024.getAlliance(trace);
 * const climbAnalysis = year2024.climbTimes(trace);
 * ```
 */
const yearInfo = new YearInfo2024(
    globalZones2024,
    allianceZones2024,
    [
        [0.920, 0.042],
        [0.920, 0.227],
        [0.875, 0.282],
        [0.875, 0.395],
        [0.921, 0.456],
        [0.921, 0.833],
        [0.824, 0.955],
        [0.174, 0.955],
        [0.079, 0.832],
        [0.079, 0.449],
        [0.126, 0.399],
        [0.124, 0.283],
        [0.080, 0.224],
        [0.080, 0.042]
    ],
    actions2024,
    scoreBreakdown2024,
    {}
);

/**
 * Export the YearInfo2024 class type for type checking and extension
 * @typedef {YearInfo2024} YearInfo2024
 */
export default {
    YearInfo2024: yearInfo,
}

/**
 * Predefined note positions on the 2024 CRESCENDO field
 * Normalized coordinates for center line notes and wing notes
 * Used for field visualization and note tracking analysis
 * 
 * @type {Point2D[]}
 * @example
 * ```typescript
 * import { notePositions } from './years/2024';
 * 
 * // Find closest note to robot position
 * const robotPos: Point2D = [0.3, 0.5];
 * const closest = notePositions.reduce((prev, curr) => 
 *   distance(robotPos, curr) < distance(robotPos, prev) ? curr : prev
 * );
 * ```
 */
export const notePositions: Point2D[] = [
    [0.5, 0.128],
    [0.5, 0.315],
    [0.5, 0.5],
    [0.5, 0.685],
    [0.5, 0.870],
    [0.773, 0.181], // red
    [0.773, 0.342], // red
    [0.773, 0.5], // red
    [0.226, 0.181], // blue
    [0.226, 0.339], // blue
    [0.226, 0.5] // blue
];
