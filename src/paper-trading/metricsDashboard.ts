// src/paper-trading/metricsDashboard.ts
// Real-time Metrics Dashboard - Live vs Backtest Comparison

import { ShadowTradeSession, LiveMetrics, Divergence } from './shadowTrader';

/**
 * Metrics Dashboard displays:
 * 1. Live metrics (current session)
 * 2. Backtest metrics (reference)
 * 3. Divergences (actual vs expected)
 * 4. Trend analysis (moving average)
 * 5. Performance gauges (traffic light status)
 */

export interface DashboardMetric {
  name: string;
  live: number;
  backtest: number;
  difference: number;
  percentDifference: number;
  status: 'OK' | 'WARNING' | 'CRITICAL';
  trend: 'UP' | 'DOWN' | 'STABLE';
}

export interface PerformanceGauge {
  metric: string;
  value: number;
  target: number;
  threshold: {
    warning: number;
    critical: number;
  };
  color: 'GREEN' | 'YELLOW' | 'RED';
}

export class MetricsDashboard {
  private session: ShadowTradeSession;
  private metricHistory: Map<string, number[]> = new Map();
  private lastUpdate: Date = new Date();

  constructor(session: ShadowTradeSession) {
    this.session = session;
    this.initializeHistory();
  }

  private initializeHistory(): void {
    const metrics = [
      'T1_HIT_RATE',
      'PROFIT_FACTOR',
      'MAX_DRAWDOWN',
      'SHARPE_RATIO',
      'WIN_RATE',
      'AVG_PNL',
    ];
    for (const metric of metrics) {
      this.metricHistory.set(metric, []);
    }
  }

  updateMetrics(session: ShadowTradeSession): void {
    this.session = session;
    this.lastUpdate = new Date();

    // Record current metrics for trend analysis
    this.metricHistory.get('T1_HIT_RATE')!.push(session.liveMetrics.t1HitRate);
    this.metricHistory.get('PROFIT_FACTOR')!.push(session.liveMetrics.profitFactor);
    this.metricHistory.get('MAX_DRAWDOWN')!.push(session.liveMetrics.maxDrawdown);
    this.metricHistory.get('SHARPE_RATIO')!.push(session.liveMetrics.sharpeRatio);
    this.metricHistory.get('WIN_RATE')!.push(session.liveMetrics.winRate);
    this.metricHistory.get('AVG_PNL')!.push(session.liveMetrics.avgPnL);
  }

  // MARK: - Display Rendering

  renderTerminalDashboard(): string {
    let output = '\n\n';
    output += this.renderHeader();
    output += this.renderMetricsTable();
    output += this.renderPerformanceGauges();
    output += this.renderDivergenceSummary();
    output += this.renderTrendAnalysis();
    output += this.renderBottomBar();
    return output;
  }

  private renderHeader(): string {
    const elapsed = (new Date().getTime() - this.session.startTime.getTime()) / 1000;
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = Math.floor(elapsed % 60);

    let header = '╔════════════════════════════════════════════════════════════════════════════════╗\n';
    header += `║ 📊 SHADOW TRADING DASHBOARD - Session: ${this.session.sessionId.substring(0, 20)}...              ║\n`;
    header += `║ Status: ${this.renderStatusBadge(this.session.status)}  |  Elapsed: ${hours}h ${minutes}m ${seconds}s  |  Signals: ${this.session.signalsCompleted}/${this.session.signalsGenerated}       ║\n`;
    header += '╚════════════════════════════════════════════════════════════════════════════════╝\n\n';

    return header;
  }

  private renderMetricsTable(): string {
    const metrics = this.getComparisonMetrics();

    let table = '┌─ METRICS COMPARISON ────────────────────────────────────────────────────────────┐\n';
    table += '│ Metric              │   Live    │ Backtest  │  Diff    │ Status       │ Trend   │\n';
    table += '├─────────────────────┼───────────┼───────────┼──────────┼──────────────┼─────────┤\n';

    for (const metric of metrics) {
      const statusColor = this.getStatusColor(metric.status);
      const trendArrow = metric.trend === 'UP' ? '↗' : metric.trend === 'DOWN' ? '↘' : '→';

      table += `│ ${this.padRight(metric.name, 19)} `;
      table += `│ ${this.padCenter(metric.live.toFixed(2), 9)} `;
      table += `│ ${this.padCenter(metric.backtest.toFixed(2), 9)} `;
      table += `│ ${this.padCenter((metric.percentDifference * 100).toFixed(1) + '%', 8)} `;
      table += `│ ${statusColor}${metric.status}${this.reset}${this.padRight('', 6 - metric.status.length)} `;
      table += `│ ${trendArrow}    │\n`;
    }

    table += '└─────────────────────┴───────────┴───────────┴──────────┴──────────────┴─────────┘\n\n';

    return table;
  }

  private renderPerformanceGauges(): string {
    const gauges = this.getPerformanceGauges();

    let output = '┌─ PERFORMANCE GAUGES ────────────────────────────────────────────────────────────┐\n';

    for (const gauge of gauges) {
      const percentage = (gauge.value / gauge.target) * 100;
      const barLength = 40;
      const filledLength = Math.round((percentage / 100) * barLength);
      const bar = '█'.repeat(Math.min(filledLength, barLength)) + '░'.repeat(Math.max(0, barLength - filledLength));

      const color = this.getGaugeColor(gauge.color);
      output += `│ ${gauge.metric.padEnd(20)} ${color}${bar}${this.reset} ${gauge.value.toFixed(2)}/${gauge.target.toFixed(2)}\n`;
    }

    output += '└─────────────────────────────────────────────────────────────────────────────────┘\n\n';

    return output;
  }

  private renderDivergenceSummary(): string {
    const divergences = this.session.divergences;
    const critical = divergences.filter((d) => d.severity === 'CRITICAL').length;
    const high = divergences.filter((d) => d.severity === 'HIGH').length;
    const medium = divergences.filter((d) => d.severity === 'MEDIUM').length;

    let output = '┌─ DIVERGENCE SUMMARY ────────────────────────────────────────────────────────────┐\n';
    output += `│ 🔴 Critical: ${critical.toString().padEnd(3)} │ 🟠 High: ${high.toString().padEnd(3)} │ 🟡 Medium: ${medium.toString().padEnd(3)} │ Total: ${divergences.length.toString().padEnd(3)}                         │\n`;

    if (divergences.length > 0) {
      output += '│                                                                                │\n';
      for (let i = 0; i < Math.min(3, divergences.length); i++) {
        const div = divergences[i];
        const icon = this.getSeverityIcon(div.severity);
        output += `│ ${icon} ${div.metric.padEnd(25)} ${(div.percentDifference * 100).toFixed(1)}% diff`;
        output += this.padRight('', 45 - div.metric.length - 8);
        output += '│\n';
      }
    }

    output += '└─────────────────────────────────────────────────────────────────────────────────┘\n\n';

    return output;
  }

  private renderTrendAnalysis(): string {
    const t1Trend = this.calculateTrend('T1_HIT_RATE');
    const pfTrend = this.calculateTrend('PROFIT_FACTOR');
    const ddTrend = this.calculateTrend('MAX_DRAWDOWN');

    let output = '┌─ TREND ANALYSIS ────────────────────────────────────────────────────────────────┐\n';
    output += `│ T1 Hit Rate:      ${t1Trend}                                                            │\n`;
    output += `│ Profit Factor:    ${pfTrend}                                                            │\n`;
    output += `│ Max Drawdown:     ${ddTrend}                                                            │\n`;
    output += '└─────────────────────────────────────────────────────────────────────────────────┘\n\n';

    return output;
  }

  private renderBottomBar(): string {
    const statusIcon =
      this.session.status === 'RUNNING'
        ? '🟢'
        : this.session.status === 'PAUSED'
          ? '🟡'
          : this.session.status === 'HALTED'
            ? '🔴'
            : '⚫';

    let bar = `${statusIcon} Last Update: ${this.lastUpdate.toLocaleTimeString()} │ `;
    bar += `Trades: ${this.session.signalsCompleted} │ `;
    bar += `Total P&L: ${this.session.liveMetrics.totalPnL.toFixed(2)}R\n`;

    return bar;
  }

  // MARK: - Metric Calculations

  private getComparisonMetrics(): DashboardMetric[] {
    const live = this.session.liveMetrics;
    const backtest = this.session.backtestMetrics;

    return [
      {
        name: 'T1 Hit Rate',
        live: live.t1HitRate,
        backtest: backtest.t1HitRate,
        difference: live.t1HitRate - backtest.t1HitRate,
        percentDifference: Math.abs((live.t1HitRate - backtest.t1HitRate) / backtest.t1HitRate),
        status: this.getMetricStatus('T1_HIT_RATE', live.t1HitRate, backtest.t1HitRate),
        trend: this.getTrendDirection('T1_HIT_RATE'),
      },
      {
        name: 'Profit Factor',
        live: live.profitFactor,
        backtest: backtest.profitFactor,
        difference: live.profitFactor - backtest.profitFactor,
        percentDifference: Math.abs((live.profitFactor - backtest.profitFactor) / backtest.profitFactor),
        status: this.getMetricStatus('PROFIT_FACTOR', live.profitFactor, backtest.profitFactor),
        trend: this.getTrendDirection('PROFIT_FACTOR'),
      },
      {
        name: 'Max Drawdown',
        live: live.maxDrawdown,
        backtest: backtest.maxDrawdown,
        difference: live.maxDrawdown - backtest.maxDrawdown,
        percentDifference: Math.abs((live.maxDrawdown - backtest.maxDrawdown) / backtest.maxDrawdown),
        status: this.getMetricStatus('MAX_DRAWDOWN', live.maxDrawdown, backtest.maxDrawdown),
        trend: this.getTrendDirection('MAX_DRAWDOWN'),
      },
      {
        name: 'Sharpe Ratio',
        live: live.sharpeRatio,
        backtest: backtest.sharpeRatio,
        difference: live.sharpeRatio - backtest.sharpeRatio,
        percentDifference: Math.abs((live.sharpeRatio - backtest.sharpeRatio) / backtest.sharpeRatio),
        status: this.getMetricStatus('SHARPE_RATIO', live.sharpeRatio, backtest.sharpeRatio),
        trend: this.getTrendDirection('SHARPE_RATIO'),
      },
      {
        name: 'Win Rate',
        live: live.winRate,
        backtest: backtest.winRate,
        difference: live.winRate - backtest.winRate,
        percentDifference: Math.abs((live.winRate - backtest.winRate) / backtest.winRate),
        status: this.getMetricStatus('WIN_RATE', live.winRate, backtest.winRate),
        trend: this.getTrendDirection('WIN_RATE'),
      },
      {
        name: 'Avg P&L',
        live: live.avgPnL,
        backtest: backtest.avgPnL,
        difference: live.avgPnL - backtest.avgPnL,
        percentDifference: Math.abs((live.avgPnL - backtest.avgPnL) / backtest.avgPnL),
        status: this.getMetricStatus('AVG_PNL', live.avgPnL, backtest.avgPnL),
        trend: this.getTrendDirection('AVG_PNL'),
      },
    ];
  }

  private getPerformanceGauges(): PerformanceGauge[] {
    const live = this.session.liveMetrics;
    const backtest = this.session.backtestMetrics;

    return [
      {
        metric: 'T1 Hit Rate',
        value: live.t1HitRate * 100,
        target: backtest.t1HitRate * 100,
        threshold: { warning: backtest.t1HitRate * 100 * 0.95, critical: backtest.t1HitRate * 100 * 0.85 },
        color: this.getGaugeStatusColor(live.t1HitRate, backtest.t1HitRate, 0.05),
      },
      {
        metric: 'Profit Factor',
        value: live.profitFactor,
        target: backtest.profitFactor,
        threshold: { warning: backtest.profitFactor * 0.95, critical: backtest.profitFactor * 0.85 },
        color: this.getGaugeStatusColor(live.profitFactor, backtest.profitFactor, 0.05),
      },
      {
        metric: 'Win Rate',
        value: live.winRate * 100,
        target: backtest.winRate * 100,
        threshold: { warning: backtest.winRate * 100 * 0.95, critical: backtest.winRate * 100 * 0.85 },
        color: this.getGaugeStatusColor(live.winRate, backtest.winRate, 0.05),
      },
    ];
  }

  // MARK: - Utilities

  private getMetricStatus(metric: string, liveValue: number, backtestValue: number): 'OK' | 'WARNING' | 'CRITICAL' {
    const diff = Math.abs((liveValue - backtestValue) / backtestValue);
    if (diff > 0.15) return 'CRITICAL';
    if (diff > 0.10) return 'WARNING';
    return 'OK';
  }

  private calculateTrend(metric: string): string {
    const history = this.metricHistory.get(metric) || [];
    if (history.length < 2) return 'N/A';

    const recent = history.slice(-5);
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
    const avgPrevious = history.slice(-10, -5).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(5, history.length - 5));

    if (avgRecent > avgPrevious * 1.05) return '↗ UP';
    if (avgRecent < avgPrevious * 0.95) return '↘ DOWN';
    return '→ STABLE';
  }

  private getTrendDirection(metric: string): 'UP' | 'DOWN' | 'STABLE' {
    const history = this.metricHistory.get(metric) || [];
    if (history.length < 2) return 'STABLE';

    const recent = history.slice(-3);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const prev = history[history.length - 4] || avg;

    if (avg > prev * 1.02) return 'UP';
    if (avg < prev * 0.98) return 'DOWN';
    return 'STABLE';
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'OK':
        return `${this.green}`;
      case 'WARNING':
        return `${this.yellow}`;
      case 'CRITICAL':
        return `${this.red}`;
      default:
        return '';
    }
  }

  private getGaugeColor(color: string): string {
    switch (color) {
      case 'GREEN':
        return this.green;
      case 'YELLOW':
        return this.yellow;
      case 'RED':
        return this.red;
      default:
        return '';
    }
  }

  private getGaugeStatusColor(liveValue: number, backtestValue: number, threshold: number): 'GREEN' | 'YELLOW' | 'RED' {
    const diff = Math.abs((liveValue - backtestValue) / backtestValue);
    if (diff > threshold * 3) return 'RED';
    if (diff > threshold * 2) return 'YELLOW';
    return 'GREEN';
  }

  private renderStatusBadge(status: string): string {
    switch (status) {
      case 'RUNNING':
        return '🟢 RUNNING';
      case 'PAUSED':
        return '🟡 PAUSED';
      case 'HALTED':
        return '🔴 HALTED';
      case 'COMPLETED':
        return '⚪ COMPLETED';
      default:
        return status;
    }
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'CRITICAL':
        return '🔴';
      case 'HIGH':
        return '🟠';
      case 'MEDIUM':
        return '🟡';
      case 'LOW':
        return '🟢';
      default:
        return '⚪';
    }
  }

  private padRight(str: string, width: number): string {
    return str + ' '.repeat(Math.max(0, width - str.length));
  }

  private padCenter(str: string, width: number): string {
    const padding = Math.max(0, width - str.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
  }

  private readonly reset = '\x1b[0m';
  private readonly green = '\x1b[32m';
  private readonly yellow = '\x1b[33m';
  private readonly red = '\x1b[31m';
}
