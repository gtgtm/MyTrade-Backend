// Divergence Analyzer - Detects when live performance deviates from backtest
// Auto-halts signal generation if divergence is critical

class DivergenceAnalyzer {
  constructor(exitManager) {
    this.exitManager = exitManager;
    this.baselineMetrics = null; // Set from backtest results
    this.monitoringWindow = 50; // Track last 50 signals
    this.alerts = [];
  }

  // Set baseline metrics from backtest walk-forward results
  setBaseline(backtestMetrics) {
    this.baselineMetrics = {
      expectedWinRate: backtestMetrics.avgWinRate, // e.g., 68%
      expectedProfitFactor: backtestMetrics.avgProfitFactor, // e.g., 2.8
      expectedTargetHitRate: backtestMetrics.avgTargetHitRate, // e.g., 72%
      expectedAvgPnl: backtestMetrics.avgPnlPercent, // e.g., 2.15%
      confidence: backtestMetrics.confidence, // e.g., 92%

      // Acceptable deviation thresholds
      winRateTolerance: 10, // Allow ±10% from expected
      profitFactorTolerance: 0.5, // Allow ±0.5 from expected
      targetHitTolerance: 15, // Allow ±15% from expected
      pnlTolerance: 1.0 // Allow ±1% from expected
    };

    console.log(`📊 Divergence analyzer baseline set: ${this.baselineMetrics.expectedWinRate.toFixed(1)}% win rate expected`);
  }

  // Analyze current live metrics vs baseline
  checkDivergence() {
    if (!this.baselineMetrics) {
      console.warn('⚠️ No baseline set for divergence analysis');
      return null;
    }

    const liveMetrics = this.exitManager.getMetrics();
    const recentExits = this.exitManager.getRecentExits(null, this.monitoringWindow);

    if (!recentExits || recentExits.length < 10) {
      return {
        status: 'INSUFFICIENT_DATA',
        samplesNeeded: 10,
        samplesHave: recentExits?.length || 0,
        message: 'Not enough recent trades to analyze divergence'
      };
    }

    // Calculate deviations
    const deviations = {
      winRate: {
        expected: this.baselineMetrics.expectedWinRate,
        actual: (liveMetrics.totalWins / liveMetrics.totalTrades) * 100,
        tolerance: this.baselineMetrics.winRateTolerance,
        isDeviated: false
      },
      profitFactor: {
        expected: this.baselineMetrics.expectedProfitFactor,
        actual: this.calculateProfitFactor(recentExits),
        tolerance: this.baselineMetrics.profitFactorTolerance,
        isDeviated: false
      },
      targetHitRate: {
        expected: this.baselineMetrics.expectedTargetHitRate,
        actual: (recentExits.filter(e => e.exitType === 'TARGET_HIT').length / recentExits.length) * 100,
        tolerance: this.baselineMetrics.targetHitTolerance,
        isDeviated: false
      },
      avgPnl: {
        expected: this.baselineMetrics.expectedAvgPnl,
        actual: (recentExits.reduce((sum, e) => sum + e.pnlPercent, 0) / recentExits.length),
        tolerance: this.baselineMetrics.pnlTolerance,
        isDeviated: false
      }
    };

    // Check each metric for deviation
    for (const [metric, data] of Object.entries(deviations)) {
      const deviation = Math.abs(data.actual - data.expected);
      data.deviation = deviation;
      data.deviationPercent = ((deviation / data.expected) * 100).toFixed(1);
      data.isDeviated = deviation > data.tolerance;
    }

    // Classify severity
    const deviatedMetrics = Object.entries(deviations)
      .filter(([_, d]) => d.isDeviated)
      .map(([name, d]) => ({ name, ...d }));

    const severity = this.classifySeverity(deviatedMetrics);

    const analysis = {
      status: deviatedMetrics.length === 0 ? 'ALIGNED' : 'DIVERGED',
      severity,
      samplesAnalyzed: recentExits.length,
      baselineConfidence: this.baselineMetrics.confidence,
      deviations,
      deviatedMetrics,
      recommendation: this.generateRecommendation(severity, deviatedMetrics),
      timestamp: new Date().toISOString()
    };

    // Record alert if divergence detected
    if (deviatedMetrics.length > 0) {
      this.alerts.push(analysis);
      // Keep last 20 alerts
      if (this.alerts.length > 20) {
        this.alerts = this.alerts.slice(-20);
      }
    }

    return analysis;
  }

  // Classify divergence severity
  classifySeverity(deviatedMetrics) {
    if (deviatedMetrics.length === 0) {
      return 'HEALTHY';
    }

    const criticalMetrics = ['winRate', 'profitFactor']; // Most important
    const criticalDeviations = deviatedMetrics.filter(m => criticalMetrics.includes(m.name));

    // Win rate < 40% is critical (auto-halt threshold)
    const winRateDeviation = deviatedMetrics.find(m => m.name === 'winRate');
    if (winRateDeviation && winRateDeviation.actual < 40) {
      return 'CRITICAL';
    }

    // Multiple critical metrics deviating
    if (criticalDeviations.length >= 2) {
      return 'CRITICAL';
    }

    // Single critical metric with large deviation (>20%)
    if (criticalDeviations.some(m => parseFloat(m.deviationPercent) > 20)) {
      return 'CRITICAL';
    }

    // One critical metric or multiple non-critical
    if (criticalDeviations.length === 1 || deviatedMetrics.length >= 2) {
      return 'WARNING';
    }

    // Single minor deviation
    return 'CAUTION';
  }

  // Generate recommendation based on severity
  generateRecommendation(severity, deviatedMetrics) {
    switch (severity) {
      case 'CRITICAL':
        return {
          action: 'AUTO_HALT',
          message: 'Live performance critically diverged from backtest. Auto-halting signal generation.',
          nextSteps: [
            '1. Review recent signal quality (check quality filter)',
            '2. Validate market conditions vs backtest period',
            '3. Check for systematic issues (API failures, wrong timeframes)',
            '4. Run new walk-forward validation',
            '5. Manual approval required to resume'
          ]
        };
      case 'WARNING':
        return {
          action: 'ALERT_REQUIRED',
          message: 'Live performance diverging from expectations. Manual review recommended.',
          nextSteps: [
            '1. Investigate deviated metrics',
            '2. Check if divergence is transient or structural',
            '3. Monitor next 20 signals for stabilization',
            '4. Escalate to ops team if divergence persists'
          ]
        };
      case 'CAUTION':
        return {
          action: 'MONITOR',
          message: 'Minor divergence detected. Continue monitoring.',
          nextSteps: [
            '1. Track deviation trend (increasing or stabilizing)',
            '2. Escalate to WARNING if deviation grows',
            '3. Review after next 20 signals'
          ]
        };
      default:
        return {
          action: 'CONTINUE',
          message: 'Live performance aligned with backtest expectations.',
          nextSteps: ['Continue normal operation']
        };
    }
  }

  // Calculate profit factor from exits
  calculateProfitFactor(exits) {
    const winPnl = exits
      .filter(e => e.pnlPercent > 0)
      .reduce((sum, e) => sum + e.pnlPercent, 0);

    const lossPnl = Math.abs(
      exits
        .filter(e => e.pnlPercent < 0)
        .reduce((sum, e) => sum + e.pnlPercent, 0)
    );

    if (lossPnl === 0) {
      return winPnl === 0 ? 1.0 : 10.0; // Cap at 10.0 if no losses
    }

    return winPnl / lossPnl;
  }

  // Auto-halt decision logic
  shouldAutoHalt() {
    const analysis = this.checkDivergence();

    if (!analysis) {
      return false;
    }

    return (
      analysis.severity === 'CRITICAL' ||
      (analysis.deviations.winRate && analysis.deviations.winRate.actual < 40)
    );
  }

  // Get divergence alerts
  getAlerts(limit = 10) {
    return this.alerts.slice(-limit).reverse();
  }

  // Generate divergence report
  generateReport() {
    const analysis = this.checkDivergence();

    if (!analysis) {
      return {
        status: 'NO_DATA',
        message: 'Not enough data for divergence analysis'
      };
    }

    const report = {
      analysisTime: analysis.timestamp,
      overallStatus: analysis.status,
      severity: analysis.severity,
      samplesAnalyzed: analysis.samplesAnalyzed,
      baselineExpectations: {
        winRate: `${this.baselineMetrics.expectedWinRate.toFixed(1)}%`,
        profitFactor: this.baselineMetrics.expectedProfitFactor.toFixed(2),
        targetHitRate: `${this.baselineMetrics.expectedTargetHitRate.toFixed(1)}%`,
        avgPnl: `${this.baselineMetrics.expectedAvgPnl.toFixed(2)}%`,
        overallConfidence: `${this.baselineMetrics.confidence}%`
      },
      actualMetrics: {
        winRate: `${analysis.deviations.winRate.actual.toFixed(1)}%`,
        profitFactor: analysis.deviations.profitFactor.actual.toFixed(2),
        targetHitRate: `${analysis.deviations.targetHitRate.actual.toFixed(1)}%`,
        avgPnl: `${analysis.deviations.avgPnl.actual.toFixed(2)}%`
      },
      deviations: analysis.deviatedMetrics.map(m => ({
        metric: m.name,
        expected: typeof m.expected === 'number' ? m.expected.toFixed(2) : m.expected,
        actual: typeof m.actual === 'number' ? m.actual.toFixed(2) : m.actual,
        deviation: m.deviation.toFixed(2),
        deviationPercent: `${m.deviationPercent}%`,
        tolerance: m.tolerance,
        status: m.isDeviated ? '⚠️ EXCEEDED' : '✅ OK'
      })),
      recommendation: analysis.recommendation,
      shouldAutoHalt: this.shouldAutoHalt(),
      recentAlerts: this.getAlerts(5)
    };

    return report;
  }
}

export default DivergenceAnalyzer;
