import { Trace } from "./trace";

// Common aggregation functions
export const Aggregators = {
    sum: (data: number[]) => data.reduce((a, b) => a + b, 0),
    average: (data: number[]) => data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0,
    max: (data: number[]) => data.length > 0 ? Math.max(...data) : 0,
    min: (data: number[]) => data.length > 0 ? Math.min(...data) : 0,
    median: (data: number[]) => {
        if (data.length === 0) return 0;
        const sorted = [...data].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 
            ? (sorted[mid - 1] + sorted[mid]) / 2 
            : sorted[mid];
    },
    count: (data: number[]) => data.length,
    standardDeviation: (data: number[]) => {
        if (data.length === 0) return 0;
        const avg = Aggregators.average(data);
        const variance = data.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / data.length;
        return Math.sqrt(variance);
    },
    coefficientOfVarience: (data: number[]) => {
        const avg = Aggregators.average(data);
        if (avg === 0) return 0;
        const stdDev = Aggregators.standardDeviation(data);
        return stdDev / avg;
    }
} as const;

// Type-safe schema definition
export interface SummarySchema {
    [groupName: string]: {
        [itemName: string]: (data: number[]) => number;
    };
}

// Extract group names from schema
type GroupNames<S extends SummarySchema> = keyof S;

// Extract item names for a specific group
type ItemNames<S extends SummarySchema, G extends GroupNames<S>> = keyof S[G];

// Create the computed summary type from schema
type ComputedSummaryType<S extends SummarySchema> = {
    [team: string]: {
        [G in GroupNames<S>]: {
            [I in ItemNames<S, G>]: number;
        };
    };
};

// Type-safe summary class
export class Summary<T, S extends SummarySchema> {
    private readonly schema: S;

    constructor(
        public readonly fn: (data: Trace) => T,
        schema: S
    ) {
        this.schema = schema;
    }

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

    computeAll(data: { [team: string]: Trace[] }): ComputedSummary<S> {
        const summary = {} as ComputedSummaryType<S>;

        for (const team in data) {
            summary[team] = this.computeSingle(data[team]);
        }

        return new ComputedSummary(summary);
    }
}

class Group<T, S extends SummarySchema, G extends GroupNames<S>> {
    constructor(
        public readonly name: G,
        private readonly itemDefinitions: S[G]
    ) {}

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

export class ComputedSummary<S extends SummarySchema> {
    constructor(
        public readonly summary: ComputedSummaryType<S>
    ) {}

    getTeam(team: string) {
        return this.summary[team];
    }

    getAllTeams(): string[] {
        return Object.keys(this.summary);
    }

    // Type-safe method with autocomplete for group and item names
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

    // Type-safe graph data generation - returns GraphData for flexible sorting
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

    // Type-safe ranking with proper return type
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

// Helper function to create a typed summary with schema
export function createTypedSummary<T, S extends SummarySchema>(
    fn: (data: Trace) => T,
    schema: S
) {
    return new Summary(fn, schema);
}

export class GraphData<Group, Item> {
    constructor(
        private readonly rawData: { team: string; value: number }[],
        public readonly group: Group,
        public readonly item: Item
    ) {}

    // Sort by team performance (value) - best to worst or worst to best
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

    // Sort by team number/name
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

    // Return data in original order (no sorting)
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

    // Custom sorting function
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

    // Get the raw data for custom processing
    getRawData(): { team: string; value: number }[] {
        return [...this.rawData];
    }

    // Get summary statistics
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

    // Find specific team
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