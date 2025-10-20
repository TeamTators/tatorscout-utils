import { z } from 'zod';

/**
 * Zod schema for validating TBA (The Blue Alliance) event data
 * Defines the structure of FRC event information
 */
export const EventSchema = z.object({
  key: z.string(),
  name: z.string(),
  start_date: z.string(), // Consider using z.date() if parsing dates
  end_date: z.string(),   // Consider using z.date() if parsing dates
  year: z.number(),
  // Add other fields as necessary
});

/**
 * TypeScript type for FRC event data from The Blue Alliance
 * @typedef {TBAEvent}
 */
export type TBAEvent = z.infer<typeof EventSchema>;

/**
 * Zod schema for validating TBA team data
 * Defines the structure of FRC team information
 */
export const TeamSchema = z.object({
  key: z.string(),
  team_number: z.number(),
  nickname: z.string().nullable(),
  name: z.string().nullable(),
});

/**
 * TypeScript type for FRC team data from The Blue Alliance
 * @typedef {TBATeam}
 */
export type TBATeam = z.infer<typeof TeamSchema>;

/**
 * Zod schema for validating TBA media data (team photos, videos, etc.)
 */
export const MediaSchema = z.object({
    details: z.object({
        base64Image: z.string().optional(),
    }),
    direct_url: z.string(),
    foreign_key: z.string(),
    preferred: z.boolean(),
    team_keys: z.array(z.string()),
    view_url: z.string(),
    type: z.string(),
});

/**
 * TypeScript type for TBA media data
 * @typedef {TBAMedia}
 */
export type TBAMedia = z.infer<typeof MediaSchema>;

/**
 * Zod schema for validating team event status data
 * Includes qualification and playoff records
 */
export const TeamEventStatusSchema = z.object({
    playoff: z.object({
        record: z.object({
            losses: z.number(),
            wins: z.number(),
            ties: z.number(),
        }),
        status: z.string(),
        level: z.string().nullable(),
        current_level_record: z.object({
            losses: z.number(),
            wins: z.number(),
            ties: z.number(),
        })
    }).optional().nullable(),
    qual: z.object({
        ranking: z.object({
            rank: z.number(),
            record: z.object({
                losses: z.number(),
                wins: z.number(),
                ties: z.number(),
            }),
        }),
    }).optional().nullable(),
});

/**
 * TypeScript type for team event status data
 * @typedef {TBATeamEventStatus}
 */
export type TBATeamEventStatus = z.infer<typeof TeamEventStatusSchema>;

/**
 * Zod schema for validating TBA match data
 * Defines the structure of FRC match information including alliances, scores, and timing
 */
export const MatchSchema = z.object({
  key: z.string(),
  comp_level: z.string(),
  set_number: z.number(),
  match_number: z.number(),
  alliances: z.object({
    red: z.object({
      score: z.number().nullable(),
      team_keys: z.array(z.string()),
    }),
    blue: z.object({
      score: z.number().nullable(),
      team_keys: z.array(z.string()),
    }),
  }),
  event_key: z.string(),
  time: z.number().nullable(),
  predicted_time: z.number().nullable(),
  actual_time: z.number().nullable(),
  // Add other fields as necessary
  score_breakdown: z.object({
    red: z.unknown(),
    blue: z.unknown(),
  }).nullable(),
  videos: z.array(z.object({
    key: z.string(),
    type: z.string(),
  })).nullable().optional(),
  winning_alliance: z.string().nullable().optional(),
});

/**
 * TypeScript type for FRC match data from The Blue Alliance
 * @typedef {TBAMatch}
 */
export type TBAMatch = z.infer<typeof MatchSchema>;

/**
 * Extracts team numbers from a TBA match in alliance order
 * Returns [red1, red2, red3, blue1, blue2, blue3]
 * 
 * @param {TBAMatch} match - The match object to extract teams from
 * @returns {[number, number, number, number, number, number]} Array of 6 team numbers
 * 
 * @example
 * ```typescript
 * const teams = teamsFromMatch(match);
 * const [red1, red2, red3, blue1, blue2, blue3] = teams;
 * console.log(`Red alliance: ${red1}, ${red2}, ${red3}`);
 * ```
 */
export const teamsFromMatch = (match: TBAMatch): [number, number, number, number, number, number] => {
    const redTeams = match.alliances.red.team_keys.map((key) => parseInt(key.slice(3)));
    const blueTeams = match.alliances.blue.team_keys.map((key) => parseInt(key.slice(3)));
    return [
        redTeams[0],
        redTeams[1],
        redTeams[2],
        blueTeams[0],
        blueTeams[1],
        blueTeams[2],
    ];
};

/**
 * Valid FRC competition levels
 * @typedef {CompLevel}
 */
export type CompLevel = 'qm' | 'qf' | 'sf' | 'f' | 'pr';

/**
 * Sorts matches in proper competition order
 * Orders by competition level (qm -> qf -> sf -> f -> pr) then by match number
 * 
 * @param {TBAMatch} a - First match to compare
 * @param {TBAMatch} b - Second match to compare
 * @returns {number} Sort comparison result (-1, 0, 1)
 * 
 * @example
 * ```typescript
 * const sortedMatches = matches.sort(matchSort);
 * // Result: all qualifications first, then quarterfinals, etc.
 * ```
 */
export const matchSort = (a: TBAMatch, b: TBAMatch) => {
  if (a.comp_level === 'sf' && b.comp_level === 'sf') {
    return a.set_number - b.set_number;
  }
    const compLevelOrder: { [key in CompLevel]: number } = {
        qm: 0,
        qf: 1,
        sf: 2,
        f: 3,
        pr: 4,
    };

    const aOrder = compLevelOrder[a.comp_level as CompLevel];
    const bOrder = compLevelOrder[b.comp_level as CompLevel];

    if (aOrder !== bOrder) {
        return aOrder - bOrder;
    }

    return a.match_number - b.match_number;
};

/**
 * Comprehensive Zod schema for 2025 REEFSCAPE match data
 * Includes detailed score breakdown with coral placement, algae processing, and endgame scoring
 */
export const Match2025Schema = z.object({
	actual_time: z.number(),
	alliances: z.object({
		blue: z.object({
			dq_team_keys: z.array(z.unknown()),
			score: z.number(),
			surrogate_team_keys: z.array(z.unknown()),
			team_keys: z.array(z.string())
		}),
		red: z.object({
			dq_team_keys: z.array(z.unknown()),
			score: z.number(),
			surrogate_team_keys: z.array(z.unknown()),
			team_keys: z.array(z.string())
		})
	}),
	comp_level: z.string(),
	event_key: z.string(),
	key: z.string(),
	match_number: z.number(),
	post_result_time: z.number(),
	predicted_time: z.number(),
	score_breakdown: z.object({
		blue: z.object({
			adjustPoints: z.number(),
			algaePoints: z.number(),
			autoBonusAchieved: z.boolean(),
			autoCoralCount: z.number(),
			autoCoralPoints: z.number(),
			autoLineRobot1: z.string(),
			autoLineRobot2: z.string(),
			autoLineRobot3: z.string(),
			autoMobilityPoints: z.number(),
			autoPoints: z.number(),
			autoReef: z.object({
				botRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				midRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				tba_botRowCount: z.number(),
				tba_midRowCount: z.number(),
				tba_topRowCount: z.number(),
				topRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				trough: z.number()
			}),
			bargeBonusAchieved: z.boolean(),
			coopertitionCriteriaMet: z.boolean(),
			coralBonusAchieved: z.boolean(),
			endGameBargePoints: z.number(),
			endGameRobot1: z.string(),
			endGameRobot2: z.string(),
			endGameRobot3: z.string(),
			foulCount: z.number(),
			foulPoints: z.number(),
			g206Penalty: z.boolean(),
			g410Penalty: z.boolean(),
			g418Penalty: z.boolean(),
			g428Penalty: z.boolean(),
			netAlgaeCount: z.number(),
			rp: z.number(),
			techFoulCount: z.number(),
			teleopCoralCount: z.number(),
			teleopCoralPoints: z.number(),
			teleopPoints: z.number(),
			teleopReef: z.object({
				botRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				midRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				tba_botRowCount: z.number(),
				tba_midRowCount: z.number(),
				tba_topRowCount: z.number(),
				topRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				trough: z.number()
			}),
			totalPoints: z.number(),
			wallAlgaeCount: z.number()
		}),
		red: z.object({
			adjustPoints: z.number(),
			algaePoints: z.number(),
			autoBonusAchieved: z.boolean(),
			autoCoralCount: z.number(),
			autoCoralPoints: z.number(),
			autoLineRobot1: z.string(),
			autoLineRobot2: z.string(),
			autoLineRobot3: z.string(),
			autoMobilityPoints: z.number(),
			autoPoints: z.number(),
			autoReef: z.object({
				botRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				midRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				tba_botRowCount: z.number(),
				tba_midRowCount: z.number(),
				tba_topRowCount: z.number(),
				topRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				trough: z.number()
			}),
			bargeBonusAchieved: z.boolean(),
			coopertitionCriteriaMet: z.boolean(),
			coralBonusAchieved: z.boolean(),
			endGameBargePoints: z.number(),
			endGameRobot1: z.string(),
			endGameRobot2: z.string(),
			endGameRobot3: z.string(),
			foulCount: z.number(),
			foulPoints: z.number(),
			g206Penalty: z.boolean(),
			g410Penalty: z.boolean(),
			g418Penalty: z.boolean(),
			g428Penalty: z.boolean(),
			netAlgaeCount: z.number(),
			rp: z.number(),
			techFoulCount: z.number(),
			teleopCoralCount: z.number(),
			teleopCoralPoints: z.number(),
			teleopPoints: z.number(),
			teleopReef: z.object({
				botRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				midRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				tba_botRowCount: z.number(),
				tba_midRowCount: z.number(),
				tba_topRowCount: z.number(),
				topRow: z.object({
					nodeA: z.boolean(),
					nodeB: z.boolean(),
					nodeC: z.boolean(),
					nodeD: z.boolean(),
					nodeE: z.boolean(),
					nodeF: z.boolean(),
					nodeG: z.boolean(),
					nodeH: z.boolean(),
					nodeI: z.boolean(),
					nodeJ: z.boolean(),
					nodeK: z.boolean(),
					nodeL: z.boolean()
				}),
				trough: z.number()
			}),
			totalPoints: z.number(),
			wallAlgaeCount: z.number()
		})
	}),
	set_number: z.number(),
	time: z.number(),
	videos: z.array(z.object({ key: z.string(), type: z.string() })),
	winning_alliance: z.string()
});

/**
 * TypeScript type for detailed 2025 REEFSCAPE match data
 * Contains comprehensive scoring breakdown for coral, algae, and endgame activities
 * @typedef {TBAMatch2025}
 */
export type TBAMatch2025 = z.infer<typeof Match2025Schema>;