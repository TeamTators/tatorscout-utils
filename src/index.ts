import { attempt } from 'ts-utils/check';
import { z } from 'zod';


type YearActions = '';

type Action = YearActions | 0;

type TraceArray = TracePoint[];
type TracePoint = [number, number, number, Action];

const encodeTrace = (trace: TraceArray) => {}
const decodeTrace = (trace: string) => {};



export const TraceSchema = z.array(z.tuple([
    z.number(),
    z.number(),
    z.number(),
    z.union([
        z.string(),
        z.literal(0),
    ])
]));


export class Trace {
    public static deserialize(data: string) {
        return attempt(() => {
            if (Array.isArray(JSON.parse(data))) {
                return new Trace(
                    TraceSchema.parse(JSON.parse(data)) as TraceArray,
                )
            }
            const parsed = z.union([
                z.object({
                    encoded: z.boolean().refine(() => false),
                    data: TraceSchema,
                }),
                z.object({
                    encoded: z.boolean().refine(() => true),
                    data: z.string(),
                })
            ]).parse(JSON.parse(data));

            if (parsed.encoded) {
                return new Trace(
                    decodeTrace(parsed.data),
                );
            } else {
                return new Trace(
                    parsed.data as TraceArray,
                );
            }
        });
    }

    constructor(
        public readonly data: TraceArray
    ) {}


    serialize(encode: boolean) {
        return JSON.stringify({
            encoded: encode,
            trace: encode ? encodeTrace(this.data) : this.data,
        });
    }

    getAverageVelocity() {}

    expand() {
        return new Trace([]);
    }

    reduce() {
        return new Trace([]);
    }

    filterAction() {
        return new Trace([]);
    }

    secondsNotMoving() {}
}


export class YearInfo {
    test(): string {
        return 'test';
    }

    getContribution(trace: Trace): number {
        return 0;
    }
}

export class Year2025 extends YearInfo {
    getCoralL1() {
        return 0;
    }
}


export class Year2024 extends YearInfo {
    getNotes() {
        return 0;
    }
}

// traces
// zones



const t = new Trace();
t.timesEnteredZone(new Zone());
t.timeInZone(new Zone());
t.histogram();

const z = new Zone();
z.timesEntered(new Trace());


t.getAverageVelocity();
t.expand(); // expands the trace to duplicated points
t.section('auto'); // return new trace or something
t.filterAction();
t.secondsNotMoving();

const mt = new MultiTrace(...traces);
mt.histogram();