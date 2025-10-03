import { Trace } from "..";
import * as test from './2025';

export class YearInfo {
    test(): string {
        return 'test';
    }

    getContribution(trace: Trace): number {
        return 0;
    }

    areas: Record<string, [number, number][]> = {};
}