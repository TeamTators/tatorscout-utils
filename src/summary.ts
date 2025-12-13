import { attempt, Result } from "ts-utils/check";
import { Trace } from "./trace";
import { z } from 'zod';
import { TBAMatch, teamsFromMatch } from "./tba";

/**
 * Collection of commonly used statistical aggregation functions
 * Provides ready-to-use functions for analyzing team performance data
 * 
 * @example
 * ```typescript
 * import { Aggregators } from './summary';
 * 
 * const scores = [25, 30, 28, 32, 26];
 * console.log(`Average: ${Aggregators.average(scores)}`);
 * console.log(`Consistency: ${1 / Aggregators.standardDeviation(scores)}`);
 * ```
 */
export const Aggregators = {
    /** Calculates the sum of all values */
    sum: (data: number[]) => data.reduce((a, b) => a + b, 0),
    /** Calculates the arithmetic mean, returns 0 for empty arrays */
    average: (data: number[]) => data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0,
    /** Finds the maximum value, returns 0 for empty arrays */
    max: (data: number[]) => data.length > 0 ? Math.max(...data) : 0,
    /** Finds the minimum value, returns 0 for empty arrays */
    min: (data: number[]) => data.length > 0 ? Math.min(...data) : 0,
    /** Calculates the median (middle value), returns 0 for empty arrays */
    median: (data: number[]) => {
        if (data.length === 0) return 0;
        const sorted = [...data].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 
            ? (sorted[mid - 1] + sorted[mid]) / 2 
            : sorted[mid];
    },
    /** Returns the number of data points */
    count: (data: number[]) => data.length,
    /** Calculates standard deviation (measure of spread) */
    standardDeviation: (data: number[]) => {
        if (data.length === 0) return 0;
        const avg = Aggregators.average(data);
        const variance = data.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / data.length;
        return Math.sqrt(variance);
    },
    /** Calculates coefficient of variation (relative variability) */
    coefficientOfVarience: (data: number[]) => {
        const avg = Aggregators.average(data);
        if (avg === 0) return 0;
        const stdDev = Aggregators.standardDeviation(data);
        return stdDev / avg;
    }
} as const;

/**
 * Schema definition for type-safe summary analysis
 * Defines the structure of analysis groups and their metrics
 * 
 * @interface SummarySchema
 * @example
 * ```typescript
 * const robotAnalysisSchema = {
 *   "Scoring": {
 *     "Auto Average": Aggregators.average,
 *     "Peak Performance": Aggregators.max,
 *     "Consistency": (data: number[]) => 1 / Aggregators.standardDeviation(data)
 *   },
 *   "Mobility": {
 *     "Average Speed": Aggregators.average,
 *     "Distance Traveled": Aggregators.sum
 *   }
 * } as const;
 * ```
 */
export interface SummarySchema<T> {
    [groupName: string]: {
        [itemName: string]: (data: T[], trace: Trace[], matches: TBAMatch[]) => number;
    };
}

/** Extract group names from schema for type safety */
type GroupNames<T, S extends SummarySchema<T>> = Extract<keyof S, string>;

/** Extract item names for a specific group from schema */
type ItemNames<T, S extends SummarySchema<T>, G extends GroupNames<T, S>> = Extract<keyof S[G], string>;

/** Generate the computed summary result type from schema definition */
type ComputedSummaryType<T, S extends SummarySchema<T>> = {
    [team: string]: {
        [G in GroupNames<T, S>]: {
            [I in ItemNames<T, S, G>]: number;
        };
    };
};

/** Combined type including both schema-based and extra summary data */
type CombinedSummaryType<T, S extends SummarySchema<T>> = {
    schema: ComputedSummaryType<T, S>;
    extras: Extra;
};

/** Type for storing extra non-typesafe summary items */
type Extra = {
    [team: string]: {
        [group: string]: {
            [item: string]: number;
        };
    };
};

/**
 * Type-safe summary analysis class for team performance data
 * Automatically processes data according to schema definition with compile-time type checking
 * 
 * @template T - Type of data extracted from each trace
 * @template S - Schema type defining analysis structure
 * 
 * @example
 * ```typescript
 * const schema = {
 *   "Scoring": {
 *     "Average": Aggregators.average,
 *     "Peak": Aggregators.max
 *   }
 * } as const;
 * 
 * const summary = new Summary(
 *   (trace) => trace.filterAction('spk').length, // Extract speaker shots
 *   schema
 * );
 * 
 * const results = summary.computeAll(teamTraces);
 * ```
 */
export class Summary<T, S extends SummarySchema<T>> {
    private readonly schema: S;

    /**
     * Creates a new Summary instance with data extraction function and analysis schema
     * 
     * @param {(data: Trace) => T} fn - Function to extract relevant data from each trace
     * @param {S} schema - Analysis schema defining groups and metrics
     */
    constructor(
        public readonly fn: (data: Trace) => T,
        schema: S
    ) {
        this.schema = schema;
    }

    /**
     * Computes summary metrics for a single team's traces
     * Processes all traces through extraction function and applies schema metrics
     * 
     * @param {Trace[]} traces - Array of trace data for one team
     * @returns {Object} Computed metrics organized by groups and items from schema
     * 
     * @example
     * ```typescript
     * const teamTraces = [trace1, trace2, trace3];
     * const metrics = summary.computeSingle(teamTraces);
     * 
     * console.log(`Auto average: ${metrics.Scoring.Average}`);
     * console.log(`Peak performance: ${metrics.Scoring.Peak}`);
     * ```
     */
    computeSingle(traces: Trace[], matches: TBAMatch[]): {
        [G in GroupNames<T, S>]: {
            [I in ItemNames<T, S, G>]: number;
        };
    } {
        const results = traces.map(t => this.fn(t));
        const summary = {} as any;

        // Process all groups from schema automatically
        for (const groupName in this.schema) {
            const group = new Group<T, S, typeof groupName>(groupName, this.schema[groupName]);
            summary[groupName] = group.compute(results, traces, matches);
        }

        return summary;
    }

    /**
     * Computes summary metrics for all teams
     * Processes each team's traces and returns comprehensive analysis results
     * 
     * @param {Object} data - Map of team names to their trace arrays
     * @returns {ComputedSummary<S>} Complete summary with methods for analysis and visualization
     * 
     * @example
     * ```typescript
     * const teamData = {
     *   "1234": [trace1, trace2],
     *   "5678": [trace3, trace4]
     * };
     * 
     * const results = summary.computeAll(teamData);
     * const graphData = results.getGraphData("Scoring", "Average");
     * const rankings = results.getAllRankings();
     * ```
     */
    computeAll(data: { [team: string]: Trace[] }, matches: TBAMatch[]): ComputedSummary<T, S> {
        const summary = {} as ComputedSummaryType<T, S>;

        for (const team in data) {
            const teamMatches = matches.filter(m => teamsFromMatch(m).includes(Number(team)));
            summary[team] = this.computeSingle(data[team], teamMatches);
        }

        return new ComputedSummary({ schema: summary, extras: this.extras });
    }

    /**
     * Adds extra non-typesafe summary data for a specific team
     * Allows adding custom metrics that don't go through the standard fn() extraction
     * 
     * @param {string} group - Group name for the extra metric
     * @param {string} item - Item name for the extra metric
     * @param {string} team - Team identifier
     * @param {number} value - Metric value
     * 
     * @example
     * ```typescript
     * const summary = new Summary(extractFn, schema);
     * 
     * // Add custom scouting notes or external data
     * summary.addExtra("Manual Scouting", "Drive Rating", "1234", 8.5);
     * summary.addExtra("Manual Scouting", "Defense Rating", "1234", 7.2);
     * summary.addExtra("External Data", "EPA", "5678", 45.3);
     * 
     * const results = summary.computeAll(teamData);
     * // Extra data will be included in the computed results
     * ```
     */
    addExtra(group: string, item: string, team: string, value: number): void {
        if (!this.extras[team]) {
            this.extras[team] = {};
        }
        if (!this.extras[team][group]) {
            this.extras[team][group] = {};
        }
        this.extras[team][group][item] = value;
    }

    /**
     * Gets all extra data for a specific team
     * @param {string} team - Team identifier
     * @returns {Object | undefined} Extra data for the team or undefined if no data exists
     */
    getExtrasForTeam(team: string): { [group: string]: { [item: string]: number } } | undefined {
        return this.extras[team];
    }

    /**
     * Gets all extra data across all teams
     * @returns {Extra} Complete extra data structure
     */
    getAllExtras(): Extra {
        return { ...this.extras };
    }

    /**
     * Clears all extra data
     * Useful for resetting between different analysis runs
     */
    clearExtras(): void {
        this.extras = {};
    }

    private extras: Extra = {};

    /**
     * Deserializes a ComputedSummary from a JSON string
     * @param serialized - JSON string representation of a ComputedSummary
     * @returns {Result<ComputedSummary<T, S>>} Result containing the deserialized ComputedSummary or an error
     */
    deserialize(serialized: string): Result<ComputedSummary<T, S>> {
        return attempt<ComputedSummary<T, S>>(() => {
            const parsed = z.object({
                schema: z.record(z.record(z.record(z.number()))),
                extras: z.record(z.record(z.record(z.number()))),
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

            this.extras = parsed.extras;

            return new ComputedSummary<T, S>(parsed);
        });
    }
}

/**
 * Internal class for processing a single analysis group
 * Applies all metrics defined in a schema group to the provided data
 * 
 * @template T - Type of input data
 * @template S - Schema type
 * @template G - Group name type
 */
class Group<T, S extends SummarySchema<T>, G extends GroupNames<T, S>> {
    /**
     * Creates a new Group processor
     * @param {G} name - Name of the group
     * @param {S[G]} itemDefinitions - Map of item names to aggregation functions
     */
    constructor(
        public readonly name: G,
        private readonly itemDefinitions: S[G]
    ) {}

    /**
     * Applies all group metrics to the input data
     * @param {T[]} data - Array of extracted data points
     * @returns {Object} Computed metrics for this group
     */
    compute(data: T[], traces: Trace[], matches: TBAMatch[]): {
        [I in ItemNames<T, S, G>]: number;
    } {
        const result = {} as any;
        
        for (const itemName in this.itemDefinitions) {
            const fn = this.itemDefinitions[itemName];
            result[itemName] = fn(data as T[], traces, matches);
        }
        
        return result;
    }
}

/**
 * Container for computed summary results with analysis and visualization methods
 * Provides type-safe access to team performance data with sorting, ranking, and graphing capabilities
 * 
 * @template S - Schema type defining the analysis structure
 * 
 * @example
 * ```typescript
 * const computed = summary.computeAll(teamData);
 * 
 * // Get team rankings
 * const team1234Ranking = computed.getRanking("1234");
 * 
 * // Generate graph data
 * const autoGraph = computed.getGraphData("Auto Performance", "Average Score");
 * const sortedByValue = autoGraph.sortByValue(true); // Best to worst
 * 
 * // Get specific team data
 * const topTeams = computed.getSortedTeams("Auto Performance", "Average Score");
 * ```
 */
export class ComputedSummary<T, S extends SummarySchema<T>> {
    readonly schemaData: ComputedSummaryType<T, S>;
    readonly extraData: Extra;

    /**
     * Creates a new ComputedSummary with team performance data
     * @param {CombinedSummaryType<T, S>} data - Complete computed metrics including schema and extras
     */
    constructor(data: CombinedSummaryType<T, S>) {
        this.schemaData = data.schema;
        this.extraData = data.extras;
    }

    get summary() {
        const teams = this.getAllTeams();

        const summary: {
            [team: string]: {
                [group in GroupNames<T, S> & string]: {
                    [I in ItemNames<T, S, group> & string]: number;
                }
            }
        } = {};

        for (const team of teams) {
            summary[team] = {
                ...this.schemaData[team],
            }
            if (this.extraData[team]) {
                for (const group in this.extraData[team]) {
                    if (!summary[team][group]) {
                        (summary[team] as any)[group] = {};
                    } else {
                        // if group exists in schema, merge items
                        (summary[team] as any)[group] = { 
                            ...summary[team][group],
                            ...this.extraData[team][group],
                        };
                    }
                }
            }
        }

        return summary;
    }

    /**
     * Retrieves schema-based performance metrics for a specific team
     * @param {string} team - Team identifier
     * @returns {Object | undefined} Team's computed metrics from schema or undefined if team not found
     */
    getTeam(team: number) {
        return this.schemaData[String(team)];
    }

    /**
     * Retrieves extra (non-typesafe) metrics for a specific team
     * @param {string} team - Team identifier
     * @returns {Object | undefined} Team's extra metrics or undefined if no extra data exists
     * 
     * @example
     * ```typescript
     * const extraData = computed.getTeamExtras("1234");
     * if (extraData?.["Manual Scouting"]?.["Drive Rating"]) {
     *   console.log(`Drive rating: ${extraData["Manual Scouting"]["Drive Rating"]}`);
     * }
     * ```
     */
    getTeamExtras(team: number): { [group: string]: { [item: string]: number } } | undefined {
        return this.extraData[team];
    }

    /**
     * Retrieves both schema and extra data for a specific team
     * @param {string} team - Team identifier
     * @returns {Object | null} Combined team data or null if team not found
     * 
     * @example
     * ```typescript
     * const teamData = computed.getTeamComplete("1234");
     * if (teamData) {
     *   console.log(`Schema data:`, teamData.schema);
     *   console.log(`Extra data:`, teamData.extras);
     * }
     * ```
     */
    getTeamComplete(team: string): { 
        schema: ComputedSummaryType<T, S>[string] | undefined; 
        extras: { [group: string]: { [item: string]: number } } | undefined;
    } | null {
        const schemaTeamData = this.schemaData[team];
        const extraTeamData = this.extraData[team];
        
        if (!schemaTeamData && !extraTeamData) {
            return null;
        }

        return {
            schema: schemaTeamData,
            extras: extraTeamData
        };
    }

    /**
     * Gets list of all team identifiers in the summary (schema + extras)
     * @returns {string[]} Array of team names/numbers
     */
    getAllTeams(): number[] {
        const schemaTeams = new Set(Object.keys(this.schemaData));
        const extraTeams = new Set(Object.keys(this.extraData));
        return [...new Set([...schemaTeams, ...extraTeams])].map(Number);
    }

    /**
     * Gets list of team identifiers that have extra data
     * @returns {string[]} Array of team names/numbers with extra metrics
     */
    getTeamsWithExtras(): number[] {
        return Object.keys(this.extraData).map(Number);
    }

    /**
     * Gets all available groups in extra data
     * @returns {string[]} Array of group names from extra metrics
     */
    getExtraGroups(): string[] {
        const groups = new Set<string>();
        for (const teamData of Object.values(this.extraData)) {
            Object.keys(teamData).forEach(group => groups.add(group));
        }
        return [...groups];
    }

    /**
     * Gets all available items for a specific extra group
     * @param {string} group - Group name
     * @returns {string[]} Array of item names in the group
     */
    getExtraItemsInGroup(group: string): string[] {
        const items = new Set<string>();
        for (const teamData of Object.values(this.extraData)) {
            if (teamData[group]) {
                Object.keys(teamData[group]).forEach(item => items.add(item));
            }
        }
        return [...items];
    }

    /**
     * Gets teams sorted by a specific metric with full type safety
     * Provides IntelliSense for valid group and item combinations
     * 
     * @template G - Group name from schema
     * @template I - Item name from the specified group
     * @param {G} group - Analysis group name
     * @param {I} item - Specific metric within the group
     * @param {boolean} [descending=true] - Sort order (true = best to worst)
     * @returns {string[]} Array of team identifiers in sorted order
     * 
     * @example
     * ```typescript
     * // Get teams sorted by auto scoring performance
     * const topAutoTeams = computed.getSortedTeams("Auto Performance", "Average Score", true);
     * console.log(`Best auto team: ${topAutoTeams[0]}`);
     * 
     * // Get teams sorted by consistency (ascending order)
     * const consistentTeams = computed.getSortedTeams("Performance", "Consistency", false);
     * ```
     */
    getSortedTeams<G extends GroupNames<T, S>, I extends ItemNames<T, S, G>>(
        group: G, 
        item: I, 
        descending = true
    ): number[] {
        const teams = this.getAllTeams();
        return teams
            .filter(team => this.schemaData[team]?.[group]?.[item] !== undefined)
            .sort((a, b) => {
                const aValue = this.schemaData[a][group][item];
                const bValue = this.schemaData[b][group][item];
                return descending ? bValue - aValue : aValue - bValue;
            });
    }

    /**
     * Gets teams sorted by an extra (non-typesafe) metric
     * @param {string} group - Extra group name
     * @param {string} item - Extra item name
     * @param {boolean} [descending=true] - Sort order (true = best to worst)
     * @returns {string[]} Array of team identifiers in sorted order
     * 
     * @example
     * ```typescript
     * // Sort by manual scouting ratings
     * const topDrivers = computed.getSortedTeamsByExtra("Manual Scouting", "Drive Rating", true);
     * console.log(`Best drivers: ${topDrivers.slice(0, 3).join(', ')}`);
     * ```
     */
    getSortedTeamsByExtra(group: string, item: string, descending = true): number[] {
        const teams = this.getTeamsWithExtras();
        return teams
            .filter(team => this.extraData[team]?.[group]?.[item] !== undefined)
            .sort((a, b) => {
                const aValue = this.extraData[a][group][item];
                const bValue = this.extraData[b][group][item];
                return descending ? bValue - aValue : aValue - bValue;
            });
    }

    /**
     * Creates GraphData object for flexible visualization and sorting
     * Returns a GraphData instance that can be sorted by different criteria after creation
     * 
     * @template G - Group name from schema
     * @template I - Item name from the specified group  
     * @param {G} group - Analysis group name
     * @param {I} item - Specific metric within the group
     * @returns {GraphData<G, I>} GraphData object with sorting and analysis methods
     * 
     * @example
     * ```typescript
     * const graphData = computed.getGraphData("Scoring", "Average Points");
     * 
     * // Sort by performance (best to worst)
     * const performanceChart = graphData.sortByValue(true);
     * 
     * // Sort by team number for easy lookup
     * const teamOrderChart = graphData.sortByTeam(false);
     * 
     * // Get statistics
     * const stats = graphData.getStats();
     * console.log(`League average: ${stats.average}`);
     * ```
     */
    getGraphData<G extends GroupNames<T, S>, I extends ItemNames<T, S, G>>(
        group: G, 
        item: I
    ): GraphData<G, I> {
        const teams = this.getAllTeams();
        const rawData = teams
            .filter(team => this.schemaData[team]?.[group]?.[item] !== undefined)
            .map(team => ({
                team: team,
                value: this.schemaData[team][group][item]
            }));

        return new GraphData<G, I>(rawData, group, item);
    }

    /**
     * Creates GraphData object for extra (non-typesafe) metrics
     * @param {string} group - Extra group name
     * @param {string} item - Extra item name
     * @returns {GraphData<string, string>} GraphData object with sorting and analysis methods
     * 
     * @example
     * ```typescript
     * const driveRatingGraph = computed.getGraphDataForExtra("Manual Scouting", "Drive Rating");
     * const sortedByRating = driveRatingGraph.sortByValue(true);
     * 
     * console.log(`Top rated drivers:`);
     * sortedByRating.labels.slice(0, 5).forEach((team, i) => {
     *   console.log(`${i + 1}. Team ${team}: ${sortedByRating.data[i]}`);
     * });
     * ```
     */
    getGraphDataForExtra(group: string, item: string): GraphData<string, string> {
        const teams = this.getTeamsWithExtras();
        const rawData = teams
            .filter(team => this.extraData[team]?.[group]?.[item] !== undefined)
            .map(team => ({
                team,
                value: this.extraData[team][group][item]
            }));

        return new GraphData<string, string>(rawData, group, item);
    }

    /**
     * Gets complete ranking information for a specific team across all metrics
     * Returns rankings (1-based) for every group and item in the schema
     * 
     * @param {string} team - Team identifier to get rankings for
     * @returns {Object | null} Complete ranking data or null if team not found
     * 
     * @example
     * ```typescript
     * const rankings = computed.getRanking("1234");
     * if (rankings) {
     *   console.log(`Auto rank: #${rankings["Auto Performance"]["Average Score"]}`);
     *   console.log(`Defense rank: #${rankings["Defense"]["Effectiveness"]}`);
     * }
     * ```
     */
    getRanking(team: number): {
        [G in GroupNames<T, S>]: {
            [I in ItemNames<T, S, G>]: number;
        };
    } | null {
        const teamSummary = this.getTeam(team);
        if (!teamSummary) return null;

        const rankings = {} as any;

        for (const group in teamSummary) {
            rankings[group] = {};
            for (const item in teamSummary[group]) {
                rankings[group][item] = this.getRankForTeam(team, group as any, item as any);
            }
        }

        return rankings;
    }

    /**
     * Gets ranking information for extra metrics for a specific team
     * @param {string} team - Team identifier
     * @returns {Object | null} Complete ranking data for extra metrics or null if no extra data
     * 
     * @example
     * ```typescript
     * const extraRankings = computed.getExtraRankings("1234");
     * if (extraRankings?.["Manual Scouting"]?.["Drive Rating"]) {
     *   const rank = extraRankings["Manual Scouting"]["Drive Rating"];
     *   console.log(`Team 1234 drive rating rank: #${rank}`);
     * }
     * ```
     */
    getExtraRankings(team: number): { [group: string]: { [item: string]: number } } | null {
        const teamExtras = this.getTeamExtras(team);
        if (!teamExtras) return null;

        const rankings: { [group: string]: { [item: string]: number } } = {};

        for (const group in teamExtras) {
            rankings[group] = {};
            for (const item in teamExtras[group]) {
                rankings[group][item] = this.getRankForTeamExtra(team, group, item);
            }
        }

        return rankings;
    }

    /**
     * Gets the ranking (1-based) for a specific team on an extra metric
     * @param {string} team - Team identifier
     * @param {string} group - Extra group name
     * @param {string} item - Extra item name
     * @returns {number} Team's rank (1 = best, -1 if team/metric not found)
     */
    getRankForTeamExtra(team: number, group: string, item: string): number {
        const teamValue = this.extraData[team]?.[group]?.[item];
        if (teamValue === undefined) return -1;

        const allValues = this.getTeamsWithExtras()
            .map(t => this.extraData[t]?.[group]?.[item])
            .filter(v => v !== undefined)
            .sort((a, b) => b - a);

        return allValues.indexOf(teamValue) + 1;
    }

    /**
     * Gets the ranking (1-based) for a specific team on a specific metric
     * Compares team's performance against all other teams for the given metric
     * 
     * @template G - Group name from schema
     * @template I - Item name from the specified group
     * @param {string} team - Team identifier
     * @param {G} group - Analysis group name  
     * @param {I} item - Specific metric within the group
     * @returns {number} Team's rank (1 = best, -1 if team/metric not found)
     * 
     * @example
     * ```typescript
     * const autoRank = computed.getRankForTeam("1234", "Auto Performance", "Average Score");
     * console.log(`Team 1234 auto rank: #${autoRank}`);
     * 
     * if (autoRank === 1) {
     *   console.log("Top auto performer!");
     * }
     * ```
     */
    getRankForTeam<G extends GroupNames<T, S>, I extends ItemNames<T, S, G>>(
        team: number, 
        group: G, 
        item: I
    ): number {
        const teamValue = this.schemaData[team]?.[group]?.[item];
        if (teamValue === undefined) return -1;

        const allValues = this.getAllTeams()
            .map(t => this.schemaData[t]?.[group]?.[item])
            .filter(v => v !== undefined)
            .sort((a, b) => b - a);

        return allValues.indexOf(teamValue) + 1;
    }

    /**
     * Generates complete ranking data for all teams across all metrics
     * Useful for comprehensive analysis and leaderboard generation
     * 
     * @returns {Object} Map of team identifiers to their complete ranking data
     * 
     * @example
     * ```typescript
     * const allRankings = computed.getAllRankings();
     * 
     * // Find the most well-rounded team (best average rank)
     * const teamAverages = Object.entries(allRankings).map(([team, ranks]) => {
     *   const allRanks = Object.values(ranks).flatMap(group => Object.values(group));
     *   const avgRank = allRanks.reduce((a, b) => a + b, 0) / allRanks.length;
     *   return { team, avgRank };
     * });
     * 
     * teamAverages.sort((a, b) => a.avgRank - b.avgRank);
     * console.log(`Most well-rounded team: ${teamAverages[0].team}`);
     * ```
     */
    getAllRankings(): {
        [team: string]: {
            [G in GroupNames<T, S>]: {
                [I in ItemNames<T, S, G>]: number;
            };
        };
    } {
        const allRankings = {} as any;

        for (const team of this.getAllTeams()) {
            const ranking = this.getRanking(team);
            if (ranking) {
                allRankings[team] = ranking;
            }
        }

        return allRankings;
    }

    /**
     * Generates complete ranking data for all teams across all extra metrics
     * @returns {Object} Map of team identifiers to their complete extra ranking data
     * 
     * @example
     * ```typescript
     * const allExtraRankings = computed.getAllExtraRankings();
     * 
     * // Find team with best average extra ranking
     * const teamAverages = Object.entries(allExtraRankings).map(([team, ranks]) => {
     *   const allRanks = Object.values(ranks).flatMap(group => Object.values(group));
     *   const avgRank = allRanks.reduce((a, b) => a + b, 0) / allRanks.length;
     *   return { team, avgRank };
     * });
     * 
     * teamAverages.sort((a, b) => a.avgRank - b.avgRank);
     * console.log(`Best overall extra performance: ${teamAverages[0]?.team}`);
     * ```
     */
    getAllExtraRankings(): { [team: string]: { [group: string]: { [item: string]: number } } } {
        const allRankings: { [team: string]: { [group: string]: { [item: string]: number } } } = {};

        for (const team of this.getTeamsWithExtras()) {
            const ranking = this.getExtraRankings(team);
            if (ranking) {
                allRankings[team] = ranking;
            }
        }

        return allRankings;
    }

    /**
     * Serializes the ComputedSummary to a JSON string
     * @returns Serialized JSON string
     */
    serialize(): string {
        return JSON.stringify({
            schemaData: this.schemaData,
            extraData: this.extraData,
        });
    }

    /**
     * Updates a specific metric value for a team in the schema data
     * @param {number} team - Team identifier
     * @param {G} group - Analysis group name
     * @param {I} item - Specific metric within the group
     * @param {number} value - New metric value to set
     * @returns {Result<void>} Result indicating success or failure of the update
     * 
     * @example
     * ```typescript
     * const result = computed.update(1234, "Scoring", "Average", 42.5);
     * if (result.isOk()) {
     *   console.log("Update successful!");
     * } else {
     *   console.error("Update failed:", result.error);
     * }
     * ```
     */
    update(team: number, group: GroupNames<T, S>, item: ItemNames<T, S, typeof group>, value: number) {
        return attempt(() => {
            if (!this.schemaData[team]) {
                throw new Error(`Team ${team} does not exist in summary data.`);
            }

            if (!this.schemaData[team][group]) {
                throw new Error(`Group '${group}' does not exist for team ${team}.`);
            }

            if (item in this.schemaData[team][group] === undefined) {
                throw new Error(`Item '${item}' does not exist in group '${group}' for team ${team}.`);
            }

            this.schemaData[team][group][item] = value;
        });
    }

    /**
     * Updates a specific metric value for a team in the extra data
     * @param {number} team - Team identifier
     * @param {string} group - Extra group name
     * @param {string} item - Extra item name
     * @param {number} value - New metric value to set
     * @returns {Result<void>} Result indicating success or failure of the update
     * 
     * @example
     * ```typescript
     * const result = computed.updateExtra(1234, "Manual Scouting", "Drive Rating", 9.0);
     * if (result.isOk()) {
     *   console.log("Extra update successful!");
     * } else {
     *   console.error("Extra update failed:", result.error);
     * }
     * ```
     */
    updateExtra(team: number, group: string, item: string, value: number) {
        return attempt(() => {
            if (!this.extraData[team]) {
                throw new Error(`Team ${team} does not have any extra data.`);
            }

            if (!this.extraData[team][group]) {
                throw new Error(`Group '${group}' does not exist for team ${team} in extra data.`);
            }

            if (item in this.extraData[team][group] === undefined) {
                throw new Error(`Item '${item}' does not exist in group '${group}' for team ${team} in extra data.`);
            }

            this.extraData[team][group][item] = value;
        });
    }
}

/**
 * Helper function to create a typed summary with schema
 * Provides a convenient way to create Summary instances with full type inference
 * 
 * @template T - Type of data extracted from each trace
 * @template S - Schema type defining analysis structure
 * @param {(data: Trace) => T} fn - Function to extract relevant data from traces
 * @param {S} schema - Analysis schema defining groups and metrics
 * @returns {Summary<T, S>} Configured Summary instance
 * 
 * @example
 * ```typescript
 * const summary = createTypedSummary(
 *   (trace) => trace.filterAction('spk').length,
 *   {
 *     "Performance": {
 *       "Average": Aggregators.average,
 *       "Peak": Aggregators.max
 *     }
 *   } as const
 * );
 * ```
 */
export function createTypedSummary<T, S extends SummarySchema<T>>(
    fn: (data: Trace) => T,
    schema: S
) {
    return new Summary<T, S>(fn, schema);
}

/**
 * Flexible graph data container with multiple sorting and analysis options
 * Separates data collection from presentation, allowing the same data to be visualized
 * in different ways without recomputation
 * 
 * @template Group - Type of the group identifier
 * @template Item - Type of the item identifier
 * 
 * @example
 * ```typescript
 * const graphData = computed.getGraphData("Scoring", "Auto Average");
 * 
 * // Different visualization approaches
 * const leaderboard = graphData.sortByValue(true);        // Performance ranking
 * const byTeamNumber = graphData.sortByTeam(false);       // Numerical order
 * const original = graphData.original();                  // Collection order
 * 
 * // Statistical analysis
 * const stats = graphData.getStats();
 * const teamData = graphData.getTeamData("1234");
 * ```
 */
export class GraphData<Group, Item> {
    /**
     * Creates a new GraphData instance
     * @param {Array<{team: string; value: number}>} rawData - Raw team performance data
     * @param {Group} group - Group identifier for this data set
     * @param {Item} item - Item identifier for this metric
     */
    constructor(
        private readonly rawData: { team: number; value: number }[],
        public readonly group: Group,
        public readonly item: Item
    ) {}

    /**
     * Sorts teams by their performance values (metric scores)
     * Perfect for creating performance rankings and leaderboards
     * 
     * @param {boolean} [descending=true] - Sort order (true = best to worst, false = worst to best)
     * @returns {Object} Sorted graph data with labels, values, and rankings
     * 
     * @example
     * ```typescript
     * const topPerformers = graphData.sortByValue(true);
     * console.log(`#1 team: ${topPerformers.labels[0]} with ${topPerformers.data[0]} points`);
     * 
     * // Create leaderboard
     * topPerformers.labels.forEach((team, i) => {
     *   console.log(`#${i + 1}: Team ${team} - ${topPerformers.data[i]} points`);
     * });
     * ```
     */
    sortByValue(descending = true): {
        labels: number[];
        data: number[];
        rankings: number[];
        sortedBy: 'value';
    } {
        const sorted = [...this.rawData].sort((a, b) => 
            descending ? b.value - a.value : a.value - b.value
        );
        
        return {
            labels: sorted.map(item => item.team),
            data: sorted.map(item => item.value),
            rankings: sorted.map((_, index) => index + 1),
            sortedBy: 'value'
        };
    }

    /**
     * Sorts teams by their identifiers (team numbers or names)
     * Useful for creating predictable orderings and easy team lookup
     * 
     * @param {boolean} [descending=false] - Sort order (false = ascending, true = descending)
     * @returns {Object} Sorted graph data with performance rankings preserved
     * 
     * @example
     * ```typescript
     * const byTeamNumber = graphData.sortByTeam(false);
     * // Results in team order like: [1234, 1357, 2468, 5678]
     * 
     * // Find specific team easily
     * const teamIndex = byTeamNumber.labels.indexOf("1234");
     * if (teamIndex !== -1) {
     *   console.log(`Team 1234: ${byTeamNumber.data[teamIndex]} points, rank #${byTeamNumber.rankings[teamIndex]}`);
     * }
     * ```
     */
    sortByTeam(descending = false): {
        labels: number[];
        data: number[];
        rankings: number[];
        sortedBy: 'team';
    } {
        const sorted = [...this.rawData].sort((a, b) => {
            // Try to parse as numbers first (for team numbers like "1234", "5678")
            
            if (!isNaN(a.team) && !isNaN(b.team)) {
                return descending ? b.team - a.team : a.team - b.team;
            }
            
            // Fall back to string comparison
            return descending ? b.team.toString().localeCompare(a.team.toString()) : a.team.toString().localeCompare(b.team.toString());
        });

        // Calculate rankings based on performance, not display order
        const valueRanked = this.sortByValue(true);
        const rankings = sorted.map(item => 
            valueRanked.labels.indexOf(item.team) + 1
        );
        
        return {
            labels: sorted.map(item => item.team),
            data: sorted.map(item => item.value),
            rankings: rankings,
            sortedBy: 'team'
        };
    }

    /**
     * Returns data in original collection order without sorting
     * Preserves the order teams were processed during summary computation
     * 
     * @returns {Object} Graph data in original order with performance rankings
     * 
     * @example
     * ```typescript
     * const originalOrder = graphData.original();
     * // Maintains whatever order teams were in the original dataset
     * 
     * // Still provides ranking information
     * console.log(`First processed team: ${originalOrder.labels[0]}, rank #${originalOrder.rankings[0]}`);
     * ```
     */
    original(): {
        labels: number[];
        data: number[];
        rankings: number[];
        sortedBy: 'original';
    } {
        // Calculate rankings based on performance
        const valueRanked = this.sortByValue(true);
        const rankings = this.rawData.map(item => 
            valueRanked.labels.indexOf(item.team) + 1
        );

        return {
            labels: this.rawData.map(item => item.team),
            data: this.rawData.map(item => item.value),
            rankings: rankings,
            sortedBy: 'original'
        };
    }

    /**
     * Generic sorting method that delegates to specific sort functions
     * Provides programmatic access to different sorting strategies
     * 
     * @template K - Key type ('team' | 'value')
     * @param {K} key - Sort key ('team' for alphabetical, 'value' for performance)  
     * @param {boolean} [descending=false] - Sort order
     * @returns {Object} Sorted graph data
     * 
     * @example
     * ```typescript
     * // Programmatic sorting based on user selection
     * const sortKey = userPreference === 'performance' ? 'value' : 'team';
     * const sorted = graphData.sortBy(sortKey, true);
     * ```
     */
    sortBy<K extends keyof { team: string; value: number }>(
        key: K,
        descending = false
    ): {
        labels: string[];
        data: number[];
        rankings: number[];
        sortedBy: K;
    } {
        if (key === 'value') {
            return this.sortByValue(descending) as any;
        }
        if (key === 'team') {
            return this.sortByTeam(descending) as any;
        }
        return this.original() as any;
    }

    /**
     * Returns a copy of the raw data for custom processing
     * Allows advanced analysis beyond the built-in sorting methods
     * 
     * @returns {Array<{team: string; value: number}>} Copy of raw team performance data
     * 
     * @example
     * ```typescript
     * const raw = graphData.getRawData();
     * 
     * // Custom analysis
     * const topQuartile = raw
     *   .sort((a, b) => b.value - a.value)
     *   .slice(0, Math.ceil(raw.length * 0.25));
     * 
     * console.log(`Top 25% teams: ${topQuartile.map(t => t.team).join(', ')}`);
     * ```
     */
    getRawData(): { team: number; value: number }[] {
        return [...this.rawData];
    }

    /**
     * Calculates comprehensive statistical summary of the performance data
     * Provides insights into the distribution and characteristics of team performance
     * 
     * @returns {Object} Statistical summary including central tendency, spread, and range
     * 
     * @example
     * ```typescript
     * const stats = graphData.getStats();
     * console.log(`League average: ${stats.average.toFixed(1)}`);
     * console.log(`Top performer: ${stats.max}`);
     * console.log(`Competitive balance: CV = ${stats.coefficientOfVariation.toFixed(2)}`);
     * 
     * if (stats.coefficientOfVariation < 0.3) {
     *   console.log("Highly competitive field!");
     * }
     * ```
     */
    getStats() {
        const values = this.rawData.map(item => item.value);
        return {
            count: values.length,
            sum: Aggregators.sum(values),
            average: Aggregators.average(values),
            max: Aggregators.max(values),
            min: Aggregators.min(values),
            median: Aggregators.median(values),
            standardDeviation: Aggregators.standardDeviation(values),
            coefficientOfVariation: Aggregators.coefficientOfVarience(values)
        };
    }

    /**
     * Retrieves performance data and rank for a specific team
     * Useful for detailed team reports and comparisons
     */
    getTeamData(team: number): { team: number; value: number; rank: number } | null {
        const teamData = this.rawData.find(item => item.team === team);
        if (!teamData) return null;

        const valueRanked = this.sortByValue(true);
        const rank = valueRanked.labels.indexOf(team) + 1;

        return {
            team: teamData.team,
            value: teamData.value,
            rank: rank
        };
    }
}