export type GamePhase = "intro" | "playing" | "result";

export type PatternType =
  | "kick"
  | "constant-pull"
  | "wave-pull"
  | "slippery"
  | "momentum"
  | "wind-burst";

export type StabilityPattern = {
  id: PatternType;
  name: string;
  description: string;
  durationMs: number;
  mirrorDirection?: 1 | -1;
};

export type StabilitySample = {
  patternId: PatternType;
  timeMs: number;
  position: number;
  velocity: number;
  inSafeZone: boolean;
  distanceFromCenter: number;
};

export type PatternResult = {
  patternId: PatternType;
  patternName: string;
  patternScore: number;
  timeInSafeZonePercent: number;
  averageDistanceFromCenter: number;
  maxDeviation: number;
  recoveryTimeMs: number | null;
  overcorrectionCount: number;
};

export type StabilitySummary = {
  score: number;
  overallTimeInSafeZonePercent: number;
  averageDistanceFromCenter: number;
  maxDeviation: number;
  averageRecoveryTimeMs: number | null;
  totalOvercorrectionCount: number;
  totalPatterns: number;
};

export type TestResult = {
  testId: string;
  score: number;
  unit: "points";
  metrics: Record<string, number | string | boolean>;
  startedAt: string;
  endedAt: string;
};
