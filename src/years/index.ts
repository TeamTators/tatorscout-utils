import { Trace } from "../trace";
import { createTypedSummary, SummarySchema } from "../summary";

export type Zone = Readonly<number[][]>;
export type ZoneMap = Readonly<{
    [area: string]: Zone;
}>
export type AllianceZone = Readonly<{
    red: Zone;
    blue: Zone;
}>

export type AllianceZoneMap = Readonly<{
    [area: string]: AllianceZone;
}>;


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

export type TimeAction<Actions extends string> = `${'auto' | 'teleop' | 'endgame'}.${Actions}`;

export class YearInfo<
    GlobalAreas extends ZoneMap, 
    AllianceAreas extends AllianceZoneMap, 
    Actions extends string,
    Score extends ScoreBreakdown<Actions>,
    ParsedScoreBreakdown
> {
    constructor(
        public readonly globalAreas: GlobalAreas,
        public readonly allianceAreas: AllianceAreas,
        public readonly border: Zone,
        public readonly actions: Record<Actions, string>,
        public readonly scoreBreakdown: Score,
    ) {
    }

    getContribution(_trace: Trace): number {
        console.warn('getContribution not implemented for this year');
        return 0;
    }

    parse(_trace: Trace): ParsedScoreBreakdown {
        throw new Error('parse not implemented for this year');
    }

    getAlliance(_trace: Trace): 'red' | 'blue' | 'unknown' {
        console.warn('getAlliance not implemented for this year');
        return 'unknown';
    }

    summary<S extends SummarySchema>(schema: S) {
        return createTypedSummary<ParsedScoreBreakdown, S>(
            (trace) => this.parse(trace),
            schema
        );
    }
}