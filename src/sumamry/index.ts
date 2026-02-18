import { attempt, Result } from "ts-utils/check";
import { Trace } from "../trace";
import { z } from 'zod';
import { TBAMatch, teamsFromMatch } from "../tba";


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

type GroupNames<T, S extends SummarySchema<T>> = keyof S;
type ItemNames<T, S extends SummarySchema<T>, G extends GroupNames<T, S>> = keyof S[G];


// avg, median, min, max, stddev, mode
type TeamComputedSummaryNumber<T, S extends SummarySchema<T>> = {
    [G in GroupNames<T, S>]: {
        [I in ItemNames<T, S, G>]: number;
    }
}

type TeamComputedSummaryType<T, S extends SummarySchema<T>> = {
    [G in GroupNames<T, S>]: {
        [I in ItemNames<T, S, G>]: Point;
    }
};

class Point {
    constructor(public readonly values: number[]) {}

    average(): number {
        if (this.values.length === 0) return 0;
        return this.values.reduce((a, b) => a + b, 0) / this.values.length;
    }

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

    min(): number {
        if (this.values.length === 0) return 0;
        return Math.min(...this.values);
    }

    max(): number {
        if (this.values.length === 0) return 0;
        return Math.max(...this.values);
    }

    stddev(): number {
        if (this.values.length === 0) return 0;
        const mean = this.average();
        const variance = this.values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / this.values.length;
        return Math.sqrt(variance);
    }

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

    coefficientOfVariation(): number {
        const mean = this.average();
        if (mean === 0) return 0;
        return this.stddev() / mean;
    }
}

class TeamComputedSummary<T, S extends SummarySchema<T>> {
    constructor(public readonly team: number, public readonly data: TeamComputedSummaryType<T, S>, public readonly parent: Summary<T, S>) {}
}

type ComputedSummaryType<T, S extends SummarySchema<T>> = {
    [team: string]: TeamComputedSummaryType<T, S>;
}

// avg, median, min, max, stddev, mode
type ComputedSummaryNumber<T, S extends SummarySchema<T>> = {
    [team: string]: TeamComputedSummaryNumber<T, S>;
}

/** Combined type including both schema-based and extra summary data */
type CombinedSummaryType<T, S extends SummarySchema<T>> = {
    schema: ComputedSummaryType<T, S>;
    // extras: Extra;
};

export class Summary<T, S extends SummarySchema<T>> {
    constructor(public readonly traceParser: (trace: Trace) => T, public readonly schema: S) {}

    computeTeam(team: number, matches: TBAMatch[], traces: Trace[]): TeamComputedSummaryType<T, S> {
        const results = traces.map(trace => this.traceParser(trace));
        const summary = {} as TeamComputedSummaryType<T, S>;

        for (const groupName in this.schema) {
            const group = new Group<T, S, typeof groupName>(groupName, this.schema[groupName]);
            summary[groupName] = group.compute(team, results, traces, matches);
        }

        return summary;
    }

    computeAll(data: { [team: string]: Trace[] }, matches: TBAMatch[]) {
        const result: ComputedSummaryType<T, S> = {};

        for (const team in data) {
            result[team] = this.computeTeam(parseInt(team), matches, data[team]);
        }

        return new ComputedSummary<T, S>({ schema: result }, this);
    }

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

class Group<T, S extends SummarySchema<T>, G extends GroupNames<T, S>> {
    constructor(
        public readonly name: G,
        public readonly items: S[G],
    ) {}

    compute(team: number, data: T[], traces: Trace[], matches: TBAMatch[]): TeamComputedSummaryType<T, S>[G] {
        const result = {} as {
            [I in ItemNames<T, S, G>]: Point;
        }

        for (const itemName in this.items) {
            const fn = this.items[itemName];
            result[itemName] = new Point(fn({
                matches,
                traces,
                scoring: data,
                team,
            }));
        }

        return result;
    }
}

export class ComputedSummary<T, S extends SummarySchema<T>> {
    readonly schemaData: ComputedSummaryType<T, S>;
    // readonly extraData: Extra;
    constructor(data: CombinedSummaryType<T, S>, public readonly parent: Summary<T, S>) {
        this.schemaData = data.schema;
    }

    get parser(): S {
        return this.parent.schema;
    }
}