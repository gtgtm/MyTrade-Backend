// src/deployment/phasedRollout.ts
// Phased Rollout Orchestration - 10% → 25% → 100% deployment

import { EventEmitter } from 'events';

/**
 * Phased Rollout Strategy:
 *
 * Phase 1: 10% (Week 1)
 * - Deploy to 10% of users
 * - Monitor metrics closely
 * - Exit criteria: All green after 7 days
 *
 * Phase 2: 25% (Week 2)
 * - Scale to 25% of users
 * - Continue monitoring
 * - Exit criteria: All green after 7 days
 *
 * Phase 3: 100% (Week 3)
 * - Full production deployment
 * - Normal monitoring
 * - Exit criteria: Stable for 7 days
 */

export enum RolloutPhase {
  PAUSED = 'PAUSED',
  PHASE_1_10_PERCENT = 'PHASE_1_10_PERCENT',
  PHASE_2_25_PERCENT = 'PHASE_2_25_PERCENT',
  PHASE_3_100_PERCENT = 'PHASE_3_100_PERCENT',
  COMPLETED = 'COMPLETED',
  HALTED = 'HALTED',
}

export interface RolloutConfig {
  phase1Duration: number; // hours (168 = 1 week)
  phase2Duration: number; // hours (168 = 1 week)
  phase3Duration: number; // hours (168 = 1 week)

  phase1Threshold: {
    t1HitRate: number; // 88%
    profitFactor: number; // 2.5
    maxDrawdown: number; // 8%
  };

  phase2Threshold: {
    t1HitRate: number; // 88%
    profitFactor: number; // 2.4
    maxDrawdown: number; // 9%
  };

  phase3Threshold: {
    t1HitRate: number; // 86%
    profitFactor: number; // 2.2
    maxDrawdown: number; // 10%
  };

  autoScale: boolean; // Auto-scale if metrics OK
  autoHalt: boolean; // Auto-halt if divergence > 15%
}

export interface RolloutStatus {
  phase: RolloutPhase;
  startTime: Date;
  endTime?: Date;
  userPercentage: number;
  signalsGenerated: number;
  tradesExecuted: number;
  totalPnL: number;
  metrics: {
    t1HitRate: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number;
    winRate: number;
  };
  health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  readyToScale: boolean;
  exitReason?: string;
}

export interface UserBucket {
  id: string;
  phase: RolloutPhase;
  assignedAt: Date;
  status: 'ACTIVE' | 'PAUSED' | 'HALTED';
  signalsGenerated: number;
  tradesExecuted: number;
  totalPnL: number;
}

export class PhasedRollout extends EventEmitter {
  private config: RolloutConfig;
  private currentPhase: RolloutPhase = RolloutPhase.PAUSED;
  private phaseStartTime: Date = new Date();
  private userBuckets: Map<string, UserBucket> = new Map();
  private metrics: RolloutStatus = this.createEmptyStatus();
  private healthCheckInterval: NodeJS.Timer | null = null;

  constructor(config: RolloutConfig) {
    super();
    this.config = config;
  }

  // MARK: - Phase Management

  startPhase1(tenPercentUserIds: string[]): void {
    console.log(`🟢 PHASE 1: Starting 10% rollout with ${tenPercentUserIds.length} users`);

    this.currentPhase = RolloutPhase.PHASE_1_10_PERCENT;
    this.phaseStartTime = new Date();

    for (const userId of tenPercentUserIds) {
      this.userBuckets.set(userId, {
        id: userId,
        phase: RolloutPhase.PHASE_1_10_PERCENT,
        assignedAt: new Date(),
        status: 'ACTIVE',
        signalsGenerated: 0,
        tradesExecuted: 0,
        totalPnL: 0,
      });
    }

    this.startHealthChecks();
    this.emit('phase-started', { phase: 'PHASE_1', users: tenPercentUserIds.length });
  }

  async scaleToPhase2(twentyFivePercentUserIds: string[]): Promise<boolean> {
    const phaseElapsed = this.getPhaseElapsed();
    const metricsOK = this.checkMetricsThreshold('PHASE_1');

    if (phaseElapsed < this.config.phase1Duration && !metricsOK) {
      console.log(`❌ Phase 1 exit criteria not met. Metrics OK: ${metricsOK}, Elapsed: ${phaseElapsed}h`);
      return false;
    }

    console.log(`🟡 PHASE 2: Scaling to 25% with ${twentyFivePercentUserIds.length} users`);

    // Add new users from phase 2
    const newUsersCount = twentyFivePercentUserIds.filter((id) => !this.userBuckets.has(id)).length;

    for (const userId of twentyFivePercentUserIds) {
      if (!this.userBuckets.has(userId)) {
        this.userBuckets.set(userId, {
          id: userId,
          phase: RolloutPhase.PHASE_2_25_PERCENT,
          assignedAt: new Date(),
          status: 'ACTIVE',
          signalsGenerated: 0,
          tradesExecuted: 0,
          totalPnL: 0,
        });
      }
    }

    this.currentPhase = RolloutPhase.PHASE_2_25_PERCENT;
    this.phaseStartTime = new Date();

    this.emit('phase-scaled', { phase: 'PHASE_2', totalUsers: twentyFivePercentUserIds.length, newUsers: newUsersCount });
    return true;
  }

  async scaleToPhase3(allUserIds: string[]): Promise<boolean> {
    const phaseElapsed = this.getPhaseElapsed();
    const metricsOK = this.checkMetricsThreshold('PHASE_2');

    if (phaseElapsed < this.config.phase2Duration && !metricsOK) {
      console.log(`❌ Phase 2 exit criteria not met. Metrics OK: ${metricsOK}, Elapsed: ${phaseElapsed}h`);
      return false;
    }

    console.log(`🟢 PHASE 3: Scaling to 100% with ${allUserIds.length} users`);

    // Add remaining users
    const newUsersCount = allUserIds.filter((id) => !this.userBuckets.has(id)).length;

    for (const userId of allUserIds) {
      if (!this.userBuckets.has(userId)) {
        this.userBuckets.set(userId, {
          id: userId,
          phase: RolloutPhase.PHASE_3_100_PERCENT,
          assignedAt: new Date(),
          status: 'ACTIVE',
          signalsGenerated: 0,
          tradesExecuted: 0,
          totalPnL: 0,
        });
      }
    }

    this.currentPhase = RolloutPhase.PHASE_3_100_PERCENT;
    this.phaseStartTime = new Date();

    this.emit('phase-scaled', { phase: 'PHASE_3', totalUsers: allUserIds.length, newUsers: newUsersCount });
    return true;
  }

  // MARK: - Monitoring

  private startHealthChecks(): void {
    // Check health every 5 minutes
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 5 * 60 * 1000);
  }

  private performHealthCheck(): void {
    const health = this.assessHealth();
    console.log(`\n📊 Health Check - Phase: ${this.currentPhase}, Health: ${health}`);

    if (this.config.autoHalt && health === 'CRITICAL') {
      this.halt('CRITICAL health status');
    }
  }

  private assessHealth(): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
    const thresholds = this.getThresholdsForPhase();

    let criticalCount = 0;
    let warningCount = 0;

    // Check T1 hit rate
    if (this.metrics.metrics.t1HitRate < thresholds.t1HitRate * 0.95) criticalCount++;
    else if (this.metrics.metrics.t1HitRate < thresholds.t1HitRate) warningCount++;

    // Check profit factor
    if (this.metrics.metrics.profitFactor < thresholds.profitFactor * 0.90) criticalCount++;
    else if (this.metrics.metrics.profitFactor < thresholds.profitFactor) warningCount++;

    // Check max drawdown
    if (this.metrics.metrics.maxDrawdown > thresholds.maxDrawdown * 1.15) criticalCount++;
    else if (this.metrics.metrics.maxDrawdown > thresholds.maxDrawdown) warningCount++;

    if (criticalCount >= 2) return 'CRITICAL';
    if (warningCount >= 2) return 'WARNING';
    return 'HEALTHY';
  }

  private checkMetricsThreshold(phase: string): boolean {
    const thresholds = phase === 'PHASE_1' ? this.config.phase1Threshold :
                       phase === 'PHASE_2' ? this.config.phase2Threshold :
                       this.config.phase3Threshold;

    return (
      this.metrics.metrics.t1HitRate >= thresholds.t1HitRate &&
      this.metrics.metrics.profitFactor >= thresholds.profitFactor &&
      this.metrics.metrics.maxDrawdown <= thresholds.maxDrawdown
    );
  }

  private getThresholdsForPhase() {
    switch (this.currentPhase) {
      case RolloutPhase.PHASE_1_10_PERCENT:
        return this.config.phase1Threshold;
      case RolloutPhase.PHASE_2_25_PERCENT:
        return this.config.phase2Threshold;
      default:
        return this.config.phase3Threshold;
    }
  }

  // MARK: - Trade Tracking

  recordTrade(userId: string, symbolExecuted: boolean, pnlR: number): void {
    const bucket = this.userBuckets.get(userId);
    if (bucket) {
      if (symbolExecuted) bucket.tradesExecuted++;
      bucket.totalPnL += pnlR;
    }

    // Update aggregate metrics
    this.metrics.tradesExecuted++;
    this.metrics.totalPnL += pnlR;
  }

  recordSignal(userId: string): void {
    const bucket = this.userBuckets.get(userId);
    if (bucket) {
      bucket.signalsGenerated++;
    }
    this.metrics.signalsGenerated++;
  }

  updateMetrics(
    t1HitRate: number,
    profitFactor: number,
    maxDrawdown: number,
    sharpeRatio: number,
    winRate: number
  ): void {
    this.metrics.metrics = {
      t1HitRate,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
      winRate,
    };
  }

  // MARK: - Control

  pause(): void {
    this.currentPhase = RolloutPhase.PAUSED;
    console.log('⏸️ Rollout paused');
    this.emit('rollout-paused');
  }

  resume(): void {
    if (this.currentPhase === RolloutPhase.HALTED) {
      console.log('❌ Cannot resume - rollout halted');
      return;
    }
    console.log('▶️ Rollout resumed');
    this.emit('rollout-resumed');
  }

  halt(reason: string): void {
    this.currentPhase = RolloutPhase.HALTED;
    this.metrics.exitReason = reason;
    console.log(`🛑 Rollout HALTED: ${reason}`);
    this.emit('rollout-halted', { reason });

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  complete(): void {
    this.currentPhase = RolloutPhase.COMPLETED;
    this.metrics.endTime = new Date();
    console.log('✅ Rollout COMPLETED successfully');
    this.emit('rollout-completed');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  // MARK: - Status & Reporting

  getStatus(): RolloutStatus {
    return {
      ...this.metrics,
      phase: this.currentPhase,
      startTime: this.phaseStartTime,
      userPercentage: this.getUserPercentage(),
      health: this.assessHealth(),
      readyToScale: this.checkMetricsThreshold(this.currentPhase),
    };
  }

  private getUserPercentage(): number {
    switch (this.currentPhase) {
      case RolloutPhase.PHASE_1_10_PERCENT:
        return 10;
      case RolloutPhase.PHASE_2_25_PERCENT:
        return 25;
      case RolloutPhase.PHASE_3_100_PERCENT:
        return 100;
      default:
        return 0;
    }
  }

  private getPhaseElapsed(): number {
    const elapsed = Date.now() - this.phaseStartTime.getTime();
    return elapsed / (1000 * 60 * 60); // Convert to hours
  }

  private createEmptyStatus(): RolloutStatus {
    return {
      phase: RolloutPhase.PAUSED,
      startTime: new Date(),
      userPercentage: 0,
      signalsGenerated: 0,
      tradesExecuted: 0,
      totalPnL: 0,
      metrics: {
        t1HitRate: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        winRate: 0,
      },
      health: 'HEALTHY',
      readyToScale: false,
    };
  }

  getUserCount(phase?: RolloutPhase): number {
    const targetPhase = phase || this.currentPhase;
    return Array.from(this.userBuckets.values()).filter((b) => b.phase === targetPhase).length;
  }

  getUserBuckets(): Map<string, UserBucket> {
    return this.userBuckets;
  }

  getCurrentPhase(): RolloutPhase {
    return this.currentPhase;
  }

  printStatus(): void {
    const status = this.getStatus();
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║ PHASED ROLLOUT STATUS                                  ║`);
    console.log(`║ Phase: ${this.padRight(status.phase, 45)} ║`);
    console.log(`║ Users: ${this.padRight(`${this.getUserCount()}/${status.userPercentage}%`, 45)} ║`);
    console.log(`║ Health: ${this.padRight(status.health, 44)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Metrics:                                               ║`);
    console.log(`║   T1 Hit Rate: ${this.padRight(`${(status.metrics.t1HitRate * 100).toFixed(1)}%`, 32)} ║`);
    console.log(`║   Profit Factor: ${this.padRight(`${status.metrics.profitFactor.toFixed(2)}`, 30)} ║`);
    console.log(`║   Max Drawdown: ${this.padRight(`${(status.metrics.maxDrawdown * 100).toFixed(1)}%`, 30)} ║`);
    console.log(`║ Ready to Scale: ${this.padRight(status.readyToScale ? 'YES' : 'NO', 32)} ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');
  }

  private padRight(str: string, width: number): string {
    return str + ' '.repeat(Math.max(0, width - str.length));
  }
}

// MARK: - Export

export default PhasedRollout;
