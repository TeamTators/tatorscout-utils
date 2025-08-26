import { attempt } from 'ts-utils/check';
import { z } from 'zod';


type YearActions = '';

type Action = YearActions | 0;

type TraceArray = TracePoint[];
type TracePoint = [number, number, number, Action];

const encodeTrace = (trace: string) => {}
const decodeTrace = (trace: TraceArray) => {};



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
                )
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

export interface YearInfo {
    getAlliance(trace: Trace): 'red' | 'blue';
    summarize(trace: { trace: Trace, alliance: 'red' | 'blue' }): {
        title: string;
        labels: string[];
        data: number[]
    }[];
}


export class Year2025 implements YearInfo {}