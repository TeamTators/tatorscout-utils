import { Trace } from "./trace";

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
export interface SummarySchema {
    [groupName: string]: {
        [itemName: string]: (data: number[]) => number;
    };
}

/** Extract group names from schema for type safety */
type GroupNames<S extends SummarySchema> = keyof S;

/** Extract item names for a specific group from schema */
type ItemNames<S extends SummarySchema, G extends GroupNames<S>> = keyof S[G];

/** Generate the computed summary result type from schema definition */
type ComputedSummaryType<S extends SummarySchema> = {
    [team: string]: {
        [G in GroupNames<S>]: {
            [I in ItemNames<S, G>]: number;
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
export class Summary<T, S extends SummarySchema> {
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
    computeSingle(traces: Trace[]): {
        [G in GroupNames<S>]: {
            [I in ItemNames<S, G>]: number;
        };
    } {
        const results = traces.map(t => this.fn(t));
        const summary = {} as any;

        // Process all groups from schema automatically
        for (const groupName in this.schema) {
            const group = new Group(groupName, this.schema[groupName]);
            summary[groupName] = group.compute(results);
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
    computeAll(data: { [team: string]: Trace[] }): ComputedSummary<S> {
        const summary = {} as ComputedSummaryType<S>;

        for (const team in data) {
            summary[team] = this.computeSingle(data[team]);
        }

        return new ComputedSummary(summary);
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
class Group<T, S extends SummarySchema, G extends GroupNames<S>> {
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
    compute(data: T[]): {
        [I in ItemNames<S, G>]: number;
    } {
        const result = {} as any;
        
        for (const itemName in this.itemDefinitions) {
            const fn = this.itemDefinitions[itemName];
            result[itemName] = fn(data as number[]); // Type assertion needed here
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
export class ComputedSummary<S extends SummarySchema> {
    /**
     * Creates a new ComputedSummary with team performance data
     * @param {ComputedSummaryType<S>} summary - Complete computed metrics for all teams
     */
    constructor(
        public readonly summary: ComputedSummaryType<S>
    ) {}

    /**
     * Retrieves performance metrics for a specific team
     * @param {string} team - Team identifier
     * @returns {Object | undefined} Team's computed metrics or undefined if team not found
     */
    getTeam(team: string) {
        return this.summary[team];
    }

    /**
     * Gets list of all team identifiers in the summary
     * @returns {string[]} Array of team names/numbers
     */
    getAllTeams(): string[] {
        return Object.keys(this.summary);
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
    getSortedTeams<G extends GroupNames<S>, I extends ItemNames<S, G>>(
        group: G, 
        item: I, 
        descending = true
    ): string[] {
        const teams = this.getAllTeams();
        return teams
            .filter(team => this.summary[team]?.[group]?.[item] !== undefined)
            .sort((a, b) => {
                const aValue = this.summary[a][group][item];
                const bValue = this.summary[b][group][item];
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
    getGraphData<G extends GroupNames<S>, I extends ItemNames<S, G>>(
        group: G, 
        item: I
    ): GraphData<G, I> {
        const teams = this.getAllTeams();
        const rawData = teams
            .filter(team => this.summary[team]?.[group]?.[item] !== undefined)
            .map(team => ({
                team: team,
                value: this.summary[team][group][item]
            }));

        return new GraphData<G, I>(rawData, group, item);
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
    getRanking(team: string): {
        [G in GroupNames<S>]: {
            [I in ItemNames<S, G>]: number;
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
    getRankForTeam<G extends GroupNames<S>, I extends ItemNames<S, G>>(
        team: string, 
        group: G, 
        item: I
    ): number {
        const teamValue = this.summary[team]?.[group]?.[item];
        if (teamValue === undefined) return -1;

        const allValues = this.getAllTeams()
            .map(t => this.summary[t]?.[group]?.[item])
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
            [G in GroupNames<S>]: {
                [I in ItemNames<S, G>]: number;
            };
        };
    } {
        const allRankings = {} as any;

        for (const team of this.getAllTeams()) {
            allRankings[team] = this.getRanking(team)!;
        }

        return allRankings;
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
export function createTypedSummary<T, S extends SummarySchema>(
    fn: (data: Trace) => T,
    schema: S
) {
    return new Summary(fn, schema);
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
        private readonly rawData: { team: string; value: number }[],
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
        labels: string[];
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
        labels: string[];
        data: number[];
        rankings: number[];
        sortedBy: 'team';
    } {
        const sorted = [...this.rawData].sort((a, b) => {
            // Try to parse as numbers first (for team numbers like "1234", "5678")
            const aNum = parseInt(a.team);
            const bNum = parseInt(b.team);
            
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return descending ? bNum - aNum : aNum - bNum;
            }
            
            // Fall back to string comparison
            return descending ? b.team.localeCompare(a.team) : a.team.localeCompare(b.team);
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
        labels: string[];
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
    getRawData(): { team: string; value: number }[] {
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
    getTeamData(team: string): { team: string; value: number; rank: number } | null {
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