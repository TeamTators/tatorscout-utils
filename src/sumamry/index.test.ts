import { describe, expect, test } from "vitest";
import { Summary, SummarySchema } from "./index";

describe("sumamry ranking metrics", () => {
    const schema = {
        performance: {
            output: ({ scoring }: { scoring: number[] }) => scoring,
        },
    } satisfies SummarySchema<number>;

    const summary = new Summary<number, typeof schema>(() => 0, schema);

    const computed = summary.deserialize(JSON.stringify({
        schema: {
            "1": {
                performance: {
                    output: [10, 10],
                },
            },
            "2": {
                performance: {
                    output: [12, 0],
                },
            },
            "3": {
                performance: {
                    output: [8, 8],
                },
            },
        },
    })).unwrap();

    test("keeps default average ranking behavior", () => {
        expect(computed.rank("performance", "output")).toEqual([1, 3, 2]);
        expect(computed.team(2).rank("performance", "output")).toBe(3);
        expect(computed.teamRank(2, "performance", "output")).toBe(3);
    });

    test("supports selecting alternate rank metrics", () => {
        expect(computed.rank("performance", "output", "max")).toEqual([2, 1, 3]);
        expect(computed.team(2).rank("performance", "output", "max")).toBe(1);
        expect(computed.teamRank(2, "performance", "output", "coefficientOfVariation")).toBe(1);
    });
});
