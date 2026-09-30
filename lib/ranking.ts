export const STARTING_POINTS = 1000;
export const K_FACTOR = 40;
export const MVP_BONUS = 5;
export const MAX_GAIN = 40;
export const MAX_LOSS = -35;

export function expectedScore(myRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
}

export function calcTeamAvg(ratings: number[]): number {
  if (ratings.length === 0) return STARTING_POINTS;
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

export interface PointResult {
  userId: string;
  delta: number;
}

export function calcMatchPoints(
  teamA: { userId: string; points: number }[],
  teamB: { userId: string; points: number }[],
  winnerTeam: "A" | "B",
  mvpUserId: string | null
): PointResult[] {
  const avgA = calcTeamAvg(teamA.map((p) => p.points));
  const avgB = calcTeamAvg(teamB.map((p) => p.points));

  const expectedA = expectedScore(avgA, avgB);
  const expectedB = 1 - expectedA;

  const actualA = winnerTeam === "A" ? 1 : 0;
  const actualB = winnerTeam === "B" ? 1 : 0;

  const rawDeltaA = Math.round(K_FACTOR * (actualA - expectedA));
  const rawDeltaB = Math.round(K_FACTOR * (actualB - expectedB));

  const clampedDeltaA = Math.max(MAX_LOSS, Math.min(MAX_GAIN, rawDeltaA));
  const clampedDeltaB = Math.max(MAX_LOSS, Math.min(MAX_GAIN, rawDeltaB));

  const results: PointResult[] = [];

  for (const player of teamA) {
    let delta = clampedDeltaA;
    if (winnerTeam === "A" && mvpUserId === player.userId) {
      delta = Math.min(MAX_GAIN, delta + MVP_BONUS);
    }
    results.push({ userId: player.userId, delta });
  }

  for (const player of teamB) {
    let delta = clampedDeltaB;
    if (winnerTeam === "B" && mvpUserId === player.userId) {
      delta = Math.min(MAX_GAIN, delta + MVP_BONUS);
    }
    results.push({ userId: player.userId, delta });
  }

  return results;
}
