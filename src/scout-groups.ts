import { z } from 'zod';
import { type TBAMatch, type TBATeam } from './tba';

/**
 * Extracts team numbers from a TBA match object
 * Returns teams in alliance order: [red1, red2, red3, blue1, blue2, blue3]
 *
 * @param {TBAMatch} match - The Blue Alliance match object to destructure
 * @returns {[number, number, number, number, number, number]} Array of 6 team numbers
 * 
 * @example
 * ```typescript
 * const teams = destructureMatch(match);
 * // teams = [1234, 5678, 9012, 3456, 7890, 1357]
 * //          red1  red2  red3  blue1 blue2 blue3
 * 
 * const [red1, red2, red3, blue1, blue2, blue3] = teams;
 * ```
 */
export const destructureMatch = (
    match: TBAMatch
): [number, number, number, number, number, number] => {
    return [
        ...match.alliances.red.team_keys.map(t => parseInt(t.substring(3))),
        ...match.alliances.blue.team_keys.map(t => parseInt(t.substring(3)))
    ] as [number, number, number, number, number, number];
};

/**
 * Complete assignment of teams to scout groups and match responsibilities
 * Represents the output of scout group generation algorithm
 *
 * @typedef {Assignment}
 */
export type Assignment = {
    /** Array of 6 scout groups, each containing team numbers assigned to that position */
    groups: number[][];
    /** Match-by-match assignments for each scout position [red1, red2, red3, blue1, blue2, blue3] */
    matchAssignments: [
        number[],
        number[],
        number[],
        number[],
        number[],
        number[]
    ];
    /** Number of scheduling conflicts that had to be resolved */
    interferences: number;
};

/**
 * Zod schema for validating Assignment objects
 * Ensures proper structure of scout group assignments
 */
export const AssignmentSchema = z.object({
    groups: z.array(z.array(z.number())),
    matchAssignments: z.tuple([
        z.array(z.number()),
        z.array(z.number()),
        z.array(z.number()),
        z.array(z.number()),
        z.array(z.number()),
        z.array(z.number())
    ]),
    interferences: z.number()
});

/**
 * Generates optimal scout group assignments from teams and qualification matches
 * Distributes teams across 6 scout positions to minimize scheduling conflicts
 * 
 * Algorithm:
 * 1. Sorts teams and qualification matches by number
 * 2. Assigns teams to positions based on match participation
 * 3. Resolves conflicts by redistributing teams
 * 4. Ensures every match has a scout for each position
 *
 * @param {TBATeam[]} teams - All teams participating in the event
 * @param {TBAMatch[]} matches - All matches from the event (only qm matches used)
 * @returns {Assignment} Complete scout group assignment with conflict count
 * 
 * @example
 * ```typescript
 * const assignment = generateScoutGroups(eventTeams, eventMatches);
 * 
 * console.log(`Generated ${assignment.groups.length} scout groups`);
 * console.log(`Resolved ${assignment.interferences} scheduling conflicts`);
 * 
 * // Access specific scout group
 * const red1Teams = assignment.groups[0]; // Teams assigned to red alliance position 1
 * const red1Schedule = assignment.matchAssignments[0]; // Which teams scout which matches
 * ```
 */
export const generateScoutGroups = (
    teams: TBATeam[],
    matches: TBAMatch[]
): Assignment => {
    let interferences = 0;

    // only use qualification matches
    matches = matches
        .filter(m => m.comp_level === 'qm')
        .sort((a, b) => a.match_number - b.match_number);
    teams = teams.sort((a, b) => a.team_number - b.team_number);

    // unique teams for each scout group
    const scoutGroups: TBATeam[][] = new Array(6)
        .fill(0)
        .map(() => new Array<TBATeam>());

    const tempTeams: TBATeam[] = JSON.parse(JSON.stringify(teams)) as TBATeam[];

    for (const match of matches) {
        const mTeams = destructureMatch(match);

        for (let i = 0; i < mTeams.length; i++) {
            const team = tempTeams.find(t => t.team_number === mTeams[i]);
            if (team) {
                scoutGroups[i].push(team);
                tempTeams.splice(tempTeams.indexOf(team), 1);
            }
        }

        if (tempTeams.length === 0) break;
    }

    const conflicts = new Array(matches.length)
        .fill(0)
        .map(() => new Array<TBATeam>());

    const scoutLists = scoutGroups.map(scoutTeams => {
        return matches.map((m, mi) => {
            const mTeams = destructureMatch(m);
            const teams = scoutTeams.filter(t =>
                mTeams.includes(t.team_number)
            );

            const [t, ...rest] = teams;

            for (const r of rest) {
                conflicts[mi].push(r);
                interferences++;
            }

            return t;
        });
    });

    for (const scout of scoutLists) {
        scout.forEach((t, i) => {
            if (!t) {
                const t = conflicts[i].shift();
                if (!t) throw new Error('Failed to generate scout groups'); // should never happen
                scout[i] = t;
            }
        });
    }

    return {
        groups: scoutGroups.map(g => g.map(t => t.team_number)),
        matchAssignments: scoutLists.map(s => s.map(t => t.team_number)) as [
            number[],
            number[],
            number[],
            number[],
            number[],
            number[]
        ],
        interferences
    };
};

/**
 * Enumeration of possible assignment validation errors
 * Used by testAssignments to identify specific problems
 *
 * @typedef {AssignmentStatus}
 */
export type AssignmentStatus =
    | 'duplicate-in-group'
    | 'duplicate-between-groups'
    | 'incorrect-match-length'
    | 'missing-team-in-match'
    | 'duplicate-between-matches';

/**
 * Result of assignment validation with error details
 * Provides structured feedback on assignment validity
 *
 * @typedef {Status}
 */
export type Status =
    | {
          status: 'ok';
      }
    | {
          status: 'error';
          error: Error;
      }
    | {
          status: AssignmentStatus;
          data: unknown;
      };

/**
 * Validates a scout group assignment for correctness and completeness
 * Checks for common errors like duplicate assignments and missing scouts
 *
 * @param {Assignment} assignment - Assignment to validate
 * @returns {Status} Validation result with error details if any
 * 
 * @example
 * ```typescript
 * const assignment = generateScoutGroups(teams, matches);
 * const validation = testAssignments(assignment);
 * 
 * if (validation.status === 'ok') {
 *   console.log('Assignment is valid!');
 * } else if (validation.status === 'error') {
 *   console.error('Validation failed:', validation.error.message);
 * } else {
 *   console.warn(`Assignment issue: ${validation.status}`, validation.data);
 * }
 * ```
 */
export const testAssignments = (assignment: Assignment): Status => {
    // ensure no duplicates in scout lists
    const { groups, matchAssignments } = assignment;

    for (let i = 0; i < groups.length; i++) {
        // ensure all teams are unique
        const teams = groups[i];
        const unique = new Set(teams);
        if (unique.size !== teams.length) {
            return {
                status: 'duplicate-in-group',
                data: {
                    group: i
                }
            };
        }

        // ensure no duplicates between groups
        for (let j = 0; j < groups.length; j++) {
            if (i === j) continue;
            if (teams.some(t => groups[j].includes(t))) {
                return {
                    status: 'duplicate-between-groups',
                    data: {
                        group1: i,
                        group2: j
                    }
                };
            }
        }
    }

    // ensure all matches are the same length
    const isCorrectLength = matchAssignments.every(
        m => m.length === matchAssignments[0].length
    );
    if (!isCorrectLength) {
        return {
            status: 'incorrect-match-length',
            data: {
                expectedLength: matchAssignments[0].length,
                actualLengths: matchAssignments.map(m => m.length)
            }
        };
    }

    // ensure no teams are missing from matches
    for (let i = 0; i < matchAssignments.length; i++) {
        const matches = matchAssignments[i];
        // ensure a team is populated for each match
        if (matches.some(t => !t)) {
            return {
                status: 'missing-team-in-match',
                data: {
                    match: i
                }
            };
        }

        for (let j = 0; j < matchAssignments.length; j++) {
            if (i === j) continue;
            if (matches.some((t, i) => matchAssignments[j][i] === t)) {
                return {
                    status: 'duplicate-between-matches',
                    data: {
                        match1: i,
                        match2: j
                    }
                };
            }
        }
    }

    return {
        status: 'ok'
    };
};
