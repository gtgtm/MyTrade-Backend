// src/deployment/liveMonitoring.ts
// Live Trading Monitoring - Real-time metrics tracking

import { EventEmitter } from 'events';

/**
 * Live Monitoring tracks:
 * 1. Real-time signal generation
 * 2. Trade execution statistics
 * 3. P&L tracking
 * 4. Performance metrics
 * 5. System health
 * 6. Error rates
 */

export interface LiveMetrics {
  timestamp: Date;
  activeUsers: number;
  activeSignals: number;
  executedTrades: number;
  totalPnL: number;
  averagePnL: number;
  t1HitRate: number;
  t2HitRate: number;
  profitFactor: number;
  maxDrawdown: number;
  currentDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  errorRate: number;
  systemHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
}

export interface MetricsSnapshot {
  timestamp: Date;
  metric: string;
  value: number;
  threshold?: number;
  status: 'OK' | 'WARNING' | 'CRITICAL';
}

export interface AlertEvent {
  timestamp: Date;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  metric?: string;
  value?: number;
}

export class LiveMonitoring extends EventEmitter {
  private metrics: Map<string, number[]> = new Map();
  private alerts: AlertEvent[] = [];
  private metricsHistory: MetricsSnapshot[] = [];
  private systemErrors: Array<{ timestamp: Date; error: string }> = [];
  private metricsUpdateInterval: NodeJS.Timer | null = null;

  constructor() {
    super();
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    const metricNames = [
      'ACTIVE_USERS',
      'ACTIVE_SIGNALS',
      'EXECUTED_TRADES',
      'TOTAL_PNL',
      'T1_HIT_RATE',
      'PROFIT_FACTOR',
      'MAX_DRAWDOWN',
      'WIN_RATE',
      'ERROR_RATE',
    ];

    for (const name of metricNames) {
      this.metrics.set(name, []);
    }
  }

  // MARK: - Update Methods

  recordSignal(userId: string, symbol: string): void {
    const currentCount = this.metrics.get('ACTIVE_SIGNALS')?.slice(-1)[0] || 0;
    this.metrics.get('ACTIVE_SIGNALS')!.push(currentCount + 1);
    this.emit('signal-recorded', { userId, symbol });
  }

  recordTrade(userId: string, symbol: string, executed: boolean, pnlR: number): void {
    if (executed) {
      const currentTrades = this.metrics.get('EXECUTED_TRADES')?.slice(-1)[0] || 0;
      this.metrics.get('EXECUTED_TRADES')!.push(currentTrades + 1);

      const currentPnL = this.metrics.get('TOTAL_PNL')?.slice(-1)[0] || 0;
      this.metrics.get('TOTAL_PNL')!.push(currentPnL + pnlR);

      this.emit('trade-executed', { userId, symbol, pnlR });
    }
  }

  updateMetrics(metrics: Partial<LiveMetrics>): void {
    if (metrics.t1HitRate !== undefined) this.metrics.get('T1_HIT_RATE')!.push(metrics.t1HitRate);
    if (metrics.profitFactor !== undefined) this.metrics.get('PROFIT_FACTOR')!.push(metrics.profitFactor);
    if (metrics.maxDrawdown !== undefined) this.metrics.get('MAX_DRAWDOWN')!.push(metrics.maxDrawdown);
    if (metrics.winRate !== undefined) this.metrics.get('WIN_RATE')!.push(metrics.winRate);
    if (metrics.errorRate !== undefined) this.metrics.get('ERROR_RATE')!.push(metrics.errorRate);
  }

  recordError(error: Error): void {
    this.systemErrors.push({
      timestamp: new Date(),
      error: error.message,
    });

    const errorRate = this.calculateErrorRate();
    this.checkThreshold('ERROR_RATE', errorRate, 0.05, 0.10);

    if (this.systemErrors.length > 100) {
      this.systemErrors.shift();
    }
  }

  recordAlert(severity: 'INFO' | 'WARNING' | 'CRITICAL', message: string, metric?: string, value?: number): void {
    const alert: AlertEvent = {
      timestamp: new Date(),
      severity,
      message,
      metric,
      value,
    };

    this.alerts.push(alert);
    this.emit('alert', alert);

    if (this.alerts.length > 1000) {
      this.alerts.shift();
    }
  }

  // MARK: - Monitoring

  startMonitoring(intervalSeconds: number = 60): void {
    this.metricsUpdateInterval = setInterval(() => {
      this.analyzeMetrics();
    }, intervalSeconds * 1000);

    console.log(`✅ Live monitoring started (${intervalSeconds}s intervals)`);
  }

  stopMonitoring(): void {
    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
      this.metricsUpdateInterval = null;
    }
    console.log('⏹️ Live monitoring stopped');
  }

  private analyzeMetrics(): void {
    const metrics = this.getCurrentMetrics();

    // Check thresholds
    this.checkThreshold('T1_HIT_RATE', metrics.t1HitRate, 0.88, 0.82);
    this.checkThreshold('PROFIT_FACTOR', metrics.profitFactor, 2.5, 1.5);
    this.checkThreshold('MAX_DRAWDOWN', metrics.maxDrawdown, 0.08, 0.15, true); // Inverted (lower is better)
    this.checkThreshold('WIN_RATE', metrics.winRate, 0.55, 0.45);
    this.checkThreshold('ERROR_RATE', metrics.errorRate, 0.01, 0.05);

    // Check system health
    const health = this.assessSystemHealth(metrics);
    if (health !== 'HEALTHY') {
      this.recordAlert(
        health === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
        `System health: ${health}`,
        'SYSTEM_HEALTH'
      );
    }
  }

  private checkThreshold(metric: string, value: number, warningThreshold: number, criticalThreshold: number, inverted: boolean = false): void {
    let status: 'OK' | 'WARNING' | 'CRITICAL' = 'OK';
    let severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';

    if (inverted) {
      // For metrics where higher is worse (drawdown)
      if (value > criticalThreshold) {
        status = 'CRITICAL';
        severity = 'CRITICAL';
      } else if (value > warningThreshold) {
        status = 'WARNING';
        severity = 'WARNING';
      }
    } else {
      // For metrics where higher is better (hit rate, PF, etc.)
      if (value < criticalThreshold) {
        status = 'CRITICAL';
        severity = 'CRITICAL';
      } else if (value < warningThreshold) {
        status = 'WARNING';
        severity = 'WARNING';
      }
    }

    const snapshot: MetricsSnapshot = {
      timestamp: new Date(),
      metric,
      value,
      threshold: inverted ? warningThreshold : criticalThreshold,
      status,
    };

    this.metricsHistory.push(snapshot);

    if (status !== 'OK') {
      const message = `${metric} threshold breach: ${value.toFixed(3)} (threshold: ${(inverted ? warningThreshold : criticalThreshold).toFixed(3)})`;
      this.recordAlert(severity, message, metric, value);
    }
  }

  private assessSystemHealth(metrics: LiveMetrics): 'HEALTHY' | 'DEGRADED' | 'CRITICAL' {
    let criticalCount = 0;
    let warningCount = 0;

    // T1 hit rate check
    if (metrics.t1HitRate < 0.82) criticalCount++;
    else if (metrics.t1HitRate < 0.88) warningCount++;

    // Profit factor check
    if (metrics.profitFactor < 1.5) criticalCount++;
    else if (metrics.profitFactor < 2.5) warningCount++;

    // Drawdown check
    if (metrics.maxDrawdown > 0.15) criticalCount++;
    else if (metrics.maxDrawdown > 0.08) warningCount++;

    // Error rate check
    if (metrics.errorRate > 0.05) criticalCount++;
    else if (metrics.errorRate > 0.01) warningCount++;

    if (criticalCount >= 2) return 'CRITICAL';
    if (warningCount >= 3) return 'DEGRADED';
    return 'HEALTHY';
  }

  private calculateErrorRate(): number {
    if (this.systemErrors.length === 0) return 0;

    // Look at last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentErrors = this.systemErrors.filter((e) => e.timestamp > oneHourAgo).length;
    const totalOperations = Math.max(100, this.metrics.get('EXECUTED_TRADES')?.slice(-1)[0] || 100);

    return recentErrors / totalOperations;
  }

  // MARK: - Queries

  getCurrentMetrics(): LiveMetrics {
    return {
      timestamp: new Date(),
      activeUsers: this.metrics.get('ACTIVE_USERS')?.slice(-1)[0] || 0,
      activeSignals: this.metrics.get('ACTIVE_SIGNALS')?.slice(-1)[0] || 0,
      executedTrades: this.metrics.get('EXECUTED_TRADES')?.slice(-1)[0] || 0,
      totalPnL: this.metrics.get('TOTAL_PNL')?.slice(-1)[0] || 0,
      averagePnL: this.calculateAveragePnL(),
      t1HitRate: this.metrics.get('T1_HIT_RATE')?.slice(-1)[0] || 0,
      t2HitRate: 0, // Calculated separately if needed
      profitFactor: this.metrics.get('PROFIT_FACTOR')?.slice(-1)[0] || 0,
      maxDrawdown: this.metrics.get('MAX_DRAWDOWN')?.slice(-1)[0] || 0,
      currentDrawdown: 0, // Calculated separately if needed
      winRate: this.metrics.get('WIN_RATE')?.slice(-1)[0] || 0,
      sharpeRatio: 0, // Calculated separately if needed
      errorRate: this.calculateErrorRate(),
      systemHealth: this.assessSystemHealth({
        timestamp: new Date(),
        activeUsers: 0,
        activeSignals: 0,
        executedTrades: 0,
        totalPnL: 0,
        averagePnL: 0,
        t1HitRate: this.metrics.get('T1_HIT_RATE')?.slice(-1)[0] || 0,
        t2HitRate: 0,
        profitFactor: this.metrics.get('PROFIT_FACTOR')?.slice(-1)[0] || 0,
        maxDrawdown: this.metrics.get('MAX_DRAWDOWN')?.slice(-1)[0] || 0,
        currentDrawdown: 0,
        winRate: this.metrics.get('WIN_RATE')?.slice(-1)[0] || 0,
        sharpeRatio: 0,
        errorRate: this.calculateErrorRate(),
        systemHealth: 'HEALTHY',
      }),
    };
  }

  private calculateAveragePnL(): number {
    const totalPnL = this.metrics.get('TOTAL_PNL')?.slice(-1)[0] || 0;
    const trades = this.metrics.get('EXECUTED_TRADES')?.slice(-1)[0] || 1;
    return totalPnL / Math.max(trades, 1);
  }

  getMetricHistory(metric: string, limit: number = 100): MetricsSnapshot[] {
    return this.metricsHistory
      .filter((s) => s.metric === metric)
      .slice(-limit);
  }

  getAlerts(severity?: 'INFO' | 'WARNING' | 'CRITICAL', limit: number = 50): AlertEvent[] {
    return this.alerts
      .filter((a) => !severity || a.severity === severity)
      .slice(-limit);
  }

  getSystemErrors(limit: number = 50): Array<{ timestamp: Date; error: string }> {
    return this.systemErrors.slice(-limit);
  }

  // MARK: - Reporting

  printMetricsSummary(): void {
    const metrics = this.getCurrentMetrics();

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║ LIVE MONITORING METRICS                                ║`);
    console.log(`║ Timestamp: ${new Date().toLocaleString().padEnd(41)} ║`);
    console.log(`║ Health: ${this.padRight(metrics.systemHealth, 48)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Performance:                                           ║`);
    console.log(`║   T1 Hit Rate: ${this.padRight(`${(metrics.t1HitRate * 100).toFixed(1)}%`, 32)} ║`);
    console.log(`║   Profit Factor: ${this.padRight(`${metrics.profitFactor.toFixed(2)}`, 30)} ║`);
    console.log(`║   Max Drawdown: ${this.padRight(`${(metrics.maxDrawdown * 100).toFixed(1)}%`, 30)} ║`);
    console.log(`║   Win Rate: ${this.padRight(`${(metrics.winRate * 100).toFixed(1)}%`, 35)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Activity:                                              ║`);
    console.log(`║   Executed Trades: ${this.padRight(metrics.executedTrades.toString(), 26)} ║`);
    console.log(`║   Total P&L: ${this.padRight(`${metrics.totalPnL.toFixed(2)}R`, 32)} ║`);
    console.log(`║   Avg P&L: ${this.padRight(`${metrics.averagePnL.toFixed(2)}R`, 33)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ System:                                                ║`);
    console.log(`║   Error Rate: ${this.padRight(`${(metrics.errorRate * 100).toFixed(2)}%`, 31)} ║`);
    console.log(`║   Recent Alerts: ${this.padRight(this.getAlerts('WARNING').length.toString(), 29)} ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');
  }

  private padRight(str: string, width: number): string {
    return str + ' '.repeat(Math.max(0, width - str.length));
  }
}

export default LiveMonitoring;
