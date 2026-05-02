// src/backtest/validator/acceptanceGates.ts
// Acceptance Gates - Validation Rules for Backtest Quality

import { BacktestMetrics } from '../engine/walkForwardEngine'

export interface AcceptanceGateResult {
  gate: string
  passed: boolean
  requirement: string
  actual: string
  severity: 'critical' | 'warning' | 'info'
}

export interface AcceptanceReport {
  passed: boolean
  criticalFailures: number
  warnings: number
  gates: AcceptanceGateResult[]
  summary: string
}

export class AcceptanceGates {
  /**
   * Run all acceptance gates
   * Returns true only if all CRITICAL gates pass
   */
  validateMetrics(metrics: BacktestMetrics): AcceptanceReport {
    const gates: AcceptanceGateResult[] = [
      this.gateMinimumSignals(metrics),
      this.gateT1HitRate(metrics),
      this.gateT2HitRate(metrics),
      this.gateT3HitRate(metrics),
      this.gateT4HitRate(metrics),
      this.gateSLHitRate(metrics),
      this.gateProfitFactor(metrics),
      this.gateMaxDrawdown(metrics),
      this.gateSharpeRatio(metrics),
      this.gateWinRate(metrics),
      this.gateAvgPnl(metrics)
    ]

    const criticalFailures = gates.filter(g => !g.passed && g.severity === 'critical').length
    const warnings = gates.filter(g => !g.passed && g.severity === 'warning').length

    const summary = this.generateSummary(gates, metrics)

    return {
      passed: criticalFailures === 0,
      criticalFailures,
      warnings,
      gates,
      summary
    }
  }

  /**
   * CRITICAL: Minimum 500 signals required for statistical significance
   */
  private gateMinimumSignals(metrics: BacktestMetrics): AcceptanceGateResult {
    const passed = metrics.totalSignals >= 500

    return {
      gate: 'Minimum Signals',
      passed,
      requirement: '≥ 500 signals',
      actual: `${metrics.totalSignals} signals`,
      severity: 'critical'
    }
  }

  /**
   * CRITICAL: T1 hit rate must be ≥ 90%
   * This is the PRIMARY acceptance criterion
   */
  private gateT1HitRate(metrics: BacktestMetrics): AcceptanceGateResult {
    const t1HitRate = metrics.t1HitRate * 100
    const passed = t1HitRate >= 90

    return {
      gate: 'T1 Hit Rate',
      passed,
      requirement: '≥ 90%',
      actual: `${t1HitRate.toFixed(1)}%`,
      severity: 'critical'
    }
  }

  /**
   * WARNING: T2 hit rate should be ≥ 50%
   * If T1 hits 90%, T2 hitting 50%+ means good momentum follow-through
   */
  private gateT2HitRate(metrics: BacktestMetrics): AcceptanceGateResult {
    const t2HitRate = metrics.t2HitRate * 100
    const passed = t2HitRate >= 50

    return {
      gate: 'T2 Hit Rate',
      passed,
      requirement: '≥ 50%',
      actual: `${t2HitRate.toFixed(1)}%`,
      severity: 'warning'
    }
  }

  /**
   * INFO: T3 hit rate tracking (no strict requirement)
   */
  private gateT3HitRate(metrics: BacktestMetrics): AcceptanceGateResult {
    const t3HitRate = metrics.t3HitRate * 100

    return {
      gate: 'T3 Hit Rate',
      passed: true,
      requirement: 'Informational only',
      actual: `${t3HitRate.toFixed(1)}%`,
      severity: 'info'
    }
  }

  /**
   * INFO: T4 hit rate tracking (no strict requirement)
   */
  private gateT4HitRate(metrics: BacktestMetrics): AcceptanceGateResult {
    const t4HitRate = metrics.t4HitRate * 100

    return {
      gate: 'T4 Hit Rate',
      passed: true,
      requirement: 'Informational only',
      actual: `${t4HitRate.toFixed(1)}%`,
      severity: 'info'
    }
  }

  /**
   * CRITICAL: SL hit rate must be ≤ 10%
   * Means only 10% of signals max should hit stop loss
   */
  private gateSLHitRate(metrics: BacktestMetrics): AcceptanceGateResult {
    const slHitRate = (metrics.slHitCount / metrics.totalSignals) * 100
    const passed = slHitRate <= 10

    return {
      gate: 'SL Hit Rate',
      passed,
      requirement: '≤ 10%',
      actual: `${slHitRate.toFixed(1)}%`,
      severity: 'critical'
    }
  }

  /**
   * CRITICAL: Profit factor must be ≥ 2.5
   * Ratio of gross profit to gross loss
   */
  private gateProfitFactor(metrics: BacktestMetrics): AcceptanceGateResult {
    const pf = metrics.profitFactor
    const passed = pf >= 2.5 && isFinite(pf)

    return {
      gate: 'Profit Factor',
      passed,
      requirement: '≥ 2.5',
      actual: isFinite(pf) ? pf.toFixed(2) : 'Infinite',
      severity: 'critical'
    }
  }

  /**
   * CRITICAL: Max drawdown must be ≤ 8%
   * Measures peak-to-trough decline
   */
  private gateMaxDrawdown(metrics: BacktestMetrics): AcceptanceGateResult {
    const dd = metrics.maxDrawdown * 100
    const passed = dd <= 8

    return {
      gate: 'Max Drawdown',
      passed,
      requirement: '≤ 8%',
      actual: `${dd.toFixed(1)}%`,
      severity: 'critical'
    }
  }

  /**
   * CRITICAL: Sharpe ratio must be ≥ 2.0
   * Risk-adjusted return metric
   */
  private gateSharpeRatio(metrics: BacktestMetrics): AcceptanceGateResult {
    const sr = metrics.sharpeRatio
    const passed = sr >= 2.0

    return {
      gate: 'Sharpe Ratio',
      passed,
      requirement: '≥ 2.0',
      actual: sr.toFixed(2),
      severity: 'critical'
    }
  }

  /**
   * WARNING: Win rate should be ≥ 55%
   */
  private gateWinRate(metrics: BacktestMetrics): AcceptanceGateResult {
    const winRate = metrics.winRate * 100
    const passed = winRate >= 55

    return {
      gate: 'Win Rate',
      passed,
      requirement: '≥ 55%',
      actual: `${winRate.toFixed(1)}%`,
      severity: 'warning'
    }
  }

  /**
   * WARNING: Average P&L should be ≥ +0.30R
   * At least 30% of risk as average profit per trade
   */
  private gateAvgPnl(metrics: BacktestMetrics): AcceptanceGateResult {
    const avgPnl = metrics.avgPnlR
    const passed = avgPnl >= 0.3

    return {
      gate: 'Avg P&L per Signal',
      passed,
      requirement: '≥ +0.30R',
      actual: `${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}R`,
      severity: 'warning'
    }
  }

  /**
   * Generate summary report
   */
  private generateSummary(gates: AcceptanceGateResult[], metrics: BacktestMetrics): string {
    const critical = gates.filter(g => g.severity === 'critical')
    const warnings = gates.filter(g => g.severity === 'warning' && !g.passed)
    const passed = gates.filter(g => g.passed)

    let summary = `\n=== BACKTEST ACCEPTANCE REPORT ===\n`
    summary += `Total Signals: ${metrics.totalSignals}\n`
    summary += `Signals Passed: ${metrics.totalSignals - metrics.slHitCount - metrics.timeoutCount}\n`
    summary += `\n--- CRITICAL GATES (${critical.filter(g => g.passed).length}/${critical.length}) ---\n`

    critical.forEach(gate => {
      const status = gate.passed ? '✅ PASS' : '❌ FAIL'
      summary += `${status} ${gate.gate}: ${gate.actual}\n`
    })

    if (warnings.length > 0) {
      summary += `\n--- WARNINGS (${warnings.length}) ---\n`
      warnings.forEach(gate => {
        summary += `⚠️  ${gate.gate}: ${gate.actual} (need ${gate.requirement})\n`
      })
    }

    const overallPass = critical.every(g => g.passed)
    summary += `\n${overallPass ? '✅ BACKTEST PASSED ACCEPTANCE GATES' : '❌ BACKTEST FAILED CRITICAL GATES'}\n`

    return summary
  }

  /**
   * Check if backtest is ready for production
   * Stricter than basic acceptance
   */
  isProductionReady(metrics: BacktestMetrics): boolean {
    return (
      metrics.totalSignals >= 500 &&
      metrics.t1HitRate >= 0.88 && // 88%+ for production
      metrics.slHitCount / metrics.totalSignals <= 0.08 && // < 8% SL
      metrics.profitFactor >= 3.0 &&
      metrics.maxDrawdown <= 0.06 && // < 6% drawdown
      metrics.sharpeRatio >= 2.5 &&
      metrics.avgPnlR >= 0.35
    )
  }

  /**
   * Check if backtest is ready for paper trading
   * More lenient than production
   */
  isPaperTradeReady(metrics: BacktestMetrics): boolean {
    return (
      metrics.totalSignals >= 300 &&
      metrics.t1HitRate >= 0.85 &&
      metrics.slHitCount / metrics.totalSignals <= 0.12 &&
      metrics.profitFactor >= 2.0 &&
      metrics.maxDrawdown <= 0.10 &&
      metrics.sharpeRatio >= 1.5
    )
  }
}
