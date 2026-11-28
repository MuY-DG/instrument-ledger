import type {
  AqlStandardEdition,
  InspectionSeverity,
  SamplingPlanResult,
  SwitchingLotEvent,
  SwitchingState,
} from "../types";

export interface SwitchingTrackerState {
  standard: AqlStandardEdition;
  currentState: SwitchingState;
  /** GB/T 2828.1-2012 switching score (target >= 30 for Normal -> Reduced). */
  switchingScore: number;
  /** Consecutive accepted lots in current severity (for Tightened->Normal=5, ANSI Normal->Reduced=10). */
  consecutiveAccepted: number;
  /** Rolling window of last 5 lots in Normal inspection (2 rejects -> Tightened). */
  recentNormalResults: Array<"accept" | "reject">;
  /** Cumulative rejected lots since entering Tightened (5 -> Discontinue). */
  tightenedRejectCount: number;
  /** History of lot events. */
  events: SwitchingLotEvent[];
}

export function createInitialSwitchingTracker(
  standard: AqlStandardEdition,
  initialSeverity: InspectionSeverity = "normal"
): SwitchingTrackerState {
  return {
    standard,
    currentState: initialSeverity,
    switchingScore: 0,
    consecutiveAccepted: 0,
    recentNormalResults: [],
    tightenedRejectCount: 0,
    events: [],
  };
}

/**
 * Step the GB/T 2828.1-2012 (ISO 2859-1) / ANSI Z1.4 switching state machine by one lot.
 *
 * Outcome meanings:
 * - "accept_strict": Lot accepted AND would have been accepted at 1-step tighter AQL (for Ac >= 2: +3 pts in GB/T 2828.1)
 * - "accept": Lot accepted (for Ac=0/1: +2 pts in GB/T 2828.1; for Ac>=2 without meeting tighter AQL: score resets to 0)
 * - "accept_gap": ANSI Z1.4 Reduced inspection Ac < d < Re (lot accepted, next lot reverts to Normal)
 * - "reject": Lot rejected (d >= Re)
 */
export function recordSwitchingLot(
  state: SwitchingTrackerState,
  outcome: SwitchingLotEvent["outcome"],
  currentPlanAc: number
): SwitchingTrackerState {
  if (state.currentState === "discontinued") {
    return state;
  }

  const severityUsed: InspectionSeverity = state.currentState;
  const lotIndex = state.events.length + 1;
  const scoreBefore = state.switchingScore;

  let nextState: SwitchingState = state.currentState;
  let switchingScore = state.switchingScore;
  let consecutiveAccepted = state.consecutiveAccepted;
  let recentNormalResults = [...state.recentNormalResults];
  let tightenedRejectCount = state.tightenedRejectCount;
  let reason = "";

  if (severityUsed === "normal") {
    if (outcome === "reject") {
      switchingScore = 0;
      consecutiveAccepted = 0;
      recentNormalResults = [...recentNormalResults, "reject" as const].slice(-5);
      const rejectsInLast5 = recentNormalResults.filter((r) => r === "reject").length;
      if (rejectsInLast5 >= 2) {
        nextState = "tightened";
        recentNormalResults = [];
        tightenedRejectCount = 0;
        reason = "连续不超过 5 批中有 2 批不接收 → 强制转入【加严检验】";
      } else {
        reason = `本批拒收（近 5 批累计 ${rejectsInLast5}/2 批不接收），转移得分归零，维持正常检验`;
      }
    } else {
      recentNormalResults = [...recentNormalResults, "accept" as const].slice(-5);
      consecutiveAccepted += 1;

      if (state.standard === "gbt2828") {
        if (currentPlanAc >= 2) {
          if (outcome === "accept_strict") {
            switchingScore += 3;
            reason = `Ac ≥ 2 且满足严一档 AQL，转移得分 +3（当前 ${switchingScore}/30）`;
          } else {
            switchingScore = 0;
            reason = "本批允收但未达严一档 AQL，转移得分重置为 0";
          }
        } else {
          switchingScore += 2;
          reason = `Ac 为 0 或 1 且本批允收，转移得分 +2（当前 ${switchingScore}/30）`;
        }

        if (switchingScore >= 30) {
          nextState = "reduced";
          switchingScore = 0;
          consecutiveAccepted = 0;
          recentNormalResults = [];
          reason = "转移得分达到 30 分（且生产稳定并经负责部门批准）→ 可转入【放宽检验】";
        }
      } else {
        // ANSI/ASQ Z1.4: 10 consecutive lots accepted
        if (consecutiveAccepted >= 10) {
          nextState = "reduced";
          consecutiveAccepted = 0;
          recentNormalResults = [];
          reason = "正常检验连续 10 批接收（且不合格总数满足界限数）→ 可转入【放宽检验】";
        } else {
          reason = `正常检验连续接收 ${consecutiveAccepted}/10 批`;
        }
      }
    }
  } else if (severityUsed === "tightened") {
    if (outcome === "reject") {
      consecutiveAccepted = 0;
      tightenedRejectCount += 1;
      if (tightenedRejectCount >= 5) {
        nextState = "discontinued";
        reason = "加严检验累计 5 批不接收 → 触发【暂停检验】，须供方整改后重新评审";
      } else {
        reason = `加严检验不接收（累计 ${tightenedRejectCount}/5 批），连续接收计数归零`;
      }
    } else {
      consecutiveAccepted += 1;
      if (consecutiveAccepted >= 5) {
        nextState = "normal";
        consecutiveAccepted = 0;
        tightenedRejectCount = 0;
        switchingScore = 0;
        recentNormalResults = [];
        reason = "加严检验连续 5 批初次接收 → 恢复【正常检验】";
      } else {
        reason = `加严检验连续接收 ${consecutiveAccepted}/5 批（满 5 批可恢复正常）`;
      }
    }
  } else {
    // Reduced inspection
    if (outcome === "reject") {
      nextState = "normal";
      switchingScore = 0;
      consecutiveAccepted = 0;
      recentNormalResults = [];
      reason = "放宽检验出现 1 批不接收 → 立即恢复【正常检验】";
    } else if (outcome === "accept_gap") {
      nextState = "normal";
      switchingScore = 0;
      consecutiveAccepted = 0;
      recentNormalResults = [];
      reason = "不合格数落入 Ac 与 Re 缓冲区间：本批允收，但下批立即恢复【正常检验】";
    } else {
      consecutiveAccepted += 1;
      reason = `放宽检验持续接收（累计 ${consecutiveAccepted} 批），维持放宽状态`;
    }
  }

  const event: SwitchingLotEvent = {
    id: `sw-${lotIndex}-${Date.now()}`,
    lotIndex,
    severityUsed,
    outcome,
    scoreBefore,
    scoreAfter: switchingScore,
    nextState,
    reason,
  };

  return {
    ...state,
    currentState: nextState,
    switchingScore,
    consecutiveAccepted,
    recentNormalResults,
    tightenedRejectCount,
    events: [event, ...state.events].slice(0, 50),
  };
}

export function getSwitchingRuleReference(standard: AqlStandardEdition): Array<{
  from: string;
  to: string;
  condition: string;
  clause: string;
  accent: string;
}> {
  return [
    {
      from: "正常检验",
      to: "加严检验",
      condition: "连续不超过 5 批初次检验中，有 2 批不接收",
      clause: "9.3.1",
      accent: "#f43f5e",
    },
    {
      from: "加严检验",
      to: "正常检验",
      condition: "加严检验连续 5 批初次检验全部接收",
      clause: "9.3.2",
      accent: "#10b981",
    },
    {
      from: "正常检验",
      to: "放宽检验",
      condition:
        standard === "gbt2828"
          ? "转移得分 ≥ 30 分（Ac≥2 严一档接收 +3，Ac=0/1 接收 +2，否则归零），生产稳定且经负责部门批准"
          : "连续 10 批初次检验接收且不合格品总数 ≤ 界限数，生产稳定且经负责部门批准",
      clause: "9.3.3",
      accent: "#3b82f6",
    },
    {
      from: "放宽检验",
      to: "正常检验",
      condition:
        standard === "gbt2828"
          ? "任意 1 批不接收，或生产过程不稳定/中断"
          : "任意 1 批不接收、落入 Ac < d < Re 缓冲区间，或生产不稳定",
      clause: "9.3.4",
      accent: "#f59e0b",
    },
    {
      from: "加严检验",
      to: "暂停检验",
      condition: "加严检验期间累计有 5 批不接收，应暂停抽检并要求供方改进质量",
      clause: "9.4",
      accent: "#dc2626",
    },
  ];
}

export function formatPlanShortBadge(plan: SamplingPlanResult): string {
  return `${plan.effectiveCode} · n=${plan.sampleSize} · Ac=${plan.ac}/Re=${plan.re}`;
}
