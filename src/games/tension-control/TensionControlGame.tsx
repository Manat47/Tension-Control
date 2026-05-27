import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculatePatternResult,
  calculateSummary,
  clamp,
  createPatternOrder,
  getPatternForce,
  getPatternImpulse,
  getPatternPhysicsModifiers,
} from "./tensionControl.logic";
import type {
  GamePhase,
  PatternResult,
  StabilityPattern,
  StabilitySample,
  StabilitySummary,
  TestResult,
} from "./tensionControl.types";

const SAFE_ZONE_MIN = -5;
const SAFE_ZONE_MAX = 5;
const DANGER_THRESHOLD = 40;
const BASE_PLAYER_FORCE = 300;
const BASE_MAX_VELOCITY = 220;

const introPatterns = [
  [
    "Kick",
    "A hard kick throws the marker out. The rail turns heavy, so hold long to recover.",
  ],
  [
    "Constant Pull",
    "A clear one-way pull keeps dragging the marker. Hold against it and manage overshoot.",
  ],
  [
    "Wave Pull",
    "A strong wave sweeps the marker left and right beyond the safe center.",
  ],
  ["Slippery", "Controls are hyper-sensitive. Tiny inputs cause big movement."],
  [
    "Momentum",
    "Inertia: once moving, hard to stop. Brake with the opposite key.",
  ],
  [
    "Wind Burst",
    "Strong wind gusts arrive in visible waves. Recover between each gust.",
  ],
];

const formatPercent = (value: number) =>
  `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
const formatNumber = (value: number) => value.toFixed(1);
const formatRecovery = (value: number | null) =>
  value === null ? "N/A" : `${Math.round(value)} ms`;
const getSafePatternIndex = (index: number, total: number) => {
  if (total <= 0 || !Number.isFinite(index)) {
    return 0;
  }

  return Math.min(Math.max(Math.floor(index), 0), total - 1);
};
const getScoreTone = (score: number) => {
  if (score >= 75) {
    return "score-high";
  }
  if (score >= 45) {
    return "score-mid";
  }
  return "score-low";
};

export function TensionControlGame() {
  const [phase, setPhase] = useState<GamePhase>("intro");
  const [patterns, setPatterns] = useState<StabilityPattern[]>(() =>
    createPatternOrder(),
  );
  const [currentPatternIndex, setCurrentPatternIndex] = useState(0);
  const [patternResults, setPatternResults] = useState<PatternResult[]>([]);
  const [summary, setSummary] = useState<StabilitySummary | null>(null);
  const [position, setPosition] = useState(0);
  const [velocity, setVelocity] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timeInZonePercent, setTimeInZonePercent] = useState(0);
  const [liveMaxDrift, setLiveMaxDrift] = useState(0);
  const [isHoldingLeft, setIsHoldingLeft] = useState(false);
  const [isHoldingRight, setIsHoldingRight] = useState(false);

  const positionRef = useRef(0);
  const velocityRef = useRef(0);
  const leftHeldRef = useRef(false);
  const rightHeldRef = useRef(false);
  const startTimeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const segmentSamplesRef = useRef<StabilitySample[]>([]);
  const sessionSamplesRef = useRef<StabilitySample[]>([]);
  const zoneTimeRef = useRef(0);
  const startedAtRef = useRef("");
  const completedResultsRef = useRef<PatternResult[]>([]);
  const currentPatternIndexRef = useRef(0);

  const activePatternIndex = getSafePatternIndex(
    currentPatternIndex,
    patterns.length,
  );
  const currentPattern = patterns[activePatternIndex];

  const stopLoop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  useEffect(() => {
    if (phase !== "playing") {
      leftHeldRef.current = false;
      rightHeldRef.current = false;
      setIsHoldingLeft(false);
      setIsHoldingRight(false);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        leftHeldRef.current = true;
        setIsHoldingLeft(true);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        rightHeldRef.current = true;
        setIsHoldingRight(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        leftHeldRef.current = false;
        setIsHoldingLeft(false);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        rightHeldRef.current = false;
        setIsHoldingRight(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      leftHeldRef.current = false;
      rightHeldRef.current = false;
    };
  }, [phase]);

  useEffect(() => {
    if (phase === "playing" && patterns.length === 0) {
      setPatterns(createPatternOrder());
      setCurrentPatternIndex(0);
      currentPatternIndexRef.current = 0;
    }
  }, [phase, patterns.length]);

  useEffect(() => {
    if (phase !== "playing" || patterns.length === 0) {
      stopLoop();
      return;
    }

    const finalizePattern = (patternIndex: number) => {
      const pattern = patterns[patternIndex];
      if (!pattern || completedResultsRef.current[patternIndex]) {
        return;
      }

      const result = calculatePatternResult(segmentSamplesRef.current, pattern);
      const completedResults = [...completedResultsRef.current, result];
      completedResultsRef.current = completedResults;
      setPatternResults(completedResults);
      segmentSamplesRef.current = [];
    };

    startTimeRef.current = performance.now();
    lastFrameRef.current = startTimeRef.current;
    positionRef.current = 0;
    velocityRef.current = 0;
    segmentSamplesRef.current = [];
    sessionSamplesRef.current = [];
    zoneTimeRef.current = 0;
    currentPatternIndexRef.current = 0;
    setCurrentPatternIndex(0);
    setPosition(0);
    setVelocity(0);
    setElapsedMs(0);
    setTimeInZonePercent(0);
    setLiveMaxDrift(0);

    const totalDurationMs = patterns.reduce(
      (sum, pattern) => sum + pattern.durationMs,
      0,
    );

    const step = (frameTime: number) => {
      const deltaMs = frameTime - lastFrameRef.current;
      lastFrameRef.current = frameTime;
      const previousTotalElapsed = Math.min(
        frameTime - deltaMs - startTimeRef.current,
        totalDurationMs,
      );
      const currentTotalElapsed = Math.min(
        frameTime - startTimeRef.current,
        totalDurationMs,
      );
      const nextPatternIndex = getSafePatternIndex(
        Math.floor(currentTotalElapsed / patterns[0].durationMs),
        patterns.length,
      );

      if (nextPatternIndex !== currentPatternIndexRef.current) {
        finalizePattern(currentPatternIndexRef.current);
        currentPatternIndexRef.current = nextPatternIndex;
        setCurrentPatternIndex(nextPatternIndex);
      }

      const safePatternIndex = getSafePatternIndex(
        currentPatternIndexRef.current,
        patterns.length,
      );
      currentPatternIndexRef.current = safePatternIndex;
      const activePattern = patterns[safePatternIndex];
      const segmentStartMs = safePatternIndex * activePattern.durationMs;
      const segmentElapsedMs = currentTotalElapsed - segmentStartMs;
      const previousSegmentElapsedMs = Math.max(
        0,
        previousTotalElapsed - segmentStartMs,
      );
      const deltaSeconds = deltaMs / 1000;

      const inputDirection =
        (rightHeldRef.current ? 1 : 0) - (leftHeldRef.current ? 1 : 0);
      const physics = getPatternPhysicsModifiers(activePattern);
      const playerForce =
        inputDirection * BASE_PLAYER_FORCE * physics.playerForceMultiplier;
      const disturbanceForce = getPatternForce(
        activePattern,
        segmentElapsedMs,
        positionRef.current,
        velocityRef.current,
      );

      let nextVelocity =
        velocityRef.current +
        (playerForce + disturbanceForce) * deltaSeconds +
        getPatternImpulse(
          activePattern,
          previousSegmentElapsedMs,
          segmentElapsedMs,
        );
      const maxVelocity = BASE_MAX_VELOCITY * physics.maxVelocityMultiplier;
      nextVelocity = clamp(nextVelocity, -maxVelocity, maxVelocity);
      nextVelocity *= physics.dampingFactor;

      const nextPosition = clamp(
        positionRef.current + nextVelocity * deltaSeconds,
        -100,
        100,
      );
      const inSafeZone =
        nextPosition >= SAFE_ZONE_MIN && nextPosition <= SAFE_ZONE_MAX;

      if (inSafeZone) {
        zoneTimeRef.current += deltaMs;
      }

      const sample: StabilitySample = {
        patternId: activePattern.id,
        timeMs: segmentElapsedMs,
        position: nextPosition,
        velocity: nextVelocity,
        inSafeZone,
        distanceFromCenter: Math.abs(nextPosition),
      };

      segmentSamplesRef.current.push(sample);
      sessionSamplesRef.current.push(sample);

      setElapsedMs(segmentElapsedMs);
      setTimeInZonePercent(
        currentTotalElapsed > 0
          ? (zoneTimeRef.current / currentTotalElapsed) * 100
          : 0,
      );
      setLiveMaxDrift((current) => Math.max(current, Math.abs(nextPosition)));
      setPosition(nextPosition);
      setVelocity(nextVelocity);
      positionRef.current = nextPosition;
      velocityRef.current = nextVelocity;

      if (currentTotalElapsed >= totalDurationMs) {
        finalizePattern(currentPatternIndexRef.current);
        const finalResults = completedResultsRef.current;
        const finalSummary = calculateSummary(finalResults);
        setPatternResults(finalResults);
        finishTest(finalSummary);
        stopLoop();
        return;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      stopLoop();
    };
  }, [phase, patterns]);

  const startTest = () => {
    const order = createPatternOrder();
    stopLoop();
    setPatterns(order);
    setCurrentPatternIndex(0);
    setPatternResults([]);
    setSummary(null);
    setPosition(0);
    setVelocity(0);
    setElapsedMs(0);
    setTimeInZonePercent(0);
    setLiveMaxDrift(0);
    setIsHoldingLeft(false);
    setIsHoldingRight(false);
    positionRef.current = 0;
    velocityRef.current = 0;
    leftHeldRef.current = false;
    rightHeldRef.current = false;
    segmentSamplesRef.current = [];
    sessionSamplesRef.current = [];
    zoneTimeRef.current = 0;
    completedResultsRef.current = [];
    currentPatternIndexRef.current = 0;
    startedAtRef.current = new Date().toISOString();
    setPhase("playing");
  };

  const finishTest = (finalSummary: StabilitySummary) => {
    const endedAt = new Date().toISOString();
    const testResult: TestResult = {
      testId: "stability-control",
      score: finalSummary.score,
      unit: "points",
      metrics: {
        overallTimeInSafeZonePercent: finalSummary.overallTimeInSafeZonePercent,
        averageDistanceFromCenter: finalSummary.averageDistanceFromCenter,
        maxDeviation: finalSummary.maxDeviation,
        averageRecoveryTimeMs: finalSummary.averageRecoveryTimeMs ?? "N/A",
        totalOvercorrectionCount: finalSummary.totalOvercorrectionCount,
        totalPatterns: finalSummary.totalPatterns,
      },
      startedAt: startedAtRef.current,
      endedAt,
    };

    console.log("Stability Control TestResult:", testResult);
    setSummary(finalSummary);
    setPhase("result");
  };

  const resetAll = () => {
    startTest();
  };

  const totalDurationMs = useMemo(
    () => patterns.reduce((sum, pattern) => sum + pattern.durationMs, 0),
    [patterns],
  );
  const sessionElapsedMs = useMemo(
    () =>
      patterns
        .slice(0, activePatternIndex)
        .reduce((sum, pattern) => sum + pattern.durationMs, 0) + elapsedMs,
    [activePatternIndex, elapsedMs, patterns],
  );
  const sessionTimeRemaining = Math.max(0, totalDurationMs - sessionElapsedMs);
  const sessionProgressPercent =
    totalDurationMs > 0
      ? clamp((sessionElapsedMs / totalDurationMs) * 100, 0, 100)
      : 0;
  const markerLeftPercent = useMemo(() => (position + 100) / 2, [position]);
  const safeZoneLeftPercent = ((SAFE_ZONE_MIN + 100) / 200) * 100;
  const safeZoneWidthPercent = ((SAFE_ZONE_MAX - SAFE_ZONE_MIN) / 200) * 100;
  const correctionCue =
    position >= SAFE_ZONE_MIN && position <= SAFE_ZONE_MAX
      ? "HOLD CENTER"
      : position < 0
        ? "PULL RIGHT"
        : "PULL LEFT";

  const statusLabel = useMemo(() => {
    if (position >= SAFE_ZONE_MIN && position <= SAFE_ZONE_MAX) {
      return "Safe";
    }
    if (position <= -DANGER_THRESHOLD) {
      return "Left Danger";
    }
    if (position >= DANGER_THRESHOLD) {
      return "Right Danger";
    }
    return position < 0 ? "Left Drift" : "Right Drift";
  }, [position]);

  return (
    <div className="stability-shell">
      <div className="stability-card">
        <header className="stability-header">
          {phase === "intro" && (
            <div className="eyebrow">Assessment Protocol</div>
          )}
          {phase === "result" && <div className="eyebrow">Test Complete</div>}
          <h1>Tension Control Test</h1>
          {phase === "intro" ? (
            <>
              <p>
                Use &larr; and &rarr; to counter the force and keep the marker
                near the center. The system will apply six different stability
                patterns during one continuous session.
              </p>
              <p className="stability-subtext">
                This test measures control stability, correction accuracy, and
                recovery under deterministic disturbance. Each pattern type has
                fixed behavior; only the order and direction are randomized.
              </p>
            </>
          ) : phase === "playing" ? (
            <p className="gameplay-hint">
              Keep the marker inside the safe center. Pull left or right to
              correct any drift.
            </p>
          ) : (
            <p className="gameplay-hint">
              Review your final score and restart to reshuffle the pattern
              order.
            </p>
          )}
        </header>

        {phase === "intro" && (
          <div className="stability-panel intro-panel">
            <div className="intro-pattern-grid">
              {introPatterns.map(([name, description]) => (
                <div className="intro-pattern-card" key={name}>
                  <strong>{name}</strong>
                  <span>{description}</span>
                </div>
              ))}
            </div>
            <button className="stability-button" onClick={startTest}>
              Start Test
            </button>
          </div>
        )}

        {phase === "playing" &&
          (currentPattern ? (
            <div className="stability-panel gameplay-panel">
              <div className="pattern-topline">
                <div>
                  <div className="stat-label">Session control</div>
                  <h2>Keep Centered</h2>
                </div>
                <div className="time-readout">
                  <span>Time left</span>
                  <strong>{(sessionTimeRemaining / 1000).toFixed(1)}</strong>
                </div>
              </div>

              <div className="session-progress" aria-label="Session progress">
                <span style={{ width: `${sessionProgressPercent}%` }} />
              </div>

              <div
                className={`correction-cue ${statusLabel === "Safe" ? "stable" : "drift"}`}
              >
                {correctionCue}
              </div>

              <div className="stability-bar-wrapper">
                <div className="bar-labels">
                  <span>LEFT DRIFT</span>
                  <strong>SAFE CENTER</strong>
                  <span>RIGHT DRIFT</span>
                </div>
                <div
                  className="stability-bar"
                  aria-label="Stability meter balance rail"
                >
                  <div className="rail-center-line" />
                  <div
                    className="safe-zone"
                    style={{
                      left: `${safeZoneLeftPercent}%`,
                      width: `${safeZoneWidthPercent}%`,
                    }}
                  />
                  <div
                    className="marker"
                    style={{ left: `${markerLeftPercent}%` }}
                  />
                </div>
                <div className="bar-legend">
                  <span>-100</span>
                  <span>position: {position.toFixed(1)}</span>
                  <span>+100</span>
                </div>
              </div>

              <div className="control-row">
                <span>Pull Left</span>
                <span className={isHoldingLeft ? "key active" : "key"}>
                  &larr;
                </span>
                <span className={isHoldingRight ? "key active" : "key"}>
                  &rarr;
                </span>
                <span>Pull Right</span>
              </div>

              <div
                className={`state-pill ${statusLabel === "Safe" ? "stable" : "drift"}`}
              >
                {statusLabel === "Safe" ? "STABLE" : statusLabel.toUpperCase()}
              </div>

              <div className="live-metrics">
                <div className="live-metric">
                  <span>Safe Time</span>
                  <strong>{formatPercent(timeInZonePercent)}</strong>
                </div>
                <div className="live-metric">
                  <span>Current Error</span>
                  <strong>{formatNumber(Math.abs(position))}</strong>
                </div>
                <div className="live-metric">
                  <span>Max Drift</span>
                  <strong>{formatNumber(liveMaxDrift)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="stability-panel gameplay-panel">
              <div className="pattern-description">
                Preparing stability patterns...
              </div>
              <button className="stability-button" onClick={startTest}>
                Start Test
              </button>
            </div>
          ))}

        {phase === "result" && summary && (
          <div
            className={`stability-panel result-panel ${getScoreTone(summary.score)}`}
          >
            <div className="result-summary">
              <div>
                <div className="result-title">Overall Score</div>
                <span className="result-score">{summary.score}</span>
                <span className="result-unit">pts</span>
              </div>
            </div>
            <div className="result-grid">
              <div className="result-item">
                <span>Safe zone time</span>
                <strong>
                  {formatPercent(summary.overallTimeInSafeZonePercent)}
                </strong>
              </div>
              <div className="result-item">
                <span>Average distance</span>
                <strong>
                  {formatNumber(summary.averageDistanceFromCenter)}
                </strong>
              </div>
              <div className="result-item">
                <span>Max deviation</span>
                <strong>{formatNumber(summary.maxDeviation)}</strong>
              </div>
              <div className="result-item">
                <span>Average recovery</span>
                <strong>{formatRecovery(summary.averageRecoveryTimeMs)}</strong>
              </div>
              <div className="result-item">
                <span>Overcorrections</span>
                <strong>{summary.totalOvercorrectionCount}</strong>
              </div>
              <div className="result-item">
                <span>Patterns completed</span>
                <strong>{summary.totalPatterns}</strong>
              </div>
            </div>
            <div className="pattern-table-wrap">
              <table className="result-table">
                <thead>
                  <tr>
                    <th>Pattern</th>
                    <th>Score</th>
                    <th>Safe %</th>
                    <th>Avg dist</th>
                    <th>Max dev</th>
                    <th>Recovery</th>
                    <th>Overcorrections</th>
                  </tr>
                </thead>
                <tbody>
                  {patternResults.map((result) => (
                    <tr
                      className={getScoreTone(result.patternScore)}
                      key={result.patternId}
                    >
                      <td>{result.patternName}</td>
                      <td>{result.patternScore}</td>
                      <td>{formatPercent(result.timeInSafeZonePercent)}</td>
                      <td>{formatNumber(result.averageDistanceFromCenter)}</td>
                      <td>{formatNumber(result.maxDeviation)}</td>
                      <td>{formatRecovery(result.recoveryTimeMs)}</td>
                      <td>{result.overcorrectionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="restart-container">
              <button className="stability-button" onClick={resetAll}>
                Restart Test
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
