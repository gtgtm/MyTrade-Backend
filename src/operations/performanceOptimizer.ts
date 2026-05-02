// src/operations/performanceOptimizer.ts
// Performance Optimization - Continuous tuning and resource management

export interface PerformanceMetric {
  metric: string;
  current: number;
  target: number;
  unit: string;
  status: 'OPTIMAL' | 'ACCEPTABLE' | 'NEEDS_IMPROVEMENT' | 'CRITICAL';
  lastUpdated: Date;
}

export interface OptimizationAction {
  id: string;
  timestamp: Date;
  metric: string;
  action: string;
  expectedImprovement: number;
  unit: string;
  implemented: boolean;
  result?: number;
  impactScore: number; // 0-100, higher is better
}

export class PerformanceOptimizer {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private actions: OptimizationAction[] = [];
  private optimizationHistory: Array<{ timestamp: Date; changes: OptimizationAction[] }> = [];

  constructor() {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // Signal generation metrics
    this.metrics.set('signalLatency', {
      metric: 'Signal Latency',
      current: 4.2,
      target: 3.0,
      unit: 'ms',
      status: 'ACCEPTABLE',
      lastUpdated: new Date(),
    });

    // Trade execution metrics
    this.metrics.set('tradeLatency', {
      metric: 'Trade Execution Latency',
      current: 150.0,
      target: 100.0,
      unit: 'ms',
      status: 'ACCEPTABLE',
      lastUpdated: new Date(),
    });

    // Memory efficiency
    this.metrics.set('memoryPerSignal', {
      metric: 'Memory per Signal',
      current: 500.0,
      target: 350.0,
      unit: 'KB',
      status: 'NEEDS_IMPROVEMENT',
      lastUpdated: new Date(),
    });

    // Throughput
    this.metrics.set('throughput', {
      metric: 'Signal Throughput',
      current: 1000.0,
      target: 2000.0,
      unit: 'signals/sec',
      status: 'ACCEPTABLE',
      lastUpdated: new Date(),
    });

    // Cache hit rate
    this.metrics.set('cacheHitRate', {
      metric: 'Cache Hit Rate',
      current: 75.0,
      target: 90.0,
      unit: '%',
      status: 'NEEDS_IMPROVEMENT',
      lastUpdated: new Date(),
    });

    // Database query time
    this.metrics.set('queryLatency', {
      metric: 'Database Query Latency',
      current: 25.0,
      target: 15.0,
      unit: 'ms',
      status: 'ACCEPTABLE',
      lastUpdated: new Date(),
    });
  }

  updateMetric(metricKey: string, current: number): void {
    const metric = this.metrics.get(metricKey);
    if (!metric) {
      console.log(`⚠️ Unknown metric: ${metricKey}`);
      return;
    }

    metric.current = current;
    metric.lastUpdated = new Date();
    metric.status = this.assessStatus(current, metric.target);
  }

  private assessStatus(current: number, target: number): 'OPTIMAL' | 'ACCEPTABLE' | 'NEEDS_IMPROVEMENT' | 'CRITICAL' {
    const variance = Math.abs((current - target) / target) * 100;

    if (variance <= 5) return 'OPTIMAL';
    if (variance <= 15) return 'ACCEPTABLE';
    if (variance <= 30) return 'NEEDS_IMPROVEMENT';
    return 'CRITICAL';
  }

  recommendOptimizations(): OptimizationAction[] {
    const recommendations: OptimizationAction[] = [];

    // Analyze each metric
    for (const [key, metric] of this.metrics) {
      if (metric.status === 'CRITICAL' || metric.status === 'NEEDS_IMPROVEMENT') {
        const action = this.generateOptimizationAction(key, metric);
        if (action) {
          recommendations.push(action);
        }
      }
    }

    return recommendations;
  }

  private generateOptimizationAction(key: string, metric: PerformanceMetric): OptimizationAction | null {
    const id = `OPT-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

    switch (key) {
      case 'signalLatency':
        return {
          id,
          timestamp: new Date(),
          metric: 'Signal Latency',
          action: 'Implement signal indicator caching (Redis)',
          expectedImprovement: 1.2,
          unit: 'ms',
          implemented: false,
          impactScore: 85,
        };

      case 'tradeLatency':
        return {
          id,
          timestamp: new Date(),
          metric: 'Trade Execution Latency',
          action: 'Use connection pooling for broker API',
          expectedImprovement: 50.0,
          unit: 'ms',
          implemented: false,
          impactScore: 90,
        };

      case 'memoryPerSignal':
        return {
          id,
          timestamp: new Date(),
          metric: 'Memory per Signal',
          action: 'Implement signal compression and cleanup',
          expectedImprovement: 150.0,
          unit: 'KB',
          implemented: false,
          impactScore: 80,
        };

      case 'cacheHitRate':
        return {
          id,
          timestamp: new Date(),
          metric: 'Cache Hit Rate',
          action: 'Increase cache retention window from 1h to 4h',
          expectedImprovement: 15.0,
          unit: '%',
          implemented: false,
          impactScore: 75,
        };

      case 'queryLatency':
        return {
          id,
          timestamp: new Date(),
          metric: 'Database Query Latency',
          action: 'Add database query indices on hot fields',
          expectedImprovement: 10.0,
          unit: 'ms',
          implemented: false,
          impactScore: 88,
        };

      default:
        return null;
    }
  }

  implementOptimization(actionId: string, actualImprovement: number): void {
    const action = this.actions.find((a) => a.id === actionId);
    if (!action) {
      console.log(`⚠️ Action not found: ${actionId}`);
      return;
    }

    action.implemented = true;
    action.result = actualImprovement;

    const impactRatio = (actualImprovement / action.expectedImprovement) * 100;
    console.log(`✅ Optimization implemented: ${action.action}`);
    console.log(`   Expected: ${action.expectedImprovement}${action.unit}`);
    console.log(`   Actual: ${actualImprovement}${action.unit}`);
    console.log(`   Impact: ${impactRatio.toFixed(0)}% of expected`);
  }

  getMetricsStatus(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }

  getMetricsByStatus(status: string): PerformanceMetric[] {
    return Array.from(this.metrics.values()).filter((m) => m.status === status);
  }

  getOptimizationScore(): number {
    const metrics = Array.from(this.metrics.values());
    let score = 0;

    for (const metric of metrics) {
      switch (metric.status) {
        case 'OPTIMAL':
          score += 100;
          break;
        case 'ACCEPTABLE':
          score += 75;
          break;
        case 'NEEDS_IMPROVEMENT':
          score += 50;
          break;
        case 'CRITICAL':
          score += 0;
          break;
      }
    }

    return Math.round(score / metrics.length);
  }

  getOptimizationPriority(): OptimizationAction[] {
    return this.recommendOptimizations().sort((a, b) => b.impactScore - a.impactScore);
  }

  printOptimizationReport(): void {
    const optimalCount = this.getMetricsByStatus('OPTIMAL').length;
    const acceptableCount = this.getMetricsByStatus('ACCEPTABLE').length;
    const needsImprovementCount = this.getMetricsByStatus('NEEDS_IMPROVEMENT').length;
    const criticalCount = this.getMetricsByStatus('CRITICAL').length;
    const score = this.getOptimizationScore();
    const recommendations = this.recommendOptimizations();

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║ PERFORMANCE OPTIMIZATION REPORT                        ║`);
    console.log(`║ Overall Score: ${this.padRight(`${score}/100`, 40)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Metrics Status:                                        ║`);
    console.log(`║   🟢 Optimal: ${this.padRight(optimalCount.toString(), 41)} ║`);
    console.log(`║   🟡 Acceptable: ${this.padRight(acceptableCount.toString(), 37)} ║`);
    console.log(`║   🟠 Needs Improvement: ${this.padRight(needsImprovementCount.toString(), 27)} ║`);
    console.log(`║   🔴 Critical: ${this.padRight(criticalCount.toString(), 39)} ║`);
    console.log(`║                                                        ║`);

    if (recommendations.length > 0) {
      console.log(`║ Top Recommendations:                                   ║`);
      for (const rec of recommendations.slice(0, 3)) {
        const truncated = rec.action.substring(0, 42);
        console.log(`║   📌 ${truncated.padEnd(42)} ║`);
      }
    }

    console.log('╚════════════════════════════════════════════════════════╝\n');
  }

  private padRight(str: string, width: number): string {
    return str + ' '.repeat(Math.max(0, width - str.length));
  }
}

export default PerformanceOptimizer;
