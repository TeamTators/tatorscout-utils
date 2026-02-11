import { Point2D } from "math/point";
import { YearInfo } from ".";
import { Trace } from "../trace";
import { isInside } from "math/polygon";
import { TBAMatch } from "../tba";
import { attempt } from "ts-utils/check";
import { Match2026Schema, type TBAMatch2026 } from "../tba";

/**
 * Global field zones for 2026 REBUILT game
 * These are neutral areas accessible to both alliances
 */
const globalZones2026 = {
    neutral: [
        [0.306, 0.044],
        [0.694, 0.044],
        [0.694, 0.192],
        [0.664, 0.192],
        [0.664, 0.799],
        [0.692, 0.799],
        [0.692, 0.943],
        [0.308, 0.943],
        [0.308, 0.801],
        [0.334, 0.801],
        [0.334, 0.191],
        [0.306, 0.191]
    ],
};

/**
 * Alliance-specific zones for 2026 REBUILT game
 * Includes autonomous zones, scoring areas, and alliance-specific regions
 */
const allianceZones2026 = {
    zones: {
        blue: [
            [0.051, 0.045],
            [0.269, 0.045],
            [0.269, 0.948],
            [0.051, 0.948]
        ],
        red: [
            [0.730, 0.047],
            [0.947, 0.047],
            [0.947, 0.948],
            [0.730, 0.948]
        ]
    },
    bump: {
        blue: [
            [0.270, 0.194],
            [0.335, 0.194],
            [0.335, 0.800],
            [0.270, 0.800]
        ],
        red: [
            [0.665, 0.194],
            [0.728, 0.194],
            [0.728, 0.800],
            [0.665, 0.800]
        ]
    },
    trenchLeft: {
        red: [
            [0.664, 0.797],
            [0.729, 0.797],
            [0.729, 0.943],
            [0.664, 0.943]
        ],
        blue: [
            [0.270, 0.045],
            [0.336, 0.045],
            [0.336, 0.190],
            [0.270, 0.190]
        ]
    },
    trenchRight: {
        red: [
            [0.664, 0.045],
            [0.730, 0.045],
            [0.730, 0.190],
            [0.664, 0.190]
        ],
        blue: [
            [0.270, 0.797],
            [0.336, 0.797],
            [0.336, 0.943],
            [0.270, 0.943]
        ]
    },
    climb: {
        blue: [
            [0.052, 0.417],
            [0.135, 0.417],
            [0.135, 0.630],
            [0.052, 0.630]
        ],
        red: [
            [0.851, 0.345],
            [0.945, 0.345],
            [0.945, 0.585],
            [0.851, 0.585]
        ]
    },
    superCycle: {
        blue: [
            [0.049, 0.797],
            [0.126, 0.797],
            [0.126, 0.942],
            [0.049, 0.942]
        ],
        red: [
            [0.865, 0.047],
            [0.947, 0.047],
            [0.947, 0.189],
            [0.865, 0.189]
        ]
    },
    depot: {
        blue: [
            [0.051, 0.174],
            [0.117, 0.174],
            [0.117, 0.383],
            [0.051, 0.383]
        ],
        red: [
            [0.895, 0.626],
            [0.946, 0.626],
            [0.946, 0.793],
            [0.895, 0.793]
        ]
    }
};

/**
 * Action codes and display names for 2026 REBUILT game
 * Maps short codes to human-readable action descriptions
 */
const actions2026 = {
    hub1: 'Hub 1',
    hub5: 'Hub 5',
    hub10: 'Hub 10',
    lob1: 'Lob 1',
    lob5: 'Lob 5',
    lob10: 'Lob 10',
    out: 'Outpost',
};

const actionZones2026 = {};

/**
 * Point values for each action in different game periods for 2026 REBUILT
 * Defines scoring system used for calculating team performance
 */
const scoreBreakdown2026 = {
    auto: {
        hub1: 1,
        hub5: 5,
        hub10: 10,
    },
    teleop: {
        hub1: 1,
        hub5: 5,
        hub10: 10
    },
    endgame: {
        hub1: 1,
        hub5: 5,
        hub10: 10
    },
    total: 0,
};

/**
 * Structured score breakdown for 2026 REBUILT game
 * Provides detailed scoring information for autonomous, teleop, and endgame periods
 * @typedef {Readonly<object>} ParsedScoreBreakdown2026
 */
type ParsedScoreBreakdown2026 = Readonly<{
    auto: {
        hub1: number;
        hub5: number;
        hub10: number;
        total: number;
    };
    teleop: {
        hub1: number;
        hub5: number;
        hub10: number;
        total: number;
    };
    endgame: {
        hub1: number;
        hub5: number;
        hub10: number;
        total: number;
    };
    total: number;
}>;

/**
 * Year-specific implementation for 2026 REBUILT game
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
class YearInfo2026 extends YearInfo<
    typeof globalZones2026,
    typeof allianceZones2026,
    keyof typeof actions2026,
    typeof scoreBreakdown2026,
    ParsedScoreBreakdown2026,
    typeof actionZones2026
> {
    parseMatch(match: TBAMatch) {
        return attempt(() => {
            return Match2026Schema.parse(match);
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
     * Parses a robot trace into detailed score breakdown for 2026 REBUILT
     * Calculates points for coral placement, algae processing, and other scoring actions
     * 
     * @param {Trace} trace - Robot movement and action trace data
     * @returns {ParsedScoreBreakdown2026} Detailed scoring breakdown by game period
     * 
     * @example
     * ```typescript
     * const scoreData = year2025.parse(robotTrace);
     * console.log(`Auto points: ${scoreData.auto.total}`);
     * console.log(`Teleop coral: ${scoreData.teleop.cl1 + scoreData.teleop.cl2}`);
     * ```
     */
    parse(
        trace: Trace
    ): ParsedScoreBreakdown2026 {
        // alliance = ['red', 'blue'].includes(alliance) ? alliance : 'red';
        const { auto, teleop, endgame } = this.scoreBreakdown;

        const score = {
            auto: {
                hub1: 0,
                hub5: 0,
                hub10: 0,
                total: 0
            },
            teleop: {
                hub1: 0,
                hub5: 0,
                hub10: 0,
                total: 0
            },
            endgame: {
                hub1: 0,
                hub5: 0,
                hub10: 0,
                total: 0
            },
            total: 0
        };

        for (const p of trace.points) {
            if (p[0] <= 20 * 4) {
                if (p[3] === 'hub1') score.auto.hub1 += auto.hub1;
                if (p[3] === 'hub5') score.auto.hub5 += auto.hub5;
                if (p[3] === 'hub10') score.auto.hub10 += auto.hub10;
            } else if (p[0] <= 140 * 4) {
                if (p[3] === 'hub1') score.teleop.hub1 += teleop.hub1;
                if (p[3] === 'hub5') score.teleop.hub5 += teleop.hub5;
                if (p[3] === 'hub10') score.teleop.hub10 += teleop.hub10;
            } else {
                if (p[3] === 'hub1') score.endgame.hub1 += endgame.hub1;
                if (p[3] === 'hub5') score.endgame.hub5 += endgame.hub5;
                if (p[3] === 'hub10') score.endgame.hub10 += endgame.hub10;
            }
        }

        score.auto.total = Object.values(score.auto).reduce(
            (a, b) => a + b, 0
        );

        score.teleop.total = Object.values(score.teleop).reduce(
            (a, b) => a + b, 0
        );

        score.endgame.total = Object.values(score.endgame).reduce(
            (a, b) => a + b, 0
        );

        score.total =
            score.auto.total + score.teleop.total + score.endgame.total;

        return score;
    }
}

/**
 * Default instance of YearInfo2025 with complete field layout and scoring rules
 * Ready to use for 2026 REBUILT game analysis
 * 
 * @type {YearInfo2026}
 * @example
 * ```typescript
 * import year2025 from './years/2025';
 * 
 * const teamScore = year2025.parse(trace);
 * const alliance = year2025.getAlliance(trace);
 * ```
 */
export default new YearInfo2026(
    globalZones2026,
    allianceZones2026,
    [

    ],
    actions2026,
    scoreBreakdown2026,
    actionZones2026
);