import { Trace } from "../trace";
import { createTypedSummary, SummarySchema } from "../summary";
import { TBAMatch } from "../tba";
import { attempt, Result } from "ts-utils/check";

/**
 * Represents a polygon zone as an array of coordinate points [x, y]
 * @typedef {Readonly<number[][]>} Zone
 */
export type Zone = Readonly<number[][]>;

/**
 * Map of area names to their corresponding zones (global areas not tied to alliances)
 * @typedef {Readonly<{[area: string]: Zone}>} ZoneMap
 */
export type ZoneMap = Readonly<{
    [area: string]: Zone;
}>

/**
 * Alliance-specific zones with separate red and blue areas
 * @typedef {Readonly<{red: Zone; blue: Zone}>} AllianceZone
 */
export type AllianceZone = Readonly<{
    red: Zone;
    blue: Zone;
}>

/**
 * Map of area names to their corresponding alliance zones
 * @typedef {Readonly<{[area: string]: AllianceZone}>} AllianceZoneMap
 */
export type AllianceZoneMap = Readonly<{
    [area: string]: AllianceZone;
}>;

/**
 * Score breakdown structure for different game periods and actions
 * @template Actions - String union of valid action types for the year
 * @typedef {Readonly<{auto: {[key in Actions]?: number}; teleop: {[key in Actions]?: number}; endgame: {[key in Actions]?: number}}>} ScoreBreakdown
 */
export type ScoreBreakdown<Actions extends string> = Readonly<{
    auto: {
        [key in Actions]?: number;
    };
    teleop: {
        [key in Actions]?: number;
    };
    endgame: {
        [key in Actions]?: number;
    };
}>;

/**
 * Template literal type for time-specific actions (e.g., "auto.spk", "teleop.amp")
 * @template Actions - String union of valid action types
 * @typedef {`${'auto' | 'teleop' | 'endgame'}.${Actions}`} TimeAction
 */
export type TimeAction<Actions extends string> = `${'auto' | 'teleop' | 'endgame'}.${Actions}`;

/**
 * Base class for year-specific game information and analysis
 * Provides structure for field layout, scoring rules, and trace analysis
 * 
 * @template GlobalAreas - Type of global field areas (neutral zones)
 * @template AllianceAreas - Type of alliance-specific field areas  
 * @template Actions - Union type of valid actions for this year
 * @template Score - Score breakdown structure for this year
 * @template ParsedScoreBreakdown - Parsed score result type
 * 
 * @example
 * ```typescript
 * const year2024 = new YearInfo2024(
 *   globalZones,
 *   allianceZones, 
 *   fieldBorder,
 *   actionMap,
 *   scoreRules
 * );
 * 
 * const score = year2024.parse(trace);
 * const alliance = year2024.getAlliance(trace);
 * ```
 */
export class YearInfo<
    GlobalAreas extends ZoneMap = ZoneMap, 
    AllianceAreas extends AllianceZoneMap = AllianceZoneMap, 
    Actions extends string = string,
    Score extends ScoreBreakdown<Actions> = ScoreBreakdown<Actions>,
    ParsedScoreBreakdown = unknown,
    ActionZones extends AllianceZoneMap = AllianceZoneMap,
> {
    /**
     * Creates a new YearInfo instance
     * @param {GlobalAreas} globalAreas - Field areas not tied to specific alliances
     * @param {AllianceAreas} allianceAreas - Alliance-specific field areas (red/blue)
     * @param {Zone} border - Field boundary polygon
     * @param {Record<Actions, string>} actions - Map of action codes to display names
     * @param {Score} scoreBreakdown - Point values for each action in each game period
     */
    constructor(
        public readonly globalAreas: GlobalAreas,
        public readonly allianceAreas: AllianceAreas,
        public readonly border: Zone,
        public readonly actions: Record<Actions, string>,
        public readonly scoreBreakdown: Score,
        public readonly actionZones: ActionZones,
    ) {
    }

    /**
     * Parse a match object into a structured format for this year
     * Override in subclasses to implement year-specific parsing logic
     * @param {TBAMatch} _match - The match to parse as a year
     * @returns {Result<TBAMatch>} The parsed match object
     */
    parseMatch(_match: TBAMatch): Result<unknown> {
        return attempt(() => {
            throw new Error('parseMatch not implemented for this year');
        });
    }

    /**
     * Calculate a team's contribution score for alliance prediction
     * Override in subclasses to implement year-specific logic
     * 
     * @param {Trace} _trace - Robot trace data to analyze
     * @returns {number} Contribution score (higher = more likely to be picked)
     */
    getContribution(_trace: Trace): number {
        console.warn('getContribution not implemented for this year');
        return 0;
    }

    /**
     * Parse a trace into a structured score breakdown
     * Must be implemented in subclasses for year-specific scoring
     * 
     * @param {Trace} _trace - Robot trace data to parse
     * @returns {ParsedScoreBreakdown} Detailed score breakdown by game period
     * @throws {Error} If not implemented in subclass
     */
    parse(
        _trace: Trace
    ): ParsedScoreBreakdown {
        throw new Error('parse not implemented for this year');
    }

    /**
     * Determine which alliance a robot belongs to based on starting position
     * Override in subclasses to implement year-specific alliance detection
     * 
     * @param {Trace} _trace - Robot trace data to analyze
     * @returns {'red' | 'blue' | 'unknown'} Alliance color or unknown if cannot determine
     */
    getAlliance(_trace: Trace): 'red' | 'blue' | 'unknown' {
        console.warn('getAlliance not implemented for this year');
        return 'unknown';
    }

    /**
     * Create a typed summary analyzer for this year's data
     * Provides type-safe analysis of team performance metrics
     * 
     * @template S - Summary schema type
     * @param {S} schema - Analysis schema defining groups and metrics
     * @returns {TypedSummary<ParsedScoreBreakdown, S>} Configured summary analyzer
     * 
     * @example
     * ```typescript
     * const analyzer = year2025.summary({
     *   "Scoring": {
     *     "Auto Average": Aggregators.average,
     *     "Peak Performance": Aggregators.max
     *   }
     * });
     * ```
     */
    summary<S extends SummarySchema<ParsedScoreBreakdown>>(schema: S) {
        return createTypedSummary<ParsedScoreBreakdown, S>(
            (trace) => this.parse(trace),
            schema
        );
    }
}