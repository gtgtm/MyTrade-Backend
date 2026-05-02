// src/deployment/performanceComparison.ts
// Performance Comparison - Live vs Paper vs Backtest baseline

import { RolloutStatus } from './phasedRollout';
import { LiveMetrics } from './liveMonitoring';

export interface BaselineMetrics {
  source: 'BACKTEST' | 'PAPER_TRADING';
  timestamp: Date;
  t1HitRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
}

export interface PerformanceComparison {
  timestamp: Date;
  baseline: BaselineMetrics;
  current: LiveMetrics;
  divergences: MetricDivergence[];
  overallConfidence: number;
  readyToScale: boolean;
  recommendation: string;
}

export interface MetricDivergence {
  metric: string;
  baseline: number;
  current: number;
  percentDivergence: number;
  severity: 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL';
}

export class PerformanceComparison {
  private baseline: BaselineMetrics | null = null;
  private comparisonHistory: PerformanceComparison[] = [];

  setBaseline(baseline: BaselineMetrics): void {
    this.baseline = baseline;
    console.log(
      `📊 Baseline set: ${baseline.source} | T1: ${(baseline.t1HitRate * 100).toFixed(1)}% | PF: ${baseline.profitFactor.toFixed(2)} | DD: ${(baseline.maxDrawdown * 100).toFixed(1)}%`
    );
  }

  compare(current: LiveMetrics): PerformanceComparison {
    if (!this.baseline) {
      throw new Error('Baseline not set - call setBaseline() first');
    }

    const divergences = this.calculateDivergences(this.baseline, current);
    const overallConfidence = this.calculateConfidence(divergences);
    const readyToScale = this.assessReadiness(divergences, overallConfidence);
    const recommendation = this.generateRecommendation(divergences, overallConfidence, readyToScale);

    const comparison: PerformanceComparison = {
      timestamp: new Date(),
      baseline: this.baseline,
      current,
      divergences,
      overallConfidence,
      readyToScale,
      recommendation,
    };

    this.comparisonHistory.push(comparison);
    if (this.comparisonHistory.length > 100) {
      this.comparisonHistory.shift();
    }

    return comparison;
  }

  private calculateDivergences(baseline: BaselineMetrics, current: LiveMetrics): MetricDivergence[] {
    return [
      this.compareTHitRate(baseline.t1HitRate, current.t1HitRate),
      this.compareProfitFactor(baseline.profitFactor, current.profitFactor),
      this.compareDrawdown(baseline.maxDrawdown, current.maxDrawdown),
      this.compareSharpeRatio(baseline.sharpeRatio, current.sharpeRatio),
      this.compareWinRate(baseline.winRate, current.winRate),
    ];
  }

  private compareTHitRate(baseline: number, current: number): MetricDivergence {
    const divergence = Math.abs((current - baseline) / baseline);

    let severity: 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL' = 'OK';
    if (divergence > 0.15) severity = 'CRITICAL';
    else if (divergence > 0.10) severity = 'WARN';
    else if (divergence > 0.05) severity = 'MONITOR';

    return {
      metric: 'T1 Hit Rate',
      baseline,
      current,
      percentDivergence: divergence,
      severity,
    };
  }

  private compareProfitFactor(baseline: number, current: number): MetricDivergence {
    const divergence = Math.abs((current - baseline) / baseline);

    let severity: 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL' = 'OK';
    if (divergence > 0.15) severity = 'CRITICAL';
    else if (divergence > 0.10) severity = 'WARN';
    else if (divergence > 0.05) severity = 'MONITOR';

    if (current < 1.5) severity = 'CRITICAL'; // Always critical if PF drops below 1.5

    return {
      metric: 'Profit Factor',
      baseline,
      current,
      percentDivergence: divergence,
      severity,
    };
  }

  private compareDrawdown(baseline: number, current: number): MetricDivergence {
    // For drawdown, we measure by percentage increase
    const divergence = current > baseline ? (current - baseline) / baseline : 0;

    let severity: 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL' = 'OK';
    if (divergence > 0.15) severity = 'CRITICAL';
    else if (divergence > 0.10) severity = 'WARN';
    else if (divergence > 0.05) severity = 'MONITOR';

    if (current > 0.15) severity = 'CRITICAL'; // Always critical if DD exceeds 15%

    return {
      metric: 'Max Drawdown',
      baseline,
      current,
      percentDivergence: divergence,
      severity,
    };
  }

  private compareSharpeRatio(baseline: number, current: number): MetricDivergence {
    const divergence = Math.abs((current - baseline) / baseline);

    let severity: 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL' = 'OK';
    if (divergence > 0.15) severity = 'CRITICAL';
    else if (divergence > 0.10) severity = 'WARN';
    else if (divergence > 0.05) severity = 'MONITOR';

    return {
      metric: 'Sharpe Ratio',
      baseline,
      current,
      percentDivergence: divergence,
      severity,
    };
  }

  private compareWinRate(baseline: number, current: number): MetricDivergence {
    const divergence = Math.abs((current - baseline) / baseline);

    let severity: 'OK' | 'MONITOR' | 'WARN' | 'CRITICAL' = 'OK';
    if (divergence > 0.15) severity = 'CRITICAL';
    else if (divergence > 0.10) severity = 'WARN';
    else if (divergence > 0.05) severity = 'MONITOR';

    return {
      metric: 'Win Rate',
      baseline,
      current,
      percentDivergence: divergence,
      severity,
    };
  }

  private calculateConfidence(divergences: MetricDivergence[]): number {
    const criticalCount = divergences.filter((d) => d.severity === 'CRITICAL').length;
    const warnCount = divergences.filter((d) => d.severity === 'WARN').length;
    const monitorCount = divergences.filter((d) => d.severity === 'MONITOR').length;

    // Base confidence: 100%
    // Reduce by severity
    let confidence = 100;
    confidence -= criticalCount * 30; // -30 per critical
    confidence -= warnCount * 15; // -15 per warn
    confidence -= monitorCount * 5; // -5 per monitor

    return Math.max(0, confidence);
  }

  private assessReadiness(divergences: MetricDivergence[], confidence: number): boolean {
    // Ready to scale if:
    // 1. No critical divergences
    // 2. Confidence >= 75%
    // 3. Most metrics OK or MONITOR (no WARN)

    const hasCritical = divergences.some((d) => d.severity === 'CRITICAL');
    const hasWarn = divergences.some((d) => d.severity === 'WARN');

    return !hasCritical && !hasWarn && confidence >= 75;
  }

  private generateRecommendation(
    divergences: MetricDivergence[],
    confidence: number,
    readyToScale: boolean
  ): string {
    const critical = divergences.filter((d) => d.severity === 'CRITICAL');
    const warn = divergences.filter((d) => d.severity === 'WARN');

    if (readyToScale) {
      return `✅ Ready to scale: All metrics OK, confidence ${confidence.toFixed(0)}%`;
    }

    if (critical.length > 0) {
      const metrics = critical.map((d) => d.metric).join(', ');
      return `🛑 NOT ready: Critical divergences in ${metrics}. Investigate before scaling.`;
    }

    if (warn.length > 0) {
      const metrics = warn.map((d) => d.metric).join(', ');
      return `⚠️ Caution: Warning divergences in ${metrics}. Monitor closely before scaling.`;
    }

    return `📊 Monitor: Some divergences detected. Continue tracking before next phase.`;
  }

  getLatestComparison(): PerformanceComparison | null {
    return this.comparisonHistory.length > 0 ? this.comparisonHistory[this.comparisonHistory.length - 1] : null;
  }

  getComparisonHistory(limit: number = 50): PerformanceComparison[] {
    return this.comparisonHistory.slice(-limit);
  }

  printComparison(): void {
    const latest = this.getLatestComparison();
    if (!latest) {
      console.log('No comparisons available yet');
      return;
    }

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║ PERFORMANCE COMPARISON                                 ║`);
    console.log(`║ Baseline: ${latest.baseline.source.padEnd(41)} ║`);
    console.log(`║ Confidence: ${this.padRight(`${latest.overallConfidence.toFixed(0)}%`, 42)} ║`);
    console.log(`║ Ready to Scale: ${this.padRight(latest.readyToScale ? 'YES' : 'NO', 38)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Metric Comparison:                                     ║`);

    for (const div of latest.divergences) {
      const icon = this.getSeverityIcon(div.severity);
      const pct = (div.percentDivergence * 100).toFixed(1);
      console.log(
        `║   ${icon} ${div.metric.padEnd(15)} | ${(div.baseline * 100).toFixed(1)}% → ${(div.current * 100).toFixed(1)}% (${pct}%) ║`
      );
    }

    console.log(`║                                                        ║`);
    console.log(`║ Recommendation:                                        ║`);
    console.log(`║ ${latest.recommendation.substring(0, 48).padEnd(48)} ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'OK':
        return '✅';
      case 'MONITOR':
        return '🔵';
      case 'WARN':
        return '🟡';
      case 'CRITICAL':
        return '🔴';
      default:
        return '⚪';
    }
  }

  private padRight(str: string, width: number): string {
    return str + ' '.repeat(Math.max(0, width - str.length));
  }
}

export default PerformanceComparison;
