export const SEASONS = ['halloween', 'thanksgiving', 'christmas'] as const;
export type Season = (typeof SEASONS)[number];

const SEASON_BY_MONTH: ReadonlyMap<number, Season> = new Map([
  [9, 'halloween'],
  [10, 'thanksgiving'],
  [11, 'christmas'],
]);

export function getSeason(date: Date): Season | null {
  return SEASON_BY_MONTH.get(date.getMonth()) ?? null;
}

export function isSeason(value: string): value is Season {
  return (SEASONS as readonly string[]).includes(value);
}
