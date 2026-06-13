/**
 * @fileoverview
 * Utilities for computing per-team summaries from traces and TBA matches.
 *
 * @example
 * const summary = new Summary(parseTrace, {
 *   auto: {
 *     totalAuto: ({ scoring }) => scoring.map(s => s.autoPoints),
 *   },
 *   teleop: {
 *     totalTeleop: ({ scoring }) => scoring.map(s => s.teleopPoints),
 *   },
 * });
 *
 * const computed = summary.computeAll(teamTraces, matches);
 * const ranking = computed.teamRanking(1678, "average");
 */
import { attempt, Result } from "ts-utils/check";
import { Trace } from "./trace";
import { z } from 'zod';
import { TBAMatch, teamsFromMatch } from "./tba";


/**
 * Describes summary groups and items. Each item returns an array of numeric values
 * computed for a team from matches, traces, and parsed scoring data.
 *
 * @example
 * const schema = {
 *   auto: {
 *     total: ({ scoring }) => scoring.map(s => s.autoPoints),
 *   },
 * } as const satisfies SummarySchema<MyScore>;
 */
export interface SummarySchema<T> {
    [groupName: string]: {
        [itemName: string]: (data: {
            matches: TBAMatch[];
            traces: Trace[];
            scoring: T[];
            team: number;
        }) => number[];
    }
}

/**
 * A single data point for a team, tied to a group and item label.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 */
class TeamPoint<T, S extends SummarySchema<T>> {
    constructor(
        public readonly team: number,
        public readonly value: number,
        public readonly group: GroupNames<T, S>,
        public readonly item: { [K in keyof S]: Extract<string, keyof S[K]> }[keyof S]
    ) { }
}

/**
 * Group name keys from the schema.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 */
type GroupNames<T, S extends SummarySchema<T>> = keyof S;
/**
 * Item name keys for a group in the schema.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 * @template G Group name.
 */
type ItemNames<T, S extends SummarySchema<T>, G extends GroupNames<T, S>> = Extract<string, keyof S[G]>;


/**
 * Numeric summary values per group and item for a team.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 */
type TeamComputedSummaryNumber<T, S extends SummarySchema<T>> = {
    [G in GroupNames<T, S>]: {
        [I in ItemNames<T, S, G>]: number;
    }
}

/**
 * Point containers per group and item for a team.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 */
type TeamComputedSummaryType<T, S extends SummarySchema<T>> = {
    [G in GroupNames<T, S>]: {
        [I in ItemNames<T, S, G>]: Point;
    }
};

/**
 * Supported point aggregate types.
 */
type PointType = 'average' | 'median' | 'min' | 'max' | 'stddev' | 'mode' | 'coefficientOfVariation';

/**
 * Holds a series of values and computes summary statistics.
 *
 * @example
 * const point = new Point([1, 2, 3]);
 * point.average(); // 2
 */
class Point {
    constructor(public readonly values: number[]) {}

    /**
     * Arithmetic mean of values.
     *
     * @returns Average value, or 0 if no values exist.
     */
    average(): number {
        if (this.values.length === 0) return 0;
        return this.values.reduce((a, b) => a + b, 0) / this.values.length;
    }

    /**
     * Median value (middle or mean of two middle values).
     *
     * @returns Median value, or 0 if no values exist.
     */
    median(): number {
        if (this.values.length === 0) return 0;
        const sorted = [...this.values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (sorted[mid - 1] + sorted[mid]) / 2;
        } else {
            return sorted[mid];
        }
    }

    /**
     * Minimum value.
     *
     * @returns Smallest value, or 0 if no values exist.
     */
    min(): number {
        if (this.values.length === 0) return 0;
        return Math.min(...this.values);
    }

    /**
     * Maximum value.
     *
     * @returns Largest value, or 0 if no values exist.
     */
    max(): number {
        if (this.values.length === 0) return 0;
        return Math.max(...this.values);
    }

    /**
     * Population standard deviation.
     *
     * @returns Standard deviation, or 0 if no values exist.
     */
    stddev(): number {
        if (this.values.length === 0) return 0;
        const mean = this.average();
        const variance = this.values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / this.values.length;
        return Math.sqrt(variance);
    }

    /**
     * Most frequent value (first in case of ties).
     *
     * @returns Mode value, or 0 if no values exist.
     */
    mode(): number {
        if (this.values.length === 0) return 0;
        const frequency: { [value: number]: number } = {};
        let maxFreq = 0;
        let modeValue = this.values[0];

        for (const value of this.values) {
            frequency[value] = (frequency[value] || 0) + 1;
            if (frequency[value] > maxFreq) {
                maxFreq = frequency[value];
                modeValue = value;
            }
        }

        return modeValue;
    }

    /**
     * Standard deviation divided by mean.
     *
     * @returns Coefficient of variation, or 0 if mean is 0 or no values exist.
     */
    coefficientOfVariation(): number {
        const mean = this.average();
        if (mean === 0) return 0;
        return this.stddev() / mean;
    }

    /**
     * Returns a point containing only the last N values.
     *
     * @param num Number of values to keep from the end.
     * @returns New point with the filtered values.
     */
    filterLast(num: number): Point {
        return new Point(this.values.slice(0 - num));
    }
}

/**
 * Summary data for a single team.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 */
class TeamComputedSummary<T, S extends SummarySchema<T>> {
    constructor(public readonly team: number, public readonly data: TeamComputedSummaryType<T, S>, public readonly parent: Summary<T, S>) {}
}

/**
 * Summary data for all teams, keyed by team number as string.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 */
type ComputedSummaryType<T, S extends SummarySchema<T>> = {
    [team: string]: TeamComputedSummaryType<T, S>;
}

/**
 * Numeric summary values for all teams, keyed by team number as string.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 */
type ComputedSummaryNumber<T, S extends SummarySchema<T>> = {
    [team: string]: TeamComputedSummaryNumber<T, S>;
}

/**
 * Combined type including both schema-based and extra summary data.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 */
type CombinedSummaryType<T, S extends SummarySchema<T>> = {
    schema: ComputedSummaryType<T, S>;
    // extras: Extra;
};

/**
 * Computes summaries from traces and matches based on a schema.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 *
 * @example
 * const summary = new Summary(parseTrace, schema);
 * const computed = summary.computeAll(teamTraces, matches);
 */
export class Summary<T, S extends SummarySchema<T>> {
    constructor(public readonly traceParser: (trace: Trace) => T, public readonly schema: S) {}

    /**
     * Computes summary data for a single team.
     *
     * @param team Team number.
     * @param matches Matches that include the team.
     * @param traces Trace rows for the team.
     * @returns Computed summary for the team.
     */
    computeTeam(team: number, matches: TBAMatch[], traces: Trace[]): TeamComputedSummary<T, S> {
        const results = traces.map(trace => this.traceParser(trace));
        const summary = {} as TeamComputedSummaryType<T, S>;

        for (const groupName in this.schema) {
            const group = new Group<T, S, typeof groupName>(groupName, this.schema[groupName]);
            summary[groupName] = group.compute(team, results, traces, matches);
        }

        return new TeamComputedSummary(team, summary, this);
    }

    /**
     * Computes summary data for all teams in a dataset.
     *
     * @param data Mapping of team number string to trace rows.
     * @param matches All matches for the event.
     * @returns Aggregated summary for all teams in the dataset.
     */
    computeAll(data: { [team: string]: Trace[] }, matches: TBAMatch[]) {
        const result: ComputedSummaryType<T, S> = {};

        for (const team in data) {
            const m = matches.filter(match => teamsFromMatch(match).includes(parseInt(team)));
            result[team] = this.computeTeam(parseInt(team), m, data[team]).data;
        }

        return new ComputedSummary<T, S>({ schema: result }, this);
    }

    /**
     * Parses and validates a serialized summary.
     *
     * @param serialized JSON string created by `serialize()`.
     * @returns Result containing the computed summary or a validation error.
     */
    deserialize(serialized: string): Result<ComputedSummary<T, S>> {
        return attempt(() => {
            const parsed = z.object({
                schema: z.record(z.record(z.record(z.array(z.number()).transform(arr => new Point(arr))))),
                // extras: z.record(z.record(z.record(z.number()))),
            }).parse(JSON.parse(serialized)) as CombinedSummaryType<T, S>;

            // ensure all groups and items match schema, if there are any extras it's still valid.
            for (const team in parsed.schema) {
                for (const group in this.schema) {
                    if (!(group in parsed.schema[team])) {
                        throw new Error(`Missing group '${group}' in team '${team}'`);
                    } else {
                        for (const item in this.schema[group]) {
                            if (!(item in parsed.schema[team][group])) {
                                throw new Error(`Missing item '${item}' in group '${group}' for team '${team}'`);
                            }
                        }
                    }
                }
            }

            // extras cannot be validated since they are freeform

            // this.extras = parsed.extras;

            return new ComputedSummary<T, S>(parsed, this);
        });
    }
};

/**
 * Evaluates schema items for a specific group.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 * @template G Group name.
 */
class Group<T, S extends SummarySchema<T>, G extends GroupNames<T, S>> {
    constructor(
        public readonly name: G,
        public readonly items: S[G],
    ) {}

    /**
     * Computes all items in the group for a team.
     *
     * @param team Team number.
     * @param data Parsed scoring rows for the team.
     * @param traces Trace rows for the team.
     * @param matches Matches that include the team.
     * @returns Group data with points for each item.
     */
    compute(team: number, data: T[], traces: Trace[], matches: TBAMatch[]): TeamComputedSummaryType<T, S>[G] {
        const result = {} as {
            [I in ItemNames<T, S, G>]: Point;
        }

        for (const itemName in this.items) {
            const fn = this.items[itemName];
            (result as any)[itemName] = new Point(fn({
                matches,
                traces,
                scoring: data,
                team,
            }));
        }

        return result;
    }
}



/**
 * Aggregated summary for multiple teams.
 *
 * @template T Parsed scoring type.
 * @template S Summary schema.
 */
export class ComputedSummary<T, S extends SummarySchema<T>> {
    readonly schemaData: ComputedSummaryType<T, S>;
    // readonly extraData: Extra;
    constructor(data: CombinedSummaryType<T, S>, public readonly parent: Summary<T, S>) {
        this.schemaData = data.schema;
    }

    /**
     * Access to the original schema.
     *
     * @returns Schema used to compute this summary.
     */
    get parser(): S {
        return this.parent.schema;
    }

    /**
     * Serializes summary data to JSON.
     *
     * @returns JSON string suitable for `deserialize()`.
     */
    serialize(): string {
        const data: {
            [team: string]: {
                [group: string]: {
                    [item: string]: number[];
                }
            }
        } = {}

        for (const team in this.schemaData) {
            data[team] = {};
            for (const group in this.schemaData[team]) {
                data[team][group] = {};
                for (const item in this.schemaData[team][group]) {
                    data[team][group][item] = this.schemaData[team][group][item].values;
                }
            }
        }

        return JSON.stringify({
            schema: data,
            // extras: this.extraData,
        });
    }

    /**
     * Converts a team's points into numeric aggregates.
     *
     * @param team Team number.
     * @param type Aggregate to compute for each point.
     * @returns Numeric aggregates for each group and item.
     */
    teamRanking(team: number, type: PointType): TeamComputedSummaryNumber<T, S> {
        const teamData = this.schemaData[team];
        const ranking: TeamComputedSummaryNumber<T, S> = {} as TeamComputedSummaryNumber<T, S>;

        for (const groupName in teamData) {
            const group = teamData[groupName];
            (ranking as any)[groupName] = {} as TeamComputedSummaryNumber<T, S>[GroupNames<T, S>];
            for (const itemName in group) {
                const point = group[itemName];
                (ranking as any)[groupName][itemName] = point[type]();
            }
        }
        return ranking;
    }

    allTeamsRanked(type: PointType): { [team: string]: TeamComputedSummaryNumber<T, S> } {
        const allRanked: { [team: string]: TeamComputedSummaryNumber<T, S> } = {};
        for (const team in this.schemaData) {
            allRanked[team] = this.teamRanking(parseInt(team), type);
        }
        return allRanked;
    }

    /**
     * Returns points sorted by their numeric value.
     *
     * @param group Group name to select.
     * @param item Item name within the group.
     * @param ascending Sort order, true for ascending.
     * @returns Sorted list of team points.
     *
     * @example
     * const top = computed.sortedBy("auto", "total", false).slice(0, 10);
     */
    sortedBy<G extends GroupNames<T, S>, I extends ItemNames<T, S, G>>(group: G, item: I, type: PointType, ascending: boolean = true): TeamPoint<T, S>[] {
        const points: TeamPoint<T, S>[] = [];

        for (const team in this.schemaData) {
            const teamGroup = this.schemaData[team][group];
            if (teamGroup) {
                const point = teamGroup[item];
                if (point) {
                    points.push(new TeamPoint(parseInt(team), point[type](), group, item as any));
                }
            }
        }

        return points.sort((a, b) => ascending ? a.value - b.value : b.value - a.value);
    }

    allSorted(type: PointType, ascending: boolean = true): { [G in GroupNames<T, S>]: { [I in ItemNames<T, S, G>]: TeamPoint<T, S>[] } } {
        const result: { [G in GroupNames<T, S>]: { [I in ItemNames<T, S, G>]: TeamPoint<T, S>[] } } = {} as any;

        for (const group in this.parent.schema) {
            (result as any)[group] = {} as { [I in ItemNames<T, S, typeof group>]: TeamPoint<T, S>[] };
            for (const item in this.parent.schema[group]) {
                (result as any)[group][item] = this.sortedBy(group as any, item as any, type, ascending);
            }
        }
        return result;
    }
}