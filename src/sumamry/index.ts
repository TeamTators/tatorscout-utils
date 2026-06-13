/**
 * @fileoverview
 * Schema-driven team summary and ranking utilities.
 *
 * This module computes per-team summary points from trace rows and offers
 * ranking helpers for group/item metrics.
 *
 * @example
 * const summary = new Summary(parseTrace, {
 *   auto: {
 *     notes: ({ scoring }) => scoring.map(s => s.autoNotes),
 *   },
 * });
 *
 * const computed = summary.computeAll(teamTraces, matches);
 *
 * const rankedTeams = computed.rank("auto", "notes");
 * const teamRank = computed.team(1678).rank("auto", "notes", "median");
 */
import { attempt, Result } from "ts-utils/check";
import { Trace } from "../trace";
import { z } from 'zod';
import { TBAMatch } from "../tba";


/**
 * Defines the summary computation schema.
 *
 * Each item function receives team-specific data and returns a list of
 * numeric values that become a Point.
 *
 * @template T Parsed scoring row shape.
 */
export interface SummarySchema<T> {
    [itemName: string]: (data: {
        matches: TBAMatch[];
        traces: Trace[];
        scoring: T[];
        team: number;
    }) => number[];
}

type ItemNames<T, S extends SummarySchema<T>> = keyof S;


type TeamComputedSummaryType<T, S extends SummarySchema<T>> = {
    [I in ItemNames<T, S>]: Point;
};

class Point {
    public readonly values: readonly number[];

    /**
     * @param {number[]} values Raw numeric values for one team and one item.
     */
    constructor(values: number[]) {
        this.values = [...values];
    }

    /**
     * @returns {number} Arithmetic mean, or 0 when no values exist.
     */
    average(): number {
        if (this.values.length === 0) return 0;
        return this.values.reduce((a, b) => a + b, 0) / this.values.length;
    }

    /**
     * @returns {number} Median value, or 0 when no values exist.
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
     * @returns {number} Minimum value, or 0 when no values exist.
     */
    min(): number {
        if (this.values.length === 0) return 0;
        return Math.min(...this.values);
    }

    /**
     * @returns {number} Maximum value, or 0 when no values exist.
     */
    max(): number {
        if (this.values.length === 0) return 0;
        return Math.max(...this.values);
    }

    /**
     * Computes population standard deviation.
     *
     * @returns {number} Population standard deviation, or 0 when empty.
     */
    stddev(): number {
        if (this.values.length === 0) return 0;
        const mean = this.average();
        const variance = this.values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / this.values.length;
        return Math.sqrt(variance);
    }

    /**
     * Returns the most frequent value.
     *
     * In case of ties, the first value that reached max frequency is used.
     *
     * @returns {number} Mode, or 0 when no values exist.
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
     * Computes coefficient of variation.
     *
     * @returns {number} stddev / mean, or 0 if mean is 0.
     */
    coefficientOfVariation(): number {
        const mean = this.average();
        if (mean === 0) return 0;
        return this.stddev() / mean;
    }
}


type ComputedSummaryType<T, S extends SummarySchema<T>> = {
    [team: string]: TeamComputedSummaryType<T, S>;
}

type RankedTeam = {
    team: number;
    score: number;
    rank: number;
};

/**
 * Supported aggregate metric used by ranking methods.
 */
export type RankMetric =
    | "average"
    | "median"
    | "min"
    | "max"
    | "stddev"
    | "mode"
    | "coefficientOfVariation";

/** Combined type including both schema-based and extra summary data */
type CombinedSummaryType<T, S extends SummarySchema<T>> = {
    schema: ComputedSummaryType<T, S>;
    // extras: Extra;
};

export class Summary<T, S extends SummarySchema<T>> {
    /**
     * @param {(trace: Trace) => T} traceParser Converts a Trace into parsed scoring data.
     * @param {S} schema Group/item schema used for summary computation.
     */
    constructor(public readonly traceParser: (trace: Trace) => T, public readonly schema: S) {}

    /**
     * Computes summary data for a single team.
     *
     * @param {number} team Team number.
     * @param {TBAMatch[]} matches Match list available to schema item functions.
     * @param {Trace[]} traces Trace rows for the team.
     * @returns {TeamComputedSummaryType<T, S>} Computed points by group and item.
     */
    computeTeam(team: number, matches: TBAMatch[], traces: Trace[]): TeamComputedSummaryType<T, S> {
        const results = traces.map(trace => this.traceParser(trace));
        const summary = {} as TeamComputedSummaryType<T, S>;

        for (const itemName in this.schema) {
            const fn = this.schema[itemName];
            summary[itemName] = new Point(fn({
                matches,
                traces,
                scoring: results,
                team,
            }));
        }

        return summary;
    }

    /**
     * Computes summaries for all teams in the provided dataset.
     *
     * @param {{ [team: string]: Trace[] }} data Team-number keyed trace rows.
     * @param {TBAMatch[]} matches Match list available to schema item functions.
     * @returns {ComputedSummary<T, S>} Computed summary wrapper with ranking helpers.
     * @throws {Error} When a team key is not numeric.
     */
    computeAll(data: { [team: string]: Trace[] }, matches: TBAMatch[]) {
        const result: ComputedSummaryType<T, S> = {};

        for (const team in data) {
            const teamNumber = Number(team);
            if (!Number.isFinite(teamNumber)) {
                throw new Error(`Invalid team key '${team}'. Team keys must be numeric.`);
            }

            result[team] = this.computeTeam(teamNumber, matches, data[team]);
        }

        return new ComputedSummary<T, S>({ schema: result }, this);
    }

    /**
     * Deserializes a previously serialized summary payload.
     *
     * Validates structure and checks that required schema groups/items exist
     * for each team.
     *
     * @param {string} serialized JSON payload.
     * @returns {Result<ComputedSummary<T, S>>} Computed summary wrapped in Result.
     */
    deserialize(serialized: string): Result<ComputedSummary<T, S>> {
        return attempt(() => {
            const parsed = z.object({
                schema: z.record(z.record(z.array(z.number()).transform(arr => new Point(arr)))),
                // extras: z.record(z.record(z.record(z.number()))),
            }).parse(JSON.parse(serialized)) as CombinedSummaryType<T, S>;

            // ensure all items match schema, if there are any extras it's still valid.
            for (const team in parsed.schema) {
                for (const item in this.schema) {
                    if (!(item in parsed.schema[team])) {
                        throw new Error(`Missing item '${item}' for team '${team}'`);
                    }
                }
            }

            // extras cannot be validated since they are freeform

            // this.extras = parsed.extras;

            return new ComputedSummary<T, S>(parsed, this);
        });
    }
}

export class ComputedSummary<T, S extends SummarySchema<T>> {
    readonly schemaData: ComputedSummaryType<T, S>;
    // readonly extraData: Extra;

    /**
     * @param {CombinedSummaryType<T, S>} data Computed schema payload.
     * @param {Summary<T, S>} parent Parent Summary instance.
     */
    constructor(data: CombinedSummaryType<T, S>, public readonly parent: Summary<T, S>) {
        this.schemaData = data.schema;
    }

    /**
     * Accessor for the schema used to compute this summary.
     *
     * @returns {S} Schema object.
     */
    get parser(): S {
        return this.parent.schema;
    }

    /**
     * Returns a team-scoped helper API.
     *
     * @param {number | string} team Team number.
     * @returns {ComputedTeamSummary<T, S>} Team wrapper for rank lookups.
     * @throws {Error} When the team is missing in this summary.
     *
     * @example
     * const teamApi = computed.team(1678);
     * const rank = teamApi.rank("auto", "notes", "average");
     */
    team(team: number | string) {
        const teamKey = String(team);
        if (!(teamKey in this.schemaData)) {
            throw new Error(`Team '${teamKey}' is not present in this summary.`);
        }

        return new ComputedTeamSummary<T, S>(teamKey, this);
    }

    private scorePoint(point: Point, metric: RankMetric): number {
        switch (metric) {
            case "average":
                return point.average();
            case "median":
                return point.median();
            case "min":
                return point.min();
            case "max":
                return point.max();
            case "stddev":
                return point.stddev();
            case "mode":
                return point.mode();
            case "coefficientOfVariation":
                return point.coefficientOfVariation();
            default:
                throw new Error(`Unsupported ranking metric '${metric}'.`);
        }
    }

    private getRankedTeams<I extends ItemNames<T, S>>(item: I, metric: RankMetric): RankedTeam[] {
        if (!(item in this.parent.schema)) {
            throw new Error(`Unknown item '${String(item)}'.`);
        }

        const scoredTeams = Object.entries(this.schemaData).map(([team, teamData]) => {
            const point = teamData[item];
            return {
                team,
                score: this.scorePoint(point, metric),
            };
        });

        scoredTeams.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return Number(a.team) - Number(b.team);
        });

        let currentRank = 0;
        let previousScore: number | null = null;

        return scoredTeams.map((entry, index) => {
            if (previousScore === null || entry.score !== previousScore) {
                currentRank = index + 1;
                previousScore = entry.score;
            }

            return {
                team: Number(entry.team),
                score: entry.score,
                rank: currentRank,
            };
        });
    }

    /**
     * Returns team numbers ordered by descending score for one item.
     *
     * @template I Item key.
     * @param {I} item Item name.
     * @param {RankMetric} [metric="average"] Metric used to score each team.
     * @returns {number[]} Team numbers from highest to lowest metric value.
     *
     * @example
     * const ordered = computed.rank("notes");
     * const byMedian = computed.rank("notes", "median");
     */
    rank<I extends ItemNames<T, S>>(item: I, metric: RankMetric = "average"): number[] {
        return this.getRankedTeams(item, metric).map(entry => entry.team);
    }

    /**
     * Returns the rank for one team for one item.
     *
     * Ranking uses competition ranking semantics: tied teams share rank and
     * later ranks are skipped.
     *
     * @template I Item key.
     * @param {number | string} team Team number to query.
     * @param {I} item Item name.
     * @param {RankMetric} [metric="average"] Metric used to score each team.
     * @returns {number} 1-based rank for the team.
     * @throws {Error} When team id is invalid or team is not present.
     *
     * @example
     * const rank = computed.teamRank(1678, "notes", "max");
     */
    teamRank<I extends ItemNames<T, S>>(team: number | string, item: I, metric: RankMetric = "average"): number {
        const teamNumber = Number(team);
        if (!Number.isFinite(teamNumber)) {
            throw new Error(`Invalid team '${String(team)}'. Team must be numeric.`);
        }

        const ranked = this.getRankedTeams(item, metric);
        const found = ranked.find(entry => entry.team === teamNumber);
        if (!found) {
            throw new Error(`Team '${teamNumber}' is not present in this summary.`);
        }

        return found.rank;
    }

    /**
     * Pivots data from team-first structure to item-first structure.
     *
     * Output shape: pivoted[item][team] = Point.
     *
     * @returns {{ [item in ItemNames<T, S>]: { [team: string]: Point } }}
     * Pivoted summary data.
     */
    pivot() {
        type PivotedSummaryType = {
            [item in ItemNames<T, S>]: {
                [team: string]: Point;
            }
        };

        const pivoted = {} as PivotedSummaryType;

        for (const team in this.schemaData) {
            const teamData = this.schemaData[team];

            for (const item in teamData) {
                if (!(item in pivoted)) {
                    pivoted[item] = {};
                }

                const pivotedItem = pivoted[item] as { [team: string]: Point };
                pivotedItem[team] = teamData[item];
            }
        }

        return pivoted;
    }
}

class ComputedTeamSummary<T, S extends SummarySchema<T>> {
    /**
     * @param {string} team Team id as string.
     * @param {ComputedSummary<T, S>} parent Parent computed summary.
     */
    constructor(
        public readonly team: string,
        private readonly parent: ComputedSummary<T, S>,
    ) {}

    /**
     * Returns this team's rank for one item.
     *
     * @template I Item key.
     * @param {I} item Item name.
     * @param {RankMetric} [metric="average"] Metric used to score each team.
     * @returns {number} 1-based rank.
     *
     * @example
     * const rank = computed.team(1678).rank("notes", "median");
     */
    rank<I extends ItemNames<T, S>>(item: I, metric: RankMetric = "average"): number {
        return this.parent.teamRank(this.team, item, metric);
    }
}