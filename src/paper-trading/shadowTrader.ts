// src/paper-trading/shadowTrader.ts
// Shadow Trading Mode - Track signals without executing real trades

import { SignalV2, SignalStatus } from '../types/signal';
import { ExitManager, SignalOutcome } from '../services/exitManager';

/**
 * Shadow Trading:
 * - Generate signals in real-time
 * - Track entry, targets, SL hits
 * - Calculate P&L (hypothetical)
 * - Compare against backtest metrics
 * - Log all activity for analysis
 *
 * Key Metrics:
 * - T1 hit rate (actual vs backtest)
 * - Profit factor (actual vs backtest)
 * - Max drawdown (actual vs backtest)
 * - Sharpe ratio (actual vs backtest)
 * - Win rate (actual vs backtest)
 */

export interface ShadowTradeConfig {
  enabled: boolean;
  backtestMetrics: BacktestMetrics;
  divergenceThreshold: number; // 5% = 0.05
  autoHaltEnabled: boolean;
  logToFile: boolean;
}

export interface BacktestMetrics {
  t1HitRate: number; // 0.90
  profitFactor: number; // 2.8
  maxDrawdown: number; // 0.07
  sharpeRatio: number; // 2.3
  winRate: number; // 0.68
  avgPnL: number; // 0.35
}

export interface ShadowTradeSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  signalsGenerated: number;
  signalsCompleted: number;
  backtestMetrics: BacktestMetrics;
  liveMetrics: LiveMetrics;
  divergences: Divergence[];
  status: 'RUNNING' | 'PAUSED' | 'HALTED' | 'COMPLETED';
}

export interface LiveMetrics {
  t1HitRate: number;
  t2HitRate: number;
  t3HitRate: number;
  t4HitRate: number;
  profitFactor: number;
  maxDrawdown: number;
  currentDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  avgPnL: number;
  totalPnL: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  largestWin: number;
  largestLoss: number;
}

export interface Divergence {
  metric: string;
  backtestValue: number;
  liveValue: number;
  percentDifference: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: Date;
}

export class ShadowTrader {
  private config: ShadowTradeConfig;
  private session: ShadowTradeSession;
  private exitManager: ExitManager;
  private completedTrades: SignalOutcome[] = [];
  private divergenceHistory: Divergence[] = [];
  private halted = false;

  constructor(config: ShadowTradeConfig) {
    this.config = config;
    this.exitManager = new ExitManager();

    this.session = {
      sessionId: this.generateSessionId(),
      startTime: new Date(),
      signalsGenerated: 0,
      signalsCompleted: 0,
      backtestMetrics: config.backtestMetrics,
      liveMetrics: this.createEmptyMetrics(),
      divergences: [],
      status: 'RUNNING',
    };
  }

  // MARK: - Signal Tracking

  registerSignal(signal: SignalV2): void {
    if (this.halted) {
      console.log(`🛑 Shadow trading halted. Signal ${signal.id} not tracked.`);
      return;
    }

    console.log(`📊 [SHADOW] Registering signal ${signal.symbol} ${signal.direction}`);
    this.exitManager.registerSignal(signal);
    this.session.signalsGenerated++;
  }

  processPriceUpdate(signalId: string, priceData: any): void {
    if (this.halted) return;

    const outcome = this.exitManager.processPriceTick(signalId, priceData);

    if (outcome) {
      this.completedTrades.push(outcome);
      this.session.signalsCompleted++;

      this.logTradeCompletion(outcome);
      this.checkDivergences();
    }
  }

  // MARK: - Metrics Calculation

  private calculateLiveMetrics(): LiveMetrics {
    const trades = this.completedTrades;

    if (trades.length === 0) {
      return this.createEmptyMetrics();
    }

    // Target hit rates
    const t1HitRate = trades.filter((t) => t.targetHits.t1).length / trades.length;
    const t2HitRate = trades.filter((t) => t.targetHits.t2).length / trades.length;
    const t3HitRate = trades.filter((t) => t.targetHits.t3).length / trades.length;
    const t4HitRate = trades.filter((t) => t.targetHits.t4).length / trades.length;

    // P&L metrics
    const pnlValues = trades.map((t) => t.pnlR);
    const totalPnL = pnlValues.reduce((a, b) => a + b, 0);
    const avgPnL = totalPnL / trades.length;

    // Win/loss metrics
    const winningTrades = trades.filter((t) => t.pnlR > 0).length;
    const losingTrades = trades.filter((t) => t.pnlR < 0).length;
    const winRate = winningTrades / trades.length;

    // Profit factor
    const grossProfit = pnlValues.filter((p) => p > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(pnlValues.filter((p) => p < 0).reduce((a, b) => a + b, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Drawdown
    const { maxDD, currentDD } = this.calculateDrawdown(pnlValues);

    // Sharpe ratio (simplified: annual return / volatility)
    const volatility = this.calculateStdDev(pnlValues);
    const sharpeRatio = volatility > 0 ? (avgPnL / volatility) * Math.sqrt(252) : 0;

    return {
      t1HitRate,
      t2HitRate,
      t3HitRate,
      t4HitRate,
      profitFactor,
      maxDrawdown: maxDD,
      currentDrawdown: currentDD,
      sharpeRatio,
      winRate,
      avgPnL,
      totalPnL,
      totalTrades: trades.length,
      winningTrades,
      losingTrades,
      largestWin: Math.max(...pnlValues, 0),
      largestLoss: Math.min(...pnlValues, 0),
    };
  }

  // MARK: - Divergence Detection

  private checkDivergences(): void {
    const liveMetrics = this.calculateLiveMetrics();
    this.session.liveMetrics = liveMetrics;

    const backtest = this.config.backtestMetrics;
    const threshold = this.config.divergenceThreshold;

    // Check T1 hit rate
    const t1Divergence = Math.abs(liveMetrics.t1HitRate - backtest.t1HitRate) / backtest.t1HitRate;
    if (t1Divergence > threshold) {
      this.recordDivergence('T1_HIT_RATE', backtest.t1HitRate, liveMetrics.t1HitRate, t1Divergence);
    }

    // Check profit factor
    const pfDivergence = Math.abs(liveMetrics.profitFactor - backtest.profitFactor) / backtest.profitFactor;
    if (pfDivergence > threshold) {
      this.recordDivergence('PROFIT_FACTOR', backtest.profitFactor, liveMetrics.profitFactor, pfDivergence);
    }

    // Check max drawdown
    const ddDivergence = Math.abs(liveMetrics.maxDrawdown - backtest.maxDrawdown) / backtest.maxDrawdown;
    if (ddDivergence > threshold) {
      this.recordDivergence('MAX_DRAWDOWN', backtest.maxDrawdown, liveMetrics.maxDrawdown, ddDivergence);
    }

    // Check Sharpe ratio
    const srDivergence = Math.abs(liveMetrics.sharpeRatio - backtest.sharpeRatio) / backtest.sharpeRatio;
    if (srDivergence > threshold) {
      this.recordDivergence('SHARPE_RATIO', backtest.sharpeRatio, liveMetrics.sharpeRatio, srDivergence);
    }

    // Check win rate
    const wrDivergence = Math.abs(liveMetrics.winRate - backtest.winRate) / backtest.winRate;
    if (wrDivergence > threshold) {
      this.recordDivergence('WIN_RATE', backtest.winRate, liveMetrics.winRate, wrDivergence);
    }

    // Auto-halt on CRITICAL divergence
    if (this.config.autoHaltEnabled) {
      const criticalDivergences = this.divergenceHistory.filter((d) => d.severity === 'CRITICAL');
      if (criticalDivergences.length > 0) {
        this.halt('CRITICAL divergence detected');
      }
    }
  }

  private recordDivergence(
    metric: string,
    backtestValue: number,
    liveValue: number,
    percentDiff: number
  ): void {
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    if (percentDiff > 0.20) severity = 'CRITICAL';
    else if (percentDiff > 0.15) severity = 'HIGH';
    else if (percentDiff > 0.10) severity = 'MEDIUM';

    const divergence: Divergence = {
      metric,
      backtestValue,
      liveValue,
      percentDifference: percentDiff,
      severity,
      timestamp: new Date(),
    };

    this.divergenceHistory.push(divergence);
    this.session.divergences.push(divergence);

    const icon = this.getSeverityIcon(severity);
    console.log(
      `${icon} Divergence: ${metric} | Backtest: ${backtestValue.toFixed(3)} | Live: ${liveValue.toFixed(3)} | Diff: ${(percentDiff * 100).toFixed(1)}%`
    );
  }

  // MARK: - Session Management

  pause(): void {
    this.session.status = 'PAUSED';
    console.log('⏸️ Shadow trading paused');
  }

  resume(): void {
    if (this.halted) {
      console.log('❌ Cannot resume - session halted');
      return;
    }
    this.session.status = 'RUNNING';
    console.log('▶️ Shadow trading resumed');
  }

  halt(reason: string): void {
    this.halted = true;
    this.session.status = 'HALTED';
    console.log(`🛑 Shadow trading HALTED: ${reason}`);
  }

  endSession(): ShadowTradeSession {
    this.session.endTime = new Date();
    this.session.status = this.halted ? 'HALTED' : 'COMPLETED';
    this.session.liveMetrics = this.calculateLiveMetrics();

    this.logSessionSummary();
    return this.session;
  }

  // MARK: - Logging & Reporting

  private logTradeCompletion(outcome: SignalOutcome): void {
    const emoji = outcome.pnlR > 0 ? '✅' : '❌';
    console.log(
      `${emoji} [SHADOW] ${outcome.symbol} | Entry: ${outcome.entryPrice.toFixed(2)} | Exit: ${outcome.exitPrice.toFixed(2)} | P&L: ${outcome.pnlR.toFixed(2)}R | Reason: ${outcome.exitReason}`
    );
  }

  private logSessionSummary(): void {
    const metrics = this.session.liveMetrics;
    const backtest = this.session.backtestMetrics;

    console.log('\n========== SHADOW TRADING SESSION SUMMARY ==========\n');
    console.log(`Session ID: ${this.session.sessionId}`);
    console.log(`Duration: ${this.session.startTime.toLocaleString()} → ${this.session.endTime?.toLocaleString()}`);
    console.log(`Status: ${this.session.status}`);

    console.log('\n--- Signals ---');
    console.log(`Generated: ${this.session.signalsGenerated}`);
    console.log(`Completed: ${this.session.signalsCompleted}`);

    console.log('\n--- Target Hit Rates ---');
    console.log(`T1: ${(metrics.t1HitRate * 100).toFixed(1)}% (Backtest: ${(backtest.t1HitRate * 100).toFixed(1)}%)`);
    console.log(`T2: ${(metrics.t2HitRate * 100).toFixed(1)}% (Backtest: ${(backtest.t1HitRate * 100 * 0.6).toFixed(1)}%)`);
    console.log(`T3: ${(metrics.t3HitRate * 100).toFixed(1)}% (Backtest: ${(backtest.t1HitRate * 100 * 0.4).toFixed(1)}%)`);
    console.log(`T4: ${(metrics.t4HitRate * 100).toFixed(1)}% (Backtest: ${(backtest.t1HitRate * 100 * 0.2).toFixed(1)}%)`);

    console.log('\n--- P&L Metrics ---');
    console.log(`Total P&L: ${metrics.totalPnL.toFixed(2)}R`);
    console.log(`Avg P&L: ${metrics.avgPnL.toFixed(2)}R (Backtest: ${backtest.avgPnL.toFixed(2)}R)`);
    console.log(`Win Rate: ${(metrics.winRate * 100).toFixed(1)}% (Backtest: ${(backtest.winRate * 100).toFixed(1)}%)`);
    console.log(`Profit Factor: ${metrics.profitFactor.toFixed(2)} (Backtest: ${backtest.profitFactor.toFixed(2)})`);

    console.log('\n--- Risk Metrics ---');
    console.log(`Max Drawdown: ${(metrics.maxDrawdown * 100).toFixed(2)}% (Backtest: ${(backtest.maxDrawdown * 100).toFixed(2)}%)`);
    console.log(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)} (Backtest: ${backtest.sharpeRatio.toFixed(2)})`);

    console.log('\n--- Divergences ---');
    if (this.divergenceHistory.length === 0) {
      console.log('✅ No significant divergences detected');
    } else {
      console.log(`Found ${this.divergenceHistory.length} divergences:`);
      for (const div of this.divergenceHistory) {
        const icon = this.getSeverityIcon(div.severity);
        console.log(
          `  ${icon} ${div.metric}: ${(div.percentDifference * 100).toFixed(1)}% (${div.severity})`
        );
      }
    }

    console.log('\n====================================================\n');
  }

  // MARK: - Utility Methods

  private calculateDrawdown(pnlValues: number[]): { maxDD: number; currentDD: number } {
    let cumulative = 0;
    let peak = 0;
    let maxDD = 0;
    let currentDD = 0;

    for (const pnl of pnlValues) {
      cumulative += pnl;
      if (cumulative > peak) {
        peak = cumulative;
      }
      const dd = (peak - cumulative) / (peak || 1);
      if (dd > maxDD) maxDD = dd;
      currentDD = dd;
    }

    return { maxDD, currentDD };
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private generateSessionId(): string {
    return `shadow_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private createEmptyMetrics(): LiveMetrics {
    return {
      t1HitRate: 0,
      t2HitRate: 0,
      t3HitRate: 0,
      t4HitRate: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      sharpeRatio: 0,
      winRate: 0,
      avgPnL: 0,
      totalPnL: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      largestWin: 0,
      largestLoss: 0,
    };
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

  getSession(): ShadowTradeSession {
    return { ...this.session, liveMetrics: this.calculateLiveMetrics() };
  }

  getCompletedTrades(): SignalOutcome[] {
    return this.completedTrades;
  }

  getDivergences(): Divergence[] {
    return this.divergenceHistory;
  }
}
