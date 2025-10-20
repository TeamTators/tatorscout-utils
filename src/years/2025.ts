import { Point2D } from "math/point";
import { type AllianceZoneMap, YearInfo, type Zone, type ZoneMap } from ".";
import { Trace } from "../trace";
import { isInside } from "math/polygon";
import { createTypedSummary, SummarySchema } from "../summary";
import { $Math } from "ts-utils/math";

/**
 * Global field zones for 2025 REEFSCAPE game
 * These are neutral areas accessible to both alliances
 */
const globalZones2025 = {
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
 * Alliance-specific zones for 2025 REEFSCAPE game
 * Includes autonomous zones, scoring areas, and alliance-specific regions
 */
const allianceZones2025 = {
    auto: {
        red: [
            [0.435, 0.066],
            [0.565, 0.067],
            [0.567, 0.51],
            [0.437, 0.502]
        ],
        blue: [
            [0.436, 0.506],
            [0.566, 0.51],
            [0.567, 0.935],
            [0.435, 0.935]
        ]
    },
    zones: {
        blue: [
            [0.5, 0.064],
            [0.882, 0.067],
            [0.976, 0.205],
            [0.978, 0.798],
            [0.888, 0.937],
            [0.505, 0.935]
        ],
        red: [
            [0.499, 0.064],
            [0.501, 0.945],
            [0.12, 0.937],
            [0.027, 0.802],
            [0.025, 0.203],
            [0.12, 0.069]
        ]
    },
    reefs: {
        blue: [
            [0.472, 0.519],
            [0.47, 0.938],
            [0.884, 0.941],
            [0.977, 0.799],
            [0.975, 0.204],
            [0.886, 0.071],
            [0.531, 0.063],
            [0.529, 0.522]
        ],
        red: [
            [0.528, 0.486],
            [0.531, 0.068],
            [0.117, 0.071],
            [0.024, 0.205],
            [0.024, 0.804],
            [0.116, 0.935],
            [0.467, 0.936],
            [0.472, 0.489]
        ]
    },
    processors: {
        red: [
            [0.608, 0.067],
            [0.608, 0.006],
            [0.674, 0.006],
            [0.674, 0.066]
        ],
        blue: [
            [0.327, 0.997],
            [0.326, 0.932],
            [0.392, 0.93],
            [0.394, 0.997]
        ]
    },
    barges: {
        blue: [
            [0.469, 0.067],
            [0.534, 0.069],
            [0.534, 0.489],
            [0.467, 0.487]
        ],
        red: [
            [0.471, 0.515],
            [0.53, 0.519],
            [0.532, 0.928],
            [0.468, 0.926]
        ]
    }
};

/**
 * Action codes and display names for 2025 REEFSCAPE game
 * Maps short codes to human-readable action descriptions
 */
const actions2025 = {
    cl1: 'Coral L1',
    cl2: 'Coral L2',
    cl3: 'Coral L3',
    cl4: 'Coral L4',
    prc: 'Processor',
    brg: 'Barge',
    dpc: 'Deep Climb',
    shc: 'Shallow Climb',
};

/**
 * Point values for each action in different game periods for 2025 REEFSCAPE
 * Defines scoring system used for calculating team performance
 */
const scoreBreakdown2025 = {
    auto: {
        cl1: 3,
        cl2: 4,
        cl3: 6,
        cl4: 7,
        brg: 4,
        prc: 6
    },
    teleop: {
        cl1: 2,
        cl2: 3,
        cl3: 4,
        cl4: 5,
        brg: 4,
        prc: 6,
    },
    endgame: {
        shc: 6,
        dpc: 12,
        park: 2,
    }
};

/**
 * Structured score breakdown for 2025 REEFSCAPE game
 * Provides detailed scoring information for autonomous, teleop, and endgame periods
 * @typedef {Readonly<object>} ParsedScoreBreakdown2025
 */
type ParsedScoreBreakdown2025 = Readonly<{
    auto: {
        cl1: number;
        cl2: number;
        cl3: number;
        cl4: number;
        brg: number;
        prc: number;
        total: number;
    };
    teleop: {
        cl1: number;
        cl2: number;
        cl3: number;
        cl4: number;
        brg: number;
        prc: number;
        total: number;
    };
    endgame: {
        shc: number;
        dpc: number;
        park: number;
        total: number;
    };
    total: number;
}>;

/**
 * Year-specific implementation for 2025 REEFSCAPE game
 * Handles field layout, scoring calculations, and alliance detection
 * 
 * @extends YearInfo
 * @example
 * ```typescript
 * import year2025 from './2025';
 * 
 * const alliance = year2025.getAlliance(trace);
 * const score = year2025.parse(trace);
 * const summary = year2025.summary(analysisSchema);
 * ```
 */
class YearInfo2025 extends YearInfo<
    typeof globalZones2025,
    typeof allianceZones2025,
    keyof typeof actions2025,
    typeof scoreBreakdown2025,
    ParsedScoreBreakdown2025
> {

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
     * Parses a robot trace into detailed score breakdown for 2025 REEFSCAPE
     * Calculates points for coral placement, algae processing, and other scoring actions
     * 
     * @param {Trace} trace - Robot movement and action trace data
     * @returns {ParsedScoreBreakdown2025} Detailed scoring breakdown by game period
     * 
     * @example
     * ```typescript
     * const scoreData = year2025.parse(robotTrace);
     * console.log(`Auto points: ${scoreData.auto.total}`);
     * console.log(`Teleop coral: ${scoreData.teleop.cl1 + scoreData.teleop.cl2}`);
     * ```
     */
    parse(trace: Trace): ParsedScoreBreakdown2025 {
        // alliance = ['red', 'blue'].includes(alliance) ? alliance : 'red';
        const { auto, teleop } = this.scoreBreakdown;

        const score = {
            auto: {
                cl1: 0,
                cl2: 0,
                cl3: 0,
                cl4: 0,
                brg: 0,
                prc: 0,
                total: 0
            },
            teleop: {
                cl1: 0,
                cl2: 0,
                cl3: 0,
                cl4: 0,
                brg: 0,
                prc: 0,
                total: 0
            },
            endgame: {
                shc: 0,
                dpc: 0,
                park: 0,
                total: 0
            },
            total: 0
        };

        for (const p of trace.points) {
            if (p[0] <= 65) {
                if (p[3] === 'cl1') score.auto.cl1 += auto.cl1;
                if (p[3] === 'cl2') score.auto.cl2 += auto.cl2;
                if (p[3] === 'cl3') score.auto.cl3 += auto.cl3;
                if (p[3] === 'cl4') score.auto.cl4 += auto.cl4;
                if (p[3] === 'brg') score.auto.brg += auto.brg;
                if (p[3] === 'prc') score.auto.prc += auto.prc;
            } else {
                if (p[3] === 'cl1') score.teleop.cl1 += teleop.cl1;
                if (p[3] === 'cl2') score.teleop.cl2 += teleop.cl2;
                if (p[3] === 'cl3') score.teleop.cl3 += teleop.cl3;
                if (p[3] === 'cl4') score.teleop.cl4 += teleop.cl4;
                if (p[3] === 'brg') score.teleop.brg += teleop.brg;
                if (p[3] === 'prc') score.teleop.prc += teleop.prc;
            }
        }

        score.auto.total = Object.values(score.auto).reduce(
            (a, b) => a + b, 0
        );

        score.teleop.total = Object.values(score.teleop).reduce(
            (a, b) => a + b, 0
        );

        score.total =
            score.auto.total + score.teleop.total;

        // endgame is handled separately

        return score;
    }
}

/**
 * Default instance of YearInfo2025 with complete field layout and scoring rules
 * Ready to use for 2025 REEFSCAPE game analysis
 * 
 * @type {YearInfo2025}
 * @example
 * ```typescript
 * import year2025 from './years/2025';
 * 
 * const teamScore = year2025.parse(trace);
 * const alliance = year2025.getAlliance(trace);
 * ```
 */
export default new YearInfo2025(
    globalZones2025,
    allianceZones2025,
    [
        [0.117, 0.064],
        [0.882, 0.067],
        [0.975, 0.207],
        [0.977, 0.8],
        [0.885, 0.939],
        [0.119, 0.941],
        [0.026, 0.8],
        [0.025, 0.201]
    ],
    actions2025,
    scoreBreakdown2025
);

/**
 * Export the YearInfo2025 class type for type checking and extension
 * @typedef {YearInfo2025} YearInfo2025
 */
export type { YearInfo2025 };