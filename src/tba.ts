import { z } from 'zod';


export const EventSchema = z.object({
  key: z.string(),
  name: z.string(),
  event_code: z.string(),
  event_type: z.number(),
  district: z
    .object({
      abbreviation: z.string(),
      display_name: z.string(),
      key: z.string(),
    })
    .nullable(),
  city: z.string().nullable(),
  state_prov: z.string().nullable(),
  country: z.string().nullable(),
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
  school_name: z.string().nullable(),
  city: z.string().nullable(),
  state_prov: z.string().nullable(),
  country: z.string().nullable(),
  // Add other fields as necessary
});

export type TBATeam = z.infer<typeof TeamSchema>;

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