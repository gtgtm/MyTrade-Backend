// src/operations/monitoringService.ts
// 24/7 Monitoring Service - Continuous health tracking and alerting

import { EventEmitter } from 'events';

export interface HealthMetrics {
  timestamp: Date;
  signalLatency: number; // ms
  tradeLatency: number; // ms
  priceUpdateLatency: number; // ms
  memoryUsage: number; // MB
  cpuUsage: number; // %
  activeSignals: number;
  executedTrades: number;
  pendingNotifications: number;
  errorCount: number;
  errorRate: number; // %
  uptime: number; // seconds
  systemHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
}

export interface HealthThresholds {
  maxSignalLatency: number; // ms
  maxTradeLatency: number; // ms
  maxPriceUpdateLatency: number; // ms
  maxMemoryUsage: number; // MB
  maxCpuUsage: number; // %
  maxErrorRate: number; // %
  minUptime: number; // seconds
}

export class MonitoringService extends EventEmitter {
  private metrics: HealthMetrics[] = [];
  private thresholds: HealthThresholds;
  private monitoringInterval: NodeJS.Timer | null = null;
  private startTime: Date = new Date();
  private consecutiveHealthyChecks: number = 0;
  private consecutiveDegradedChecks: number = 0;
  private alertsSuppressed: Map<string, Date> = new Map();

  constructor(thresholds: Partial<HealthThresholds> = {}) {
    super();

    this.thresholds = {
      maxSignalLatency: thresholds.maxSignalLatency || 100, // 100ms
      maxTradeLatency: thresholds.maxTradeLatency || 500, // 500ms
      maxPriceUpdateLatency: thresholds.maxPriceUpdateLatency || 50, // 50ms
      maxMemoryUsage: thresholds.maxMemoryUsage || 1024, // 1GB
      maxCpuUsage: thresholds.maxCpuUsage || 80, // 80%
      maxErrorRate: thresholds.maxErrorRate || 5, // 5%
      minUptime: thresholds.minUptime || 3600, // 1 hour
    };
  }

  startMonitoring(intervalSeconds: number = 60): void {
    if (this.monitoringInterval) {
      console.log('⚠️ Monitoring already running');
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalSeconds * 1000);

    console.log(`✅ Monitoring started (${intervalSeconds}s intervals)`);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('⏹️ Monitoring stopped');
  }

  private async performHealthCheck(): Promise<void> {
    const metrics = await this.gatherMetrics();
    const health = this.assessHealth(metrics);

    metrics.systemHealth = health;
    this.metrics.push(metrics);

    // Keep last 1440 checks (24 hours at 1-minute intervals)
    if (this.metrics.length > 1440) {
      this.metrics.shift();
    }

    // Track consecutive health/degraded checks for trend analysis
    if (health === 'HEALTHY') {
      this.consecutiveHealthyChecks++;
      this.consecutiveDegradedChecks = 0;
    } else if (health === 'DEGRADED') {
      this.consecutiveDegradedChecks++;
      this.consecutiveHealthyChecks = 0;
    }

    // Emit events
    this.emit('health-check', metrics);

    if (health === 'CRITICAL') {
      this.emitAlert('CRITICAL', `System health critical`, metrics);
    } else if (health === 'DEGRADED' && this.consecutiveDegradedChecks >= 3) {
      this.emitAlert('WARNING', `System degraded for 3+ consecutive checks`, metrics);
    }

    this.printHealthSummary(metrics);
  }

  private async gatherMetrics(): Promise<HealthMetrics> {
    // In production, these would be gathered from actual system monitoring
    const memUsage = process.memoryUsage();
    const uptime = (Date.now() - this.startTime.getTime()) / 1000;

    return {
      timestamp: new Date(),
      signalLatency: Math.random() * 100, // Simulated 0-100ms
      tradeLatency: Math.random() * 200, // Simulated 0-200ms
      priceUpdateLatency: Math.random() * 50, // Simulated 0-50ms
      memoryUsage: memUsage.heapUsed / 1024 / 1024, // Convert to MB
      cpuUsage: Math.random() * 50, // Simulated 0-50%
      activeSignals: Math.floor(Math.random() * 1000),
      executedTrades: Math.floor(Math.random() * 5000),
      pendingNotifications: Math.floor(Math.random() * 100),
      errorCount: Math.floor(Math.random() * 10),
      errorRate: Math.random() * 2, // Simulated 0-2%
      uptime,
      systemHealth: 'HEALTHY', // Will be set by assessHealth
    };
  }

  private assessHealth(metrics: HealthMetrics): 'HEALTHY' | 'DEGRADED' | 'CRITICAL' {
    let issues = 0;

    // Check latencies
    if (metrics.signalLatency > this.thresholds.maxSignalLatency) issues++;
    if (metrics.tradeLatency > this.thresholds.maxTradeLatency) issues++;
    if (metrics.priceUpdateLatency > this.thresholds.maxPriceUpdateLatency) issues++;

    // Check resources
    if (metrics.memoryUsage > this.thresholds.maxMemoryUsage) issues++;
    if (metrics.cpuUsage > this.thresholds.maxCpuUsage) issues++;

    // Check error rate
    if (metrics.errorRate > this.thresholds.maxErrorRate) issues++;

    // Check uptime
    if (metrics.uptime < this.thresholds.minUptime) issues++;

    if (issues >= 3) return 'CRITICAL';
    if (issues >= 1) return 'DEGRADED';
    return 'HEALTHY';
  }

  private emitAlert(severity: string, message: string, metrics: HealthMetrics): void {
    const alertKey = `${severity}-${message}`;
    const lastAlertTime = this.alertsSuppressed.get(alertKey);

    // Suppress duplicate alerts within 5 minutes
    if (lastAlertTime && Date.now() - lastAlertTime.getTime() < 300000) {
      return;
    }

    this.alertsSuppressed.set(alertKey, new Date());
    this.emit('alert', { severity, message, metrics });
  }

  private printHealthSummary(metrics: HealthMetrics): void {
    const healthIcon = this.getHealthIcon(metrics.systemHealth);

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║ SYSTEM HEALTH CHECK                                    ║`);
    console.log(`║ ${healthIcon} Status: ${metrics.systemHealth.padEnd(41)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Performance:                                           ║`);
    console.log(
      `║   Signal Latency: ${this.padRight(`${metrics.signalLatency.toFixed(1)}ms`, 29)} ║`
    );
    console.log(
      `║   Trade Latency: ${this.padRight(`${metrics.tradeLatency.toFixed(1)}ms`, 30)} ║`
    );
    console.log(
      `║   Price Update Latency: ${this.padRight(`${metrics.priceUpdateLatency.toFixed(1)}ms`, 20)} ║`
    );
    console.log(`║                                                        ║`);
    console.log(`║ Resources:                                             ║`);
    console.log(`║   Memory: ${this.padRight(`${metrics.memoryUsage.toFixed(0)}MB`, 37)} ║`);
    console.log(`║   CPU: ${this.padRight(`${metrics.cpuUsage.toFixed(1)}%`, 41)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Activity:                                              ║`);
    console.log(`║   Active Signals: ${this.padRight(metrics.activeSignals.toString(), 29)} ║`);
    console.log(`║   Executed Trades: ${this.padRight(metrics.executedTrades.toString(), 28)} ║`);
    console.log(`║   Error Rate: ${this.padRight(`${metrics.errorRate.toFixed(2)}%`, 32)} ║`);
    console.log(`║   Uptime: ${this.padRight(`${Math.floor(metrics.uptime / 3600)}h`, 37)} ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');
  }

  getCurrentMetrics(): HealthMetrics | undefined {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : undefined;
  }

  getMetricsHistory(limit: number = 60): HealthMetrics[] {
    return this.metrics.slice(-limit);
  }

  getAverageMetrics(minutes: number = 60): HealthMetrics | null {
    const now = Date.now();
    const window = minutes * 60 * 1000;
    const relevant = this.metrics.filter((m) => now - m.timestamp.getTime() <= window);

    if (relevant.length === 0) return null;

    const avg: HealthMetrics = {
      timestamp: new Date(),
      signalLatency: relevant.reduce((sum, m) => sum + m.signalLatency, 0) / relevant.length,
      tradeLatency: relevant.reduce((sum, m) => sum + m.tradeLatency, 0) / relevant.length,
      priceUpdateLatency:
        relevant.reduce((sum, m) => sum + m.priceUpdateLatency, 0) / relevant.length,
      memoryUsage: relevant.reduce((sum, m) => sum + m.memoryUsage, 0) / relevant.length,
      cpuUsage: relevant.reduce((sum, m) => sum + m.cpuUsage, 0) / relevant.length,
      activeSignals: Math.round(
        relevant.reduce((sum, m) => sum + m.activeSignals, 0) / relevant.length
      ),
      executedTrades: Math.round(
        relevant.reduce((sum, m) => sum + m.executedTrades, 0) / relevant.length
      ),
      pendingNotifications: Math.round(
        relevant.reduce((sum, m) => sum + m.pendingNotifications, 0) / relevant.length
      ),
      errorCount: Math.round(relevant.reduce((sum, m) => sum + m.errorCount, 0) / relevant.length),
      errorRate: relevant.reduce((sum, m) => sum + m.errorRate, 0) / relevant.length,
      uptime: relevant[relevant.length - 1]?.uptime || 0,
      systemHealth: 'HEALTHY', // Will be set by assessHealth
    };

    avg.systemHealth = this.assessHealth(avg);
    return avg;
  }

  private getHealthIcon(health: string): string {
    switch (health) {
      case 'HEALTHY':
        return '✅';
      case 'DEGRADED':
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

export default MonitoringService;
