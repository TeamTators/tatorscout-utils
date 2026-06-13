import { describe, expect, test } from "vitest";
import { Summary, SummarySchema } from "./index";

describe("sumamry ranking metrics", () => {
    const schema = {
        performanceOutput: ({ scoring }: { scoring: number[] }) => scoring,
    } satisfies SummarySchema<number>;

    const summary = new Summary<number, typeof schema>(() => 0, schema);

    const computed = summary.deserialize(JSON.stringify({
        schema: {
            "1": {
                performanceOutput: [10, 10],
            },
            "2": {
                performanceOutput: [12, 0],
            },
            "3": {
                performanceOutput: [8, 8],
            },
        },
    })).unwrap();

    test("keeps default average ranking behavior", () => {
        expect(computed.rank("performanceOutput")).toEqual([1, 3, 2]);
        expect(computed.team(2).rank("performanceOutput")).toBe(3);
        expect(computed.teamRank(2, "performanceOutput")).toBe(3);
    });

    test("supports selecting alternate rank metrics", () => {
        expect(computed.rank("performanceOutput", "max")).toEqual([2, 1, 3]);
        expect(computed.team(2).rank("performanceOutput", "max")).toBe(1);
        expect(computed.teamRank(2, "performanceOutput", "coefficientOfVariation")).toBe(1);
    });
});
