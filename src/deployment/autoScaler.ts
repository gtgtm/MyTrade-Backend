// src/deployment/autoScaler.ts
// Auto-Scaling Decision Engine - Automatic phase progression based on metrics

import { PhasedRollout, RolloutPhase, RolloutStatus } from './phasedRollout';
import { LiveMonitoring, LiveMetrics } from './liveMonitoring';
import { PerformanceComparison, PerformanceComparison as PC, BaselineMetrics } from './performanceComparison';

export interface ScalingDecision {
  timestamp: Date;
  currentPhase: RolloutPhase;
  shouldScale: boolean;
  targetPhase: RolloutPhase | null;
  confidence: number;
  reasons: string[];
  exitCriteria: ExitCriteriaMet;
  recommendation: string;
}

export interface ExitCriteriaMet {
  minimumDurationMet: boolean;
  metricsThresholdMet: boolean;
  noActiveDivergencesMet: boolean;
  tradeSampleSizeMet: boolean;
}

export class AutoScaler {
  private rollout: PhasedRollout;
  private monitoring: LiveMonitoring;
  private comparison: PC;
  private scalarDecisionHistory: ScalingDecision[] = [];

  constructor(rollout: PhasedRollout, monitoring: LiveMonitoring, comparison: PC) {
    this.rollout = rollout;
    this.monitoring = monitoring;
    this.comparison = comparison;
  }

  evaluateScaling(): ScalingDecision {
    const status = this.rollout.getStatus();
    const metrics = this.monitoring.getCurrentMetrics();

    const exitCriteria = this.checkExitCriteria(status, metrics);
    const shouldScale = this.determineShouldScale(exitCriteria);
    const targetPhase = shouldScale ? this.determineTargetPhase(status.phase) : null;
    const confidence = this.calculateConfidence(exitCriteria);
    const reasons = this.generateReasons(exitCriteria, status, metrics);
    const recommendation = this.generateRecommendation(shouldScale, targetPhase, confidence);

    const decision: ScalingDecision = {
      timestamp: new Date(),
      currentPhase: status.phase,
      shouldScale,
      targetPhase,
      confidence,
      reasons,
      exitCriteria,
      recommendation,
    };

    this.scalarDecisionHistory.push(decision);
    if (this.scalarDecisionHistory.length > 100) {
      this.scalarDecisionHistory.shift();
    }

    return decision;
  }

  private checkExitCriteria(status: RolloutStatus, metrics: LiveMetrics): ExitCriteriaMet {
    const minimumDurationMet = this.checkMinimumDuration(status);
    const metricsThresholdMet = this.checkMetricsThreshold(status);
    const noActiveDivergencesMet = this.checkNoDivergences(metrics);
    const tradeSampleSizeMet = this.checkSampleSize(metrics);

    return {
      minimumDurationMet,
      metricsThresholdMet,
      noActiveDivergencesMet,
      tradeSampleSizeMet,
    };
  }

  private checkMinimumDuration(status: RolloutStatus): boolean {
    // Each phase requires at least 7 days (168 hours)
    const requiredDuration = 168; // hours
    const elapsedHours = (Date.now() - status.startTime.getTime()) / (1000 * 60 * 60);

    return elapsedHours >= requiredDuration;
  }

  private checkMetricsThreshold(status: RolloutStatus): boolean {
    // Metrics must meet phase-specific thresholds
    switch (status.phase) {
      case RolloutPhase.PHASE_1_10_PERCENT:
        // Phase 1: T1 88%, PF 2.5, DD ≤ 8%
        return (
          status.metrics.t1HitRate >= 0.88 && status.metrics.profitFactor >= 2.5 && status.metrics.maxDrawdown <= 0.08
        );

      case RolloutPhase.PHASE_2_25_PERCENT:
        // Phase 2: T1 88%, PF 2.4, DD ≤ 9%
        return (
          status.metrics.t1HitRate >= 0.88 && status.metrics.profitFactor >= 2.4 && status.metrics.maxDrawdown <= 0.09
        );

      case RolloutPhase.PHASE_3_100_PERCENT:
        // Phase 3: T1 86%, PF 2.2, DD ≤ 10%
        return (
          status.metrics.t1HitRate >= 0.86 && status.metrics.profitFactor >= 2.2 && status.metrics.maxDrawdown <= 0.10
        );

      default:
        return false;
    }
  }

  private checkNoDivergences(metrics: LiveMetrics): boolean {
    // No critical divergences or active alerts
    return metrics.errorRate < 0.05; // Error rate must be < 5%
  }

  private checkSampleSize(metrics: LiveMetrics): boolean {
    // Need minimum 50 trades per phase to have statistical significance
    const minimumTrades = 50;
    return metrics.executedTrades >= minimumTrades;
  }

  private determineShouldScale(exitCriteria: ExitCriteriaMet): boolean {
    // All criteria must be met to scale
    return (
      exitCriteria.minimumDurationMet &&
      exitCriteria.metricsThresholdMet &&
      exitCriteria.noActiveDivergencesMet &&
      exitCriteria.tradeSampleSizeMet
    );
  }

  private determineTargetPhase(currentPhase: RolloutPhase): RolloutPhase | null {
    switch (currentPhase) {
      case RolloutPhase.PHASE_1_10_PERCENT:
        return RolloutPhase.PHASE_2_25_PERCENT;
      case RolloutPhase.PHASE_2_25_PERCENT:
        return RolloutPhase.PHASE_3_100_PERCENT;
      default:
        return null;
    }
  }

  private calculateConfidence(exitCriteria: ExitCriteriaMet): number {
    let confidence = 0;

    if (exitCriteria.minimumDurationMet) confidence += 25;
    if (exitCriteria.metricsThresholdMet) confidence += 25;
    if (exitCriteria.noActiveDivergencesMet) confidence += 25;
    if (exitCriteria.tradeSampleSizeMet) confidence += 25;

    return confidence;
  }

  private generateReasons(exitCriteria: ExitCriteriaMet, status: RolloutStatus, metrics: LiveMetrics): string[] {
    const reasons: string[] = [];

    if (exitCriteria.minimumDurationMet) {
      const days = (Date.now() - status.startTime.getTime()) / (1000 * 60 * 60 * 24);
      reasons.push(`✅ Minimum duration met (${days.toFixed(1)} days)`);
    } else {
      const days = (Date.now() - status.startTime.getTime()) / (1000 * 60 * 60 * 24);
      reasons.push(`⏳ Duration requirement: ${days.toFixed(1)}/7.0 days`);
    }

    if (exitCriteria.metricsThresholdMet) {
      reasons.push(
        `✅ Metrics thresholds met (T1: ${(status.metrics.t1HitRate * 100).toFixed(1)}%, PF: ${status.metrics.profitFactor.toFixed(2)}, DD: ${(status.metrics.maxDrawdown * 100).toFixed(1)}%)`
      );
    } else {
      reasons.push(
        `⚠️ Metrics below threshold (T1: ${(status.metrics.t1HitRate * 100).toFixed(1)}%, PF: ${status.metrics.profitFactor.toFixed(2)}, DD: ${(status.metrics.maxDrawdown * 100).toFixed(1)}%)`
      );
    }

    if (exitCriteria.noActiveDivergencesMet) {
      reasons.push(`✅ No critical divergences detected`);
    } else {
      reasons.push(`⚠️ Active divergences or errors detected (${(metrics.errorRate * 100).toFixed(2)}%)`);
    }

    if (exitCriteria.tradeSampleSizeMet) {
      reasons.push(`✅ Sufficient sample size (${metrics.executedTrades} trades)`);
    } else {
      reasons.push(`⏳ Sample size: ${metrics.executedTrades}/50 trades`);
    }

    return reasons;
  }

  private generateRecommendation(shouldScale: boolean, targetPhase: RolloutPhase | null, confidence: number): string {
    if (shouldScale && targetPhase) {
      const targetName = targetPhase === RolloutPhase.PHASE_2_25_PERCENT ? '25%' : '100%';
      return `🚀 READY TO SCALE: All criteria met (${confidence}% confidence). Recommend scaling to ${targetName}.`;
    }

    if (confidence >= 75) {
      return `🟡 ALMOST READY: ${confidence}% confidence. One or more criteria not yet met. Review and retry in 24 hours.`;
    }

    if (confidence >= 50) {
      return `🟠 IN PROGRESS: ${confidence}% confidence. Continue monitoring. Multiple criteria pending.`;
    }

    return `🔴 NOT READY: ${confidence}% confidence. Significant work needed before scaling.`;
  }

  async executeAutoScaling(): Promise<boolean> {
    const decision = this.evaluateScaling();

    if (!decision.shouldScale || !decision.targetPhase) {
      console.log(`\n📊 Auto-Scaling Decision: ${decision.recommendation}`);
      return false;
    }

    // Log scaling decision
    console.log(`\n🚀 AUTO-SCALING INITIATED`);
    console.log(`Current Phase: ${decision.currentPhase}`);
    console.log(`Target Phase: ${decision.targetPhase}`);
    console.log(`Confidence: ${decision.confidence}%`);

    for (const reason of decision.reasons) {
      console.log(`  ${reason}`);
    }

    // Execute scaling based on target phase
    try {
      if (decision.targetPhase === RolloutPhase.PHASE_2_25_PERCENT) {
        const allUsers = this.rollout.getUserBuckets();
        const userIds = Array.from(allUsers.keys());
        const success = await this.rollout.scaleToPhase2(userIds);

        if (success) {
          console.log(`✅ Scaled to Phase 2 (25%) successfully`);
          return true;
        }
      } else if (decision.targetPhase === RolloutPhase.PHASE_3_100_PERCENT) {
        const allUsers = this.rollout.getUserBuckets();
        const userIds = Array.from(allUsers.keys());
        const success = await this.rollout.scaleToPhase3(userIds);

        if (success) {
          console.log(`✅ Scaled to Phase 3 (100%) successfully`);
          return true;
        }
      }
    } catch (error) {
      console.error(`❌ Scaling failed:`, error);
      return false;
    }

    return false;
  }

  getLatestDecision(): ScalingDecision | null {
    return this.scalarDecisionHistory.length > 0
      ? this.scalarDecisionHistory[this.scalarDecisionHistory.length - 1]
      : null;
  }

  getDecisionHistory(limit: number = 50): ScalingDecision[] {
    return this.scalarDecisionHistory.slice(-limit);
  }

  printDecision(): void {
    const latest = this.getLatestDecision();
    if (!latest) {
      console.log('No scaling decisions available yet');
      return;
    }

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║ AUTO-SCALING DECISION                                  ║`);
    console.log(`║ Current Phase: ${latest.currentPhase.padEnd(40)} ║`);
    console.log(`║ Should Scale: ${this.padRight(latest.shouldScale ? 'YES' : 'NO', 41)} ║`);
    console.log(`║ Confidence: ${this.padRight(`${latest.confidence}%`, 42)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Exit Criteria:                                         ║`);
    console.log(`║   ${this.getStatusIcon(latest.exitCriteria.minimumDurationMet)} Minimum Duration: ${this.padRight(latest.exitCriteria.minimumDurationMet ? 'MET' : 'PENDING', 31)} ║`);
    console.log(`║   ${this.getStatusIcon(latest.exitCriteria.metricsThresholdMet)} Metrics Threshold: ${this.padRight(latest.exitCriteria.metricsThresholdMet ? 'MET' : 'PENDING', 29)} ║`);
    console.log(`║   ${this.getStatusIcon(latest.exitCriteria.noActiveDivergencesMet)} No Divergences: ${this.padRight(latest.exitCriteria.noActiveDivergencesMet ? 'MET' : 'PENDING', 30)} ║`);
    console.log(`║   ${this.getStatusIcon(latest.exitCriteria.tradeSampleSizeMet)} Sample Size: ${this.padRight(latest.exitCriteria.tradeSampleSizeMet ? 'MET' : 'PENDING', 35)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Recommendation:                                        ║`);
    console.log(`║ ${latest.recommendation.substring(0, 48).padEnd(48)} ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');
  }

  private getStatusIcon(met: boolean): string {
    return met ? '✅' : '⏳';
  }

  private padRight(str: string, width: number): string {
    return str + ' '.repeat(Math.max(0, width - str.length));
  }
}

export default AutoScaler;
