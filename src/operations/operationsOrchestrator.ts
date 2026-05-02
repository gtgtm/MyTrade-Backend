// src/operations/operationsOrchestrator.ts
// Operations Orchestrator - Coordinate all systems for full production deployment

import { PhasedRollout, RolloutPhase } from '../deployment/phasedRollout';
import { LiveMonitoring } from '../deployment/liveMonitoring';
import { AutoScaler } from '../deployment/autoScaler';
import { IncidentManager } from './incidentManager';
import { CircuitBreakerPool } from './circuitBreaker';
import { MonitoringService } from './monitoringService';
import { PerformanceOptimizer } from './performanceOptimizer';
import { AnalyticsEngine } from './analyticsEngine';
import { EventEmitter } from 'events';

export enum DeploymentStage {
  INITIALIZATION = 'INITIALIZATION',
  PHASE_1_ACTIVE = 'PHASE_1_ACTIVE',
  PHASE_2_ACTIVE = 'PHASE_2_ACTIVE',
  PHASE_3_ACTIVE = 'PHASE_3_ACTIVE',
  FULL_PRODUCTION = 'FULL_PRODUCTION',
}

export interface OperationsStatus {
  stage: DeploymentStage;
  timestamp: Date;
  uptime: number; // seconds
  activeUsers: number;
  userPercentage: number;
  systemHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  circuitBreakersOpen: number;
  openIncidents: number;
  autoRecoveryRate: number; // %
  optimizationScore: number; // 0-100
}

export class OperationsOrchestrator extends EventEmitter {
  private stage: DeploymentStage = DeploymentStage.INITIALIZATION;
  private startTime: Date = new Date();

  // Core systems
  private rollout: PhasedRollout;
  private monitoring: LiveMonitoring;
  private autoScaler: AutoScaler;
  private incidents: IncidentManager;
  private circuitBreakers: CircuitBreakerPool;
  private healthMonitoring: MonitoringService;
  private optimizer: PerformanceOptimizer;
  private analytics: AnalyticsEngine;

  // Status tracking
  private statusHistory: OperationsStatus[] = [];
  private statusCheckInterval: NodeJS.Timer | null = null;

  constructor(
    rollout: PhasedRollout,
    monitoring: LiveMonitoring,
    autoScaler: AutoScaler,
    incidents: IncidentManager,
    circuitBreakers: CircuitBreakerPool,
    healthMonitoring: MonitoringService,
    optimizer: PerformanceOptimizer,
    analytics: AnalyticsEngine
  ) {
    super();

    this.rollout = rollout;
    this.monitoring = monitoring;
    this.autoScaler = autoScaler;
    this.incidents = incidents;
    this.circuitBreakers = circuitBreakers;
    this.healthMonitoring = healthMonitoring;
    this.optimizer = optimizer;
    this.analytics = analytics;
  }

  async initialize(): Promise<void> {
    console.log('\n🚀 INITIALIZING PRODUCTION OPERATIONS\n');

    // Initialize all systems
    this.rollout.startPhase1([]);
    this.monitoring.startMonitoring(60); // Every 60 seconds
    this.healthMonitoring.startMonitoring(60); // Every 60 seconds
    this.optimizer.printOptimizationReport();
    this.analytics.startAnalytics(60); // Every 60 minutes

    // Setup event handlers
    this.setupEventHandlers();

    // Start status tracking
    this.startStatusTracking();

    this.stage = DeploymentStage.PHASE_1_ACTIVE;
    this.emit('operations-initialized');

    console.log('✅ Production operations initialized');
    console.log('   - Phased rollout: Ready');
    console.log('   - Live monitoring: Active');
    console.log('   - Health checks: Every 60s');
    console.log('   - Incident management: Armed');
    console.log('   - Circuit breakers: Ready');
    console.log('   - Performance optimizer: Active');
    console.log('   - Analytics engine: Running\n');
  }

  private setupEventHandlers(): void {
    // Monitor incidents
    this.incidents.on('incident-reported', (incident) => {
      console.log(`⚠️ Incident reported: ${incident.type}`);
    });

    this.incidents.on('incident-resolved', (incident) => {
      console.log(`✅ Incident resolved: ${incident.type}`);
    });

    this.incidents.on('incident-escalated', (incident) => {
      console.log(`🚨 Incident escalated: ${incident.type}`);
      this.emit('critical-alert', incident);
    });

    // Monitor health
    this.healthMonitoring.on('alert', (alert) => {
      console.log(
        `⚠️ Health alert: ${alert.message} (severity: ${alert.severity})`
      );
      this.emit('health-alert', alert);
    });
  }

  private startStatusTracking(): void {
    this.statusCheckInterval = setInterval(() => {
      this.recordStatus();
    }, 60000); // Every minute
  }

  private recordStatus(): void {
    const rolloutStatus = this.rollout.getStatus();
    const health = this.healthMonitoring.getCurrentMetrics();
    const breakers = this.circuitBreakers.getHealthStatus();
    const incidents = this.incidents.getOpenIncidents();
    const optimizationScore = this.optimizer.getOptimizationScore();
    const recoveryStats = this.incidents.getAutoRecoveryStats();

    const breakersOpen = Object.values(breakers).filter(
      (state) => state === 'OPEN'
    ).length;

    const status: OperationsStatus = {
      stage: this.stage,
      timestamp: new Date(),
      uptime: (Date.now() - this.startTime.getTime()) / 1000,
      activeUsers: this.rollout.getUserCount(),
      userPercentage: rolloutStatus.userPercentage,
      systemHealth: health?.systemHealth || 'HEALTHY',
      circuitBreakersOpen: breakersOpen,
      openIncidents: incidents.length,
      autoRecoveryRate: recoveryStats.recoveryRate,
      optimizationScore,
    };

    this.statusHistory.push(status);
    if (this.statusHistory.length > 1440) {
      // Keep 24 hours at 1-minute intervals
      this.statusHistory.shift();
    }

    // Check for phase progression
    this.checkPhaseProgression();
  }

  private checkPhaseProgression(): void {
    const rolloutStatus = this.rollout.getStatus();

    if (this.stage === DeploymentStage.PHASE_1_ACTIVE && rolloutStatus.readyToScale) {
      console.log('\n🚀 AUTO-SCALING TO PHASE 2 (25%)');
      this.stage = DeploymentStage.PHASE_2_ACTIVE;
      this.emit('phase-scaled', { fromPhase: 'PHASE_1', toPhase: 'PHASE_2' });
    } else if (
      this.stage === DeploymentStage.PHASE_2_ACTIVE &&
      rolloutStatus.readyToScale
    ) {
      console.log('\n🚀 AUTO-SCALING TO PHASE 3 (100%)');
      this.stage = DeploymentStage.PHASE_3_ACTIVE;
      this.emit('phase-scaled', { fromPhase: 'PHASE_2', toPhase: 'PHASE_3' });
      this.stage = DeploymentStage.FULL_PRODUCTION;
    }
  }

  async executeOptimization(): Promise<void> {
    console.log('\n📊 EXECUTING PERFORMANCE OPTIMIZATION\n');

    const recommendations = this.optimizer.getOptimizationPriority();

    for (const rec of recommendations.slice(0, 3)) {
      console.log(`📌 Implementing: ${rec.action}`);
      // In production, this would execute the actual optimization
      // For now, simulate result
      const improvement = rec.expectedImprovement * 0.8; // 80% of expected
      this.optimizer.implementOptimization(rec.id, improvement);
    }

    this.optimizer.printOptimizationReport();
  }

  generateOperationsReport(): void {
    const status = this.statusHistory[this.statusHistory.length - 1];
    const analyticsReport = this.analytics.generateAnalyticsReport('DAILY');

    if (!status) {
      console.log('No status data available');
      return;
    }

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║ PRODUCTION OPERATIONS REPORT                           ║`);
    console.log(`║ Stage: ${status.stage.padEnd(42)} ║`);
    console.log(`║ Uptime: ${this.padRight(`${Math.floor(status.uptime / 3600)}h`, 42)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Deployment Status:                                     ║`);
    console.log(
      `║   Active Users: ${this.padRight(`${status.activeUsers}`, 31)} ║`
    );
    console.log(
      `║   Coverage: ${this.padRight(`${status.userPercentage}%`, 36)} ║`
    );
    console.log(`║   System Health: ${this.padRight(status.systemHealth, 29)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Reliability:                                           ║`);
    console.log(
      `║   Open Incidents: ${this.padRight(status.openIncidents.toString(), 28)} ║`
    );
    console.log(
      `║   Circuit Breakers OPEN: ${this.padRight(status.circuitBreakersOpen.toString(), 20)} ║`
    );
    console.log(
      `║   Auto-Recovery Rate: ${this.padRight(`${status.autoRecoveryRate.toFixed(1)}%`, 24)} ║`
    );
    console.log(`║                                                        ║`);
    console.log(`║ Performance:                                           ║`);
    console.log(
      `║   Optimization Score: ${this.padRight(`${status.optimizationScore}/100`, 23)} ║`
    );
    console.log(`║   Profit Factor: ${this.padRight(`${analyticsReport.metrics.profitFactor.toFixed(2)}`, 30)} ║`);
    console.log(`║   Hit Rate: ${this.padRight(`${(analyticsReport.metrics.t1HitRate * 100).toFixed(1)}%`, 35)} ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');
  }

  shutdown(): void {
    console.log('\n⏹️ SHUTTING DOWN PRODUCTION OPERATIONS\n');

    this.monitoring.stopMonitoring();
    this.healthMonitoring.stopMonitoring();
    this.analytics.stopAnalytics();
    this.rollout.complete();

    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }

    console.log('✅ Operations shutdown complete');
    this.emit('operations-shutdown');
  }

  getStatus(): OperationsStatus | undefined {
    return this.statusHistory[this.statusHistory.length - 1];
  }

  getStage(): DeploymentStage {
    return this.stage;
  }

  getStatusHistory(limit: number = 60): OperationsStatus[] {
    return this.statusHistory.slice(-limit);
  }

  private padRight(str: string, width: number): string {
    return str + ' '.repeat(Math.max(0, width - str.length));
  }
}

export default OperationsOrchestrator;
