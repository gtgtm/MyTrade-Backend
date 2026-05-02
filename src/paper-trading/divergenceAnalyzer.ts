// src/paper-trading/divergenceAnalyzer.ts
// Divergence Analyzer - Detect and respond to performance deviations

import { LiveMetrics, BacktestMetrics, Divergence } from './shadowTrader';

/**
 * Divergence Analysis:
 * - Monitor live metrics vs backtest
 * - Detect systematic deviations
 * - Alert on threshold breaches
 * - Recommend actions (continue, adjust, halt)
 *
 * Thresholds:
 * - 5% warning (investigate)
 * - 10% caution (may need adjustment)
 * - 15%+ critical (consider halt)
 */

export interface DivergenceAnalysis {
  timestamp: Date;
  metrics: MetricAnalysis[];
  overallStatus: 'HEALTHY' | 'WARNING' | 'CAUTION' | 'CRITICAL';
  recommendation: string;
  shouldHalt: boolean;
  confidenceScore: number;
}

export interface MetricAnalysis {
  name: string;
  backtestValue: number;
  liveValue: number;
  divergence: number;
  severity: 'NONE' | 'WARNING' | 'CAUTION' | 'CRITICAL';
  analysis: string;
  historicalContext?: string;
}

export class DivergenceAnalyzer {
  private divergenceHistory: Map<string, Divergence[]> = new Map();
  private lastAnalysis: DivergenceAnalysis | null = null;
  private divergenceTrend: Map<string, number[]> = new Map();

  constructor() {
    this.initializeTrendTracking();
  }

  private initializeTrendTracking(): void {
    const metrics = ['T1_HIT_RATE', 'PROFIT_FACTOR', 'MAX_DRAWDOWN', 'SHARPE_RATIO', 'WIN_RATE', 'AVG_PNL'];
    for (const metric of metrics) {
      this.divergenceHistory.set(metric, []);
      this.divergenceTrend.set(metric, []);
    }
  }

  analyze(live: LiveMetrics, backtest: BacktestMetrics, tradedCount: number): DivergenceAnalysis {
    const metrics: MetricAnalysis[] = [];

    // Analyze each metric
    metrics.push(this.analyzeT1HitRate(live.t1HitRate, backtest.t1HitRate, tradedCount));
    metrics.push(this.analyzeProfitFactor(live.profitFactor, backtest.profitFactor, tradedCount));
    metrics.push(this.analyzeDrawdown(live.maxDrawdown, backtest.maxDrawdown, tradedCount));
    metrics.push(this.analyzeSharpeRatio(live.sharpeRatio, backtest.sharpeRatio, tradedCount));
    metrics.push(this.analyzeWinRate(live.winRate, backtest.winRate, tradedCount));

    // Determine overall status
    const criticalCount = metrics.filter((m) => m.severity === 'CRITICAL').length;
    const cautionCount = metrics.filter((m) => m.severity === 'CAUTION').length;
    const warningCount = metrics.filter((m) => m.severity === 'WARNING').length;

    let overallStatus: 'HEALTHY' | 'WARNING' | 'CAUTION' | 'CRITICAL' = 'HEALTHY';
    if (criticalCount > 0) overallStatus = 'CRITICAL';
    else if (cautionCount > 0) overallStatus = 'CAUTION';
    else if (warningCount > 0) overallStatus = 'WARNING';

    // Determine if halt is needed
    const shouldHalt = criticalCount >= 2 || (criticalCount > 0 && this.isTrendNegative());

    // Generate recommendation
    const recommendation = this.generateRecommendation(metrics, overallStatus, shouldHalt);

    // Calculate confidence score (0-100, higher = more confident in analysis)
    const confidenceScore = Math.max(0, 100 - (tradedCount < 20 ? (20 - tradedCount) * 5 : 0));

    const analysis: DivergenceAnalysis = {
      timestamp: new Date(),
      metrics,
      overallStatus,
      recommendation,
      shouldHalt,
      confidenceScore,
    };

    this.lastAnalysis = analysis;
    return analysis;
  }

  private analyzeT1HitRate(live: number, backtest: number, tradedCount: number): MetricAnalysis {
    const divergence = Math.abs((live - backtest) / backtest);
    let severity: 'NONE' | 'WARNING' | 'CAUTION' | 'CRITICAL' = 'NONE';

    if (divergence > 0.15) severity = 'CRITICAL';
    else if (divergence > 0.10) severity = 'CAUTION';
    else if (divergence > 0.05) severity = 'WARNING';

    let analysis = `Live T1 hit rate: ${(live * 100).toFixed(1)}% vs Backtest: ${(backtest * 100).toFixed(1)}%`;

    if (tradedCount < 20) {
      analysis += ` (Only ${tradedCount} trades - sample size may be too small)`;
    }

    return {
      name: 'T1 Hit Rate',
      backtestValue: backtest,
      liveValue: live,
      divergence,
      severity,
      analysis,
      historicalContext: this.getTrendContext('T1_HIT_RATE', divergence),
    };
  }

  private analyzeProfitFactor(live: number, backtest: number, tradedCount: number): MetricAnalysis {
    const divergence = Math.abs((live - backtest) / backtest);
    let severity: 'NONE' | 'WARNING' | 'CAUTION' | 'CRITICAL' = 'NONE';

    if (divergence > 0.15) severity = 'CRITICAL';
    else if (divergence > 0.10) severity = 'CAUTION';
    else if (divergence > 0.05) severity = 'WARNING';

    let analysis = `Live profit factor: ${live.toFixed(2)} vs Backtest: ${backtest.toFixed(2)}`;

    if (live < 1.5) {
      analysis += ' (Danger: PF below 1.5, strategy underperforming)';
    }

    return {
      name: 'Profit Factor',
      backtestValue: backtest,
      liveValue: live,
      divergence,
      severity,
      analysis,
      historicalContext: this.getTrendContext('PROFIT_FACTOR', divergence),
    };
  }

  private analyzeDrawdown(live: number, backtest: number, tradedCount: number): MetricAnalysis {
    // For drawdown, live should NOT be significantly higher than backtest
    const divergence = live > backtest ? (live - backtest) / backtest : 0;
    let severity: 'NONE' | 'WARNING' | 'CAUTION' | 'CRITICAL' = 'NONE';

    if (divergence > 0.15) severity = 'CRITICAL';
    else if (divergence > 0.10) severity = 'CAUTION';
    else if (divergence > 0.05) severity = 'WARNING';

    let analysis = `Live max drawdown: ${(live * 100).toFixed(2)}% vs Backtest: ${(backtest * 100).toFixed(2)}%`;

    if (live > 0.15) {
      analysis += ' (Warning: Drawdown exceeds 15%, high risk)';
    }

    return {
      name: 'Max Drawdown',
      backtestValue: backtest,
      liveValue: live,
      divergence,
      severity,
      analysis,
      historicalContext: this.getTrendContext('MAX_DRAWDOWN', divergence),
    };
  }

  private analyzeSharpeRatio(live: number, backtest: number, tradedCount: number): MetricAnalysis {
    const divergence = Math.abs((live - backtest) / backtest);
    let severity: 'NONE' | 'WARNING' | 'CAUTION' | 'CRITICAL' = 'NONE';

    if (divergence > 0.15) severity = 'CRITICAL';
    else if (divergence > 0.10) severity = 'CAUTION';
    else if (divergence > 0.05) severity = 'WARNING';

    let analysis = `Live Sharpe ratio: ${live.toFixed(2)} vs Backtest: ${backtest.toFixed(2)}`;

    if (live < 1.5) {
      analysis += ' (Risk-adjusted returns below 1.5, poor efficiency)';
    }

    return {
      name: 'Sharpe Ratio',
      backtestValue: backtest,
      liveValue: live,
      divergence,
      severity,
      analysis,
      historicalContext: this.getTrendContext('SHARPE_RATIO', divergence),
    };
  }

  private analyzeWinRate(live: number, backtest: number, tradedCount: number): MetricAnalysis {
    const divergence = Math.abs((live - backtest) / backtest);
    let severity: 'NONE' | 'WARNING' | 'CAUTION' | 'CRITICAL' = 'NONE';

    if (divergence > 0.15) severity = 'CRITICAL';
    else if (divergence > 0.10) severity = 'CAUTION';
    else if (divergence > 0.05) severity = 'WARNING';

    let analysis = `Live win rate: ${(live * 100).toFixed(1)}% vs Backtest: ${(backtest * 100).toFixed(1)}%`;

    if (tradedCount < 30) {
      analysis += ` (Only ${tradedCount} trades - need 30+ for statistical significance)`;
    }

    return {
      name: 'Win Rate',
      backtestValue: backtest,
      liveValue: live,
      divergence,
      severity,
      analysis,
      historicalContext: this.getTrendContext('WIN_RATE', divergence),
    };
  }

  private generateRecommendation(
    metrics: MetricAnalysis[],
    status: 'HEALTHY' | 'WARNING' | 'CAUTION' | 'CRITICAL',
    shouldHalt: boolean
  ): string {
    const criticalMetrics = metrics.filter((m) => m.severity === 'CRITICAL').map((m) => m.name);

    if (shouldHalt) {
      return `🛑 HALT RECOMMENDED: Multiple critical divergences (${criticalMetrics.join(', ')}). Live performance significantly deviates from backtest predictions.`;
    }

    switch (status) {
      case 'HEALTHY':
        return '✅ All metrics within acceptable range. Continue monitoring.';
      case 'WARNING':
        return '⚠️ Minor divergences detected. Monitor closely for trends. Adjust position sizing if divergence persists.';
      case 'CAUTION':
        return '🟠 Moderate divergences detected. Consider reducing position size by 25-50%. Increase monitoring frequency.';
      case 'CRITICAL':
        return '🔴 Critical divergences detected. Review strategy assumptions. Consider pausing new signals pending investigation.';
      default:
        return 'Status unknown';
    }
  }

  private getTrendContext(metric: string, currentDivergence: number): string {
    const trend = this.divergenceTrend.get(metric) || [];
    trend.push(currentDivergence);

    // Keep last 10 values
    if (trend.length > 10) trend.shift();
    this.divergenceTrend.set(metric, trend);

    if (trend.length < 2) return 'Insufficient history';

    const recent = trend.slice(-3);
    const older = trend.slice(-6, -3);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;

    if (recentAvg > olderAvg * 1.1) {
      return 'Divergence WORSENING - take immediate action';
    } else if (recentAvg < olderAvg * 0.9) {
      return 'Divergence improving - positive trend';
    } else {
      return 'Divergence stable - holding pattern';
    }
  }

  private isTrendNegative(): boolean {
    const trends = Array.from(this.divergenceTrend.values());
    for (const trend of trends) {
      if (trend.length >= 2) {
        const recent = trend[trend.length - 1];
        const previous = trend[trend.length - 2];
        if (recent > previous * 1.1) return true; // Divergence worsening
      }
    }
    return false;
  }

  recordDivergence(metric: string, divergence: Divergence): void {
    const history = this.divergenceHistory.get(metric) || [];
    history.push(divergence);
    this.divergenceHistory.set(metric, history);
  }

  getSummary(): string {
    if (!this.lastAnalysis) return 'No analysis performed yet';

    let summary = `\n📊 DIVERGENCE ANALYSIS SUMMARY\n`;
    summary += `Status: ${this.getStatusIcon(this.lastAnalysis.overallStatus)} ${this.lastAnalysis.overallStatus}\n`;
    summary += `Recommendation: ${this.lastAnalysis.recommendation}\n`;
    summary += `Confidence Score: ${this.lastAnalysis.confidenceScore.toFixed(0)}%\n`;

    summary += `\nDetailed Metrics:\n`;
    for (const metric of this.lastAnalysis.metrics) {
      if (metric.severity !== 'NONE') {
        const icon = this.getSeverityIcon(metric.severity);
        summary += `  ${icon} ${metric.name}: ${metric.analysis}\n`;
      }
    }

    return summary;
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'HEALTHY':
        return '🟢';
      case 'WARNING':
        return '🟡';
      case 'CAUTION':
        return '🟠';
      case 'CRITICAL':
        return '🔴';
      default:
        return '⚪';
    }
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'CRITICAL':
        return '🔴';
      case 'CAUTION':
        return '🟠';
      case 'WARNING':
        return '🟡';
      case 'NONE':
        return '✅';
      default:
        return '⚪';
    }
  }

  getLastAnalysis(): DivergenceAnalysis | null {
    return this.lastAnalysis;
  }
}
