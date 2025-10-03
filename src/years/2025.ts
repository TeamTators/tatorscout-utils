import { YearInfo } from ".";
import { Trace } from "..";

class YearInfo2025 extends YearInfo {
    getContribution(trace: Trace, match, teamNumber): number {
        return 0.9;
    }
}

export default new YearInfo2025();

export type { YearInfo2025 };