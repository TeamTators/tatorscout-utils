import { Point2D } from "math/point";
import { type AllianceZoneMap, YearInfo, type Zone, type ZoneMap } from ".";
import { Trace } from "../trace";
import { isInside } from "math/polygon";
import { Aggregators, createTypedSummary, SummarySchema } from "../summary";
import { $Math } from "ts-utils/math";
import { TBAMatch } from "../tba";
import { attempt } from "ts-utils/check";
import { Match2025Schema } from "../tba";

/**
 * Global field zones for 2026 REBUILT game
 * These are neutral areas accessible to both alliances
 */
const globalZones2026 = {
    neutral: [],
};

/**
 * Alliance-specific zones for 2026 REBUILT game
 * Includes autonomous zones, scoring areas, and alliance-specific regions
 */
const allianceZones2026 = {
    zones: {
        blue: [
        ],
        red: [
        ]
    },
    bump: {
        blue: [
        ],
        red: [
        ]
    },
    trenchLeft: {
        red: [
        ],
        blue: [
        ]
    },
    trenchRight: {
        red: [
        ],
        blue: [
        ]
    },
    climb: {
        blue: [
        ],
        red: [
        ]
    },
    superCycle: {
        blue: [
        ],
        red: [
        ]
    },
    depot: {
        blue: [
        ],
        red: [
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
        hub10: 10
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
        total: number;
    };
    teleop: {
        total: number;
    };
    endgame: {
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
            return Match2025Schema.parse(match);
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
     * Parses a robot trace into detailed score breakdown for 2025 REEFSCAPE
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
                total: 0,
            },
            teleop: {
                total: 0,
            },
            endgame: {
                total: 0,
            },
            total: 0
        };

        for (const p of trace.points) {
            if (p[0] <= 20 * 4) {
                // auto
            } else {
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