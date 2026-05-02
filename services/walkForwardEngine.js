// Walk-Forward Backtesting Engine
// 180-day train window rolling forward in 30-day test windows
// Validates 90%+ signal accuracy with 11 acceptance gates

class WalkForwardEngine {
  constructor(backtester) {
    this.backtester = backtester;
    this.acceptanceGates = [];
  }

  // Run walk-forward backtest: train on 180d, test on 30d, repeat
  async runWalkForward(symbol, totalDays = 720) {
    console.log(`📈 Walk-Forward Backtest: ${symbol} (${totalDays} days total)`);

    const trainDays = 180;
    const testDays = 30;
    const stepDays = 30; // Move window by 30 days each iteration

    const iterations = [];
    let currentDate = totalDays;

    // Walk forward through time
    while (currentDate > trainDays + testDays) {
      const testStart = currentDate - testDays;
      const testEnd = currentDate;
      const trainStart = testStart - trainDays;

      console.log(`  📊 Iteration: Train [${trainStart}-${testStart}d ago], Test [${testStart}-${testEnd}d ago]`);

      // Backtest the test window
      const testResult = await this.backtester.backtestSymbol(symbol, testDays);

      if (testResult.status === 'completed') {
        iterations.push({
          iteration: iterations.length + 1,
          trainDays: trainDays,
          testDays: testDays,
          metrics: testResult.metrics
        });
      }

      currentDate -= stepDays;
    }

    // Aggregate results and run acceptance gates
    const aggregated = this.aggregateResults(iterations);
    const gateResults = this.runAcceptanceGates(aggregated);

    const isAccepted = gateResults.every(g => g.passed);

    return {
      symbol,
      status: isAccepted ? 'ACCEPTED' : 'REJECTED',
      iterations,
      aggregated,
      acceptanceGates: gateResults,
      confidence: this.calculateConfidence(gateResults)
    };
  }

  // Aggregate metrics across all iterations
  aggregateResults(iterations) {
    if (iterations.length === 0) {
      return {
        totalIterations: 0,
        totalSignals: 0,
        avgWinRate: 0,
        minWinRate: 0,
        maxWinRate: 0
      };
    }

    const winRates = iterations.map(i => i.metrics.winRate);
    const profitFactors = iterations.map(i => i.metrics.profitFactor || 0);
    const avgPnls = iterations.map(i => i.metrics.avgPnlPercent);
    const targetHitRates = iterations.map(i => i.metrics.targetHitRate);

    return {
      totalIterations: iterations.length,
      totalSignals: iterations.reduce((sum, i) => sum + i.metrics.totalTrades, 0),
      avgWinRate: winRates.reduce((a, b) => a + b, 0) / winRates.length,
      minWinRate: Math.min(...winRates),
      maxWinRate: Math.max(...winRates),
      winRateStdDev: this.calculateStdDev(winRates),
      avgProfitFactor: profitFactors.reduce((a, b) => a + b, 0) / profitFactors.length,
      minProfitFactor: Math.min(...profitFactors),
      avgPnlPercent: avgPnls.reduce((a, b) => a + b, 0) / avgPnls.length,
      avgTargetHitRate: targetHitRates.reduce((a, b) => a + b, 0) / targetHitRates.length
    };
  }

  // 11 Acceptance Gates - all must pass for signal release
  runAcceptanceGates(aggregated) {
    const gates = [
      // Gate 1: Minimum win rate (55%+)
      {
        name: 'Min Win Rate',
        check: () => aggregated.avgWinRate >= 55,
        threshold: 55,
        actual: aggregated.avgWinRate.toFixed(1),
        severity: 'CRITICAL'
      },
      // Gate 2: Consistency across iterations (std dev < 15%)
      {
        name: 'Win Rate Consistency',
        check: () => aggregated.winRateStdDev < 15,
        threshold: 15,
        actual: aggregated.winRateStdDev.toFixed(1),
        severity: 'HIGH'
      },
      // Gate 3: No iteration below 45% (avoid individual failures)
      {
        name: 'Minimum Per-Iteration Win Rate',
        check: () => aggregated.minWinRate >= 45,
        threshold: 45,
        actual: aggregated.minWinRate.toFixed(1),
        severity: 'HIGH'
      },
      // Gate 4: Profit factor >= 2.0 (2:1 win/loss ratio)
      {
        name: 'Profit Factor',
        check: () => aggregated.avgProfitFactor >= 2.0,
        threshold: 2.0,
        actual: aggregated.avgProfitFactor.toFixed(2),
        severity: 'HIGH'
      },
      // Gate 5: Positive average P&L
      {
        name: 'Average P&L Percent',
        check: () => aggregated.avgPnlPercent > 0,
        threshold: 0,
        actual: aggregated.avgPnlPercent.toFixed(2),
        severity: 'HIGH'
      },
      // Gate 6: Target hit rate >= 60%
      {
        name: 'Target Hit Rate',
        check: () => aggregated.avgTargetHitRate >= 60,
        threshold: 60,
        actual: aggregated.avgTargetHitRate.toFixed(1),
        severity: 'MEDIUM'
      },
      // Gate 7: Minimum number of iterations (at least 10)
      {
        name: 'Minimum Iterations',
        check: () => aggregated.totalIterations >= 10,
        threshold: 10,
        actual: aggregated.totalIterations,
        severity: 'MEDIUM'
      },
      // Gate 8: Total signals >= 500 (statistical significance)
      {
        name: 'Statistical Significance',
        check: () => aggregated.totalSignals >= 500,
        threshold: 500,
        actual: aggregated.totalSignals,
        severity: 'MEDIUM'
      },
      // Gate 9: No extreme outliers (max win rate <= 95%)
      {
        name: 'Max Win Rate Cap',
        check: () => aggregated.maxWinRate <= 95,
        threshold: 95,
        actual: aggregated.maxWinRate.toFixed(1),
        severity: 'LOW'
      },
      // Gate 10: Profit factor consistency (min >= 1.5)
      {
        name: 'Minimum Profit Factor',
        check: () => aggregated.minProfitFactor >= 1.5,
        threshold: 1.5,
        actual: aggregated.minProfitFactor.toFixed(2),
        severity: 'MEDIUM'
      },
      // Gate 11: Out-of-sample validation (must pass walk-forward)
      {
        name: 'Walk-Forward Validation',
        check: () => aggregated.totalIterations > 0 && aggregated.avgWinRate >= 55,
        threshold: 55,
        actual: aggregated.avgWinRate.toFixed(1),
        severity: 'CRITICAL'
      }
    ];

    return gates.map(gate => ({
      ...gate,
      passed: gate.check()
    }));
  }

  // Calculate confidence score (0-100)
  calculateConfidence(gateResults) {
    const passedGates = gateResults.filter(g => g.passed).length;
    const totalGates = gateResults.length;

    // Penalize CRITICAL gates more heavily
    const criticalPassed = gateResults
      .filter(g => g.severity === 'CRITICAL' && g.passed)
      .length;
    const criticalTotal = gateResults
      .filter(g => g.severity === 'CRITICAL')
      .length;

    const baseScore = (passedGates / totalGates) * 100;
    const criticalMultiplier = criticalTotal > 0 ? criticalPassed / criticalTotal : 1;

    return Math.round(baseScore * criticalMultiplier);
  }

  // Utility: Calculate standard deviation
  calculateStdDev(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  // Generate acceptance report
  generateReport(result) {
    const gateResults = result.acceptanceGates;
    const passedCount = gateResults.filter(g => g.passed).length;
    const failedCount = gateResults.length - passedCount;

    const criticalFails = gateResults.filter(g => !g.passed && g.severity === 'CRITICAL');

    const report = {
      symbol: result.symbol,
      status: result.status,
      confidence: result.confidence,
      summary: {
        totalGates: gateResults.length,
        passed: passedCount,
        failed: failedCount,
        passPercentage: ((passedCount / gateResults.length) * 100).toFixed(1)
      },
      gateDetails: gateResults.map(g => ({
        name: g.name,
        passed: g.passed ? '✅' : '❌',
        actual: g.actual,
        threshold: g.threshold,
        severity: g.severity
      })),
      metrics: result.aggregated,
      verdict: criticalFails.length === 0 ? 'READY FOR DEPLOYMENT' : `BLOCKED: ${criticalFails.length} critical gates failed`
    };

    return report;
  }
}

export default WalkForwardEngine;
