import type {
  PatternResult,
  StabilityPattern,
  StabilitySample,
  StabilitySummary,
} from "./tensionControl.types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getPulseForce(elapsedMs: number, centerMs: number, widthMs: number, strength: number) {
  const distance = Math.abs(elapsedMs - centerMs);

  if (distance >= widthMs) {
    return 0;
  }

  return (1 - distance / widthMs) * strength;
}

export function createPatternOrder(): StabilityPattern[] {
  const definitions: Omit<StabilityPattern, "mirrorDirection">[] = [
    {
      id: "kick",
      name: "Kick",
      description: "A hard kick throws the marker out. The rail turns heavy, so recovery needs a long hold.",
      durationMs: 8000,
    },
    {
      id: "constant-pull",
      name: "Constant Pull",
      description: "A clear one-way pull keeps dragging the marker. Hold against it and manage overshoot.",
      durationMs: 8000,
    },
    {
      id: "wave-pull",
      name: "Wave Pull",
      description: "A strong wave sweeps the marker left and right beyond the safe center.",
      durationMs: 8000,
    },
    {
      id: "slippery",
      name: "Slippery",
      description: "Controls are sensitive and the rail keeps drifting under your marker.",
      durationMs: 8000,
    },
    {
      id: "momentum",
      name: "Momentum",
      description: "Inertia keeps the marker moving. Brake with the opposite key.",
      durationMs: 8000,
    },
    {
      id: "wind-burst",
      name: "Wind Burst",
      description: "Strong wind gusts arrive in visible waves. Recover between each gust.",
      durationMs: 8000,
    },
  ];

  return shuffleArray(
    definitions.map((pattern) => ({
      ...pattern,
      mirrorDirection: Math.random() < 0.5 ? 1 : -1,
    }))
  );
}

export function getPatternForce(
  pattern: StabilityPattern,
  elapsedMs: number,
  position: number,
  velocity: number
) {
  const direction = pattern.mirrorDirection ?? 1;
  const elapsedSeconds = elapsedMs / 1000;

  switch (pattern.id) {
    case "kick": {
      const outwardPressure = elapsedMs < 1800 ? 82 : elapsedMs < 3600 ? 34 : 14;
      const heavyReturnDrag = elapsedMs > 900 && elapsedMs < 6200 ? -18 : 0;
      return (outwardPressure + heavyReturnDrag) * direction;
    }
    case "constant-pull": {
      const pressureStage =
        elapsedMs < 1800 ? 96 : elapsedMs < 3600 ? 130 : elapsedMs < 5600 ? 112 : 145;
      const pressureRipple = Math.sin(elapsedSeconds * 1.25 + 0.35) * 12;
      return (pressureStage + pressureRipple) * direction;
    }
    case "wave-pull": {
      return Math.sin(elapsedSeconds * 2.1 + 0.7) * 185 * direction;
    }
    case "wind-burst": {
      const gustTimes = [800, 1800, 3000, 4300, 5700, 6900];
      const gustForce = gustTimes.reduce(
        (total, gustTime) => total + getPulseForce(elapsedMs, gustTime, 420, 125),
        0
      );
      const windDrift = Math.sin(elapsedSeconds * 1.4 + 0.35) * 38 + 14;
      return (gustForce + windDrift) * direction;
    }
    case "slippery": {
      const centerFactor = clamp(1 - Math.abs(position) / 8, 0, 1);
      const stillFactor = clamp(1 - Math.abs(velocity) / 28, 0, 1);
      const breakawayForce = 32 * centerFactor * stillFactor;
      return (Math.sin(elapsedSeconds * 2.3 + 0.4) * 50 + 14 + breakawayForce) * direction;
    }
    case "momentum": {
      return (elapsedMs < 2500 ? 42 : Math.sin(elapsedSeconds * 1.25 + 0.4) * 24) * direction;
    }
    default:
      return 0;
  }
}

export function getPatternImpulse(
  pattern: StabilityPattern,
  previousElapsedMs: number,
  elapsedMs: number
) {
  const direction = pattern.mirrorDirection ?? 1;

  if (pattern.id === "kick") {
      const shocks = [
      { timeMs: 250, strength: 180 },
      { timeMs: 1250, strength: 95 },
      { timeMs: 3200, strength: -42 },
      { timeMs: 5600, strength: 68 },
    ];
    return shocks.reduce((total, shock) => {
      if (previousElapsedMs < shock.timeMs && elapsedMs >= shock.timeMs) {
        return total + shock.strength * direction;
      }
      return total;
    }, 0);
  }

  if (pattern.id === "wind-burst") {
    const burstTimes = [800, 1800, 3000, 4300, 5700, 6900];
    const impulseCount = burstTimes.filter(
      (burstTime) => previousElapsedMs < burstTime && elapsedMs >= burstTime
    ).length;

    return impulseCount * 72 * direction;
  }

  if (pattern.id === "momentum") {
    return previousElapsedMs < 350 && elapsedMs >= 350 ? 70 * direction : 0;
  }

  return 0;
}

export function getPatternPhysicsModifiers(pattern: StabilityPattern) {
  switch (pattern.id) {
    case "kick":
      return {
        playerForceMultiplier: 0.52,
        dampingFactor: 0.985,
        maxVelocityMultiplier: 0.72,
      };
    case "slippery":
      return {
        playerForceMultiplier: 1.55,
        dampingFactor: 0.975,
        maxVelocityMultiplier: 1.15,
      };
    case "momentum":
      return {
        playerForceMultiplier: 1.0,
        dampingFactor: 0.992,
        maxVelocityMultiplier: 1.25,
      };
    default:
      return {
        playerForceMultiplier: 1.0,
        dampingFactor: 0.94,
        maxVelocityMultiplier: 1.0,
      };
  }
}

export function calculatePatternResult(
  samples: StabilitySample[],
  pattern: StabilityPattern
): PatternResult {
  const durationMs = pattern.durationMs;

  if (samples.length === 0 || durationMs <= 0) {
    return {
      patternId: pattern.id,
      patternName: pattern.name,
      patternScore: 0,
      timeInSafeZonePercent: 0,
      averageDistanceFromCenter: 0,
      maxDeviation: 0,
      recoveryTimeMs: null,
      overcorrectionCount: 0,
    };
  }

  let timeInZoneMs = 0;
  let distanceSum = 0;
  let maxDeviation = 0;
  let majorDisturbanceTime: number | null = null;
  let recoveryTimeMs: number | null = null;
  let overcorrectionCount = 0;
  let lastSide: "left" | "right" | "center" = "center";

  for (let i = 0; i < samples.length; i += 1) {
    const current = samples[i];
    const next = samples[i + 1];
    const duration = next ? next.timeMs - current.timeMs : durationMs - current.timeMs;
    const distance = current.distanceFromCenter;
    const side = current.position <= -10 ? "left" : current.position >= 10 ? "right" : "center";

    if (current.inSafeZone) {
      timeInZoneMs += duration;
    }

    distanceSum += distance;
    maxDeviation = Math.max(maxDeviation, distance);

    if (majorDisturbanceTime === null && distance >= 20) {
      majorDisturbanceTime = current.timeMs;
    }

    if (majorDisturbanceTime !== null && recoveryTimeMs === null && current.inSafeZone) {
      recoveryTimeMs = current.timeMs - majorDisturbanceTime;
    }

    if (lastSide === "left" && side === "right") {
      overcorrectionCount += 1;
    }
    if (lastSide === "right" && side === "left") {
      overcorrectionCount += 1;
    }

    if (side !== "center") {
      lastSide = side;
    }
  }

  if (majorDisturbanceTime !== null && recoveryTimeMs === null) {
    recoveryTimeMs = durationMs - majorDisturbanceTime;
  }

  const timeInSafeZonePercent = Number(((timeInZoneMs / durationMs) * 100).toFixed(1));
  const averageDistanceFromCenter = Number((distanceSum / samples.length).toFixed(1));
  const distanceScore = clamp(100 - averageDistanceFromCenter * 2, 0, 100);
  const recoveryScore = recoveryTimeMs === null ? 100 : clamp(100 - recoveryTimeMs / 40, 0, 100);
  const overcorrectionScore = clamp(100 - overcorrectionCount * 10, 0, 100);
  const patternScore = Math.round(
    timeInSafeZonePercent * 0.4 +
      distanceScore * 0.3 +
      recoveryScore * 0.2 +
      overcorrectionScore * 0.1
  );

  return {
    patternId: pattern.id,
    patternName: pattern.name,
    patternScore,
    timeInSafeZonePercent,
    averageDistanceFromCenter,
    maxDeviation: Number(maxDeviation.toFixed(1)),
    recoveryTimeMs,
    overcorrectionCount,
  };
}

export function calculateSummary(results: PatternResult[]): StabilitySummary {
  if (results.length === 0) {
    return {
      score: 0,
      overallTimeInSafeZonePercent: 0,
      averageDistanceFromCenter: 0,
      maxDeviation: 0,
      averageRecoveryTimeMs: null,
      totalOvercorrectionCount: 0,
      totalPatterns: 0,
    };
  }

  const totalPatterns = results.length;
  const totalScore = results.reduce((sum, item) => sum + item.patternScore, 0);
  const overallTimeInSafeZonePercent = Number(
    (
      results.reduce((sum, item) => sum + item.timeInSafeZonePercent, 0) /
      totalPatterns
    ).toFixed(1)
  );
  const averageDistanceFromCenter = Number(
    (
      results.reduce((sum, item) => sum + item.averageDistanceFromCenter, 0) /
      totalPatterns
    ).toFixed(1)
  );
  const maxDeviation = Number(
    Math.max(...results.map((item) => item.maxDeviation)).toFixed(1)
  );
  const recoveryTimes = results
    .map((item) => item.recoveryTimeMs)
    .filter((time): time is number => time !== null);
  const averageRecoveryTimeMs = recoveryTimes.length
    ? Math.round(recoveryTimes.reduce((sum, value) => sum + value, 0) / recoveryTimes.length)
    : null;
  const totalOvercorrectionCount = results.reduce(
    (sum, item) => sum + item.overcorrectionCount,
    0
  );

  return {
    score: Math.round(totalScore / totalPatterns),
    overallTimeInSafeZonePercent,
    averageDistanceFromCenter,
    maxDeviation,
    averageRecoveryTimeMs,
    totalOvercorrectionCount,
    totalPatterns,
  };
}
