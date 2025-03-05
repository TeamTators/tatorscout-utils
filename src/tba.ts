import { z } from 'zod';

// these are the only keys we care about
export const EventSchema = z.object({
  key: z.string(),
  name: z.string(),
  start_date: z.string(), // Consider using z.date() if parsing dates
  end_date: z.string(),   // Consider using z.date() if parsing dates
  year: z.number(),
  // Add other fields as necessary
});

export type TBAEvent = z.infer<typeof EventSchema>;

// Team Schema
export const TeamSchema = z.object({
  key: z.string(),
  team_number: z.number(),
  nickname: z.string().nullable(),
  name: z.string().nullable(),
});

export type TBATeam = z.infer<typeof TeamSchema>;

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

export type TBAMedia = z.infer<typeof MediaSchema>;

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

export type TBATeamEventStatus = z.infer<typeof TeamEventStatusSchema>;

// Match Schema
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
  }).nullable()
});

export type TBAMatch = z.infer<typeof MatchSchema>;

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

export type CompLevel = 'qm' | 'qf' | 'sf' | 'f' | 'pr';
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