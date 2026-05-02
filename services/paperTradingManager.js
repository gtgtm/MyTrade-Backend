// Paper Trading Manager - Shadow mode signal validation
// Tracks signals in live market conditions without real money
// Validates divergence detection, signal accuracy, and system stability over 1 week

import { EventEmitter } from 'events';

class PaperTradingManager extends EventEmitter {
  constructor() {
    super();
    this.shadowTrades = []; // Hypothetical trades that would have executed
    this.metrics = {
      signalsGenerated: 0,
      signalsExecuted: 0,
      winRate: 0,
      profitFactor: 1.0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      totalPnl: 0,
      winCount: 0,
      lossCount: 0,
      tradeReturns: []
    };
    this.divergenceEvents = [];
    this.systemHealth = {
      uptime: 0,
      lastSignalTime: null,
      lastDivergenceCheck: null,
      errorCount: 0,
      recoveryCount: 0
    };
    this.startTime = Date.now();
  }

  // Execute shadow trade (simulate entry)
  executeShadowTrade(signal) {
    const trade = {
      id: `paper-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      symbol: signal.symbol,
      signalType: signal.signalType,
      entryPrice: signal.currentPrice,
      entryTime: Date.now(),
      entryConfidence: signal.confidence,
      target: signal.target,
      stop: signal.stop,
      status: 'OPEN',
      pnl: 0,
      pnlPercent: 0
    };

    this.shadowTrades.push(trade);
    this.metrics.signalsGenerated++;
    this.metrics.signalsExecuted++;
    this.systemHealth.lastSignalTime = new Date();

    this.emit('shadow:trade:open', {
      tradeId: trade.id,
      symbol: trade.symbol,
      entryPrice: trade.entryPrice,
      target: trade.target,
      stop: trade.stop,
      confidence: trade.entryConfidence
    });

    return trade;
  }

  // Update shadow trade with current price (simulate live tracking)
  updateShadowTrade(symbol, currentPrice) {
    const openTrades = this.shadowTrades.filter(
      t => t.symbol === symbol && t.status === 'OPEN'
    );

    openTrades.forEach(trade => {
      const pnl = (currentPrice - trade.entryPrice) * 100; // Simplified: 1 unit per trade
      trade.pnl = pnl;
      trade.pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
      trade.currentPrice = currentPrice;

      // Auto-exit at target or stop
      if (currentPrice >= trade.target) {
        this.closeTradeAtTarget(trade);
      } else if (currentPrice <= trade.stop) {
        this.closeTradeAtStop(trade);
      }
    });
  }

  // Close trade at target (win)
  closeTradeAtTarget(trade) {
    trade.status = 'CLOSED_TARGET';
    trade.exitPrice = trade.target;
    trade.exitTime = Date.now();
    trade.pnl = (trade.target - trade.entryPrice) * 100;
    trade.pnlPercent = ((trade.target - trade.entryPrice) / trade.entryPrice) * 100;

    this.metrics.winCount++;
    this.metrics.tradeReturns.push(trade.pnlPercent);
    this.updateMetrics();

    this.emit('shadow:trade:closed', {
      tradeId: trade.id,
      symbol: trade.symbol,
      result: 'WIN',
      pnl: trade.pnl,
      pnlPercent: trade.pnlPercent,
      durationMs: trade.exitTime - trade.entryTime
    });
  }

  // Close trade at stop (loss)
  closeTradeAtStop(trade) {
    trade.status = 'CLOSED_STOP';
    trade.exitPrice = trade.stop;
    trade.exitTime = Date.now();
    trade.pnl = (trade.stop - trade.entryPrice) * 100;
    trade.pnlPercent = ((trade.stop - trade.entryPrice) / trade.entryPrice) * 100;

    this.metrics.lossCount++;
    this.metrics.tradeReturns.push(trade.pnlPercent);
    this.updateMetrics();

    this.emit('shadow:trade:closed', {
      tradeId: trade.id,
      symbol: trade.symbol,
      result: 'LOSS',
      pnl: trade.pnl,
      pnlPercent: trade.pnlPercent,
      durationMs: trade.exitTime - trade.entryTime
    });
  }

  // Update metrics after each closed trade
  updateMetrics() {
    const totalTrades = this.metrics.winCount + this.metrics.lossCount;

    if (totalTrades > 0) {
      this.metrics.winRate = (this.metrics.winCount / totalTrades) * 100;

      // Calculate profit factor (sum of wins / sum of losses)
      const wins = this.metrics.tradeReturns
        .filter(r => r > 0)
        .reduce((a, b) => a + b, 0);
      const losses = Math.abs(
        this.metrics.tradeReturns
          .filter(r => r < 0)
          .reduce((a, b) => a + b, 0)
      );
      this.metrics.profitFactor = losses > 0 ? wins / losses : wins;

      // Total PnL
      this.metrics.totalPnl = this.metrics.tradeReturns.reduce((a, b) => a + b, 0);

      // Sharpe ratio (simplified: annualized return / volatility)
      if (this.metrics.tradeReturns.length > 1) {
        const mean = this.metrics.totalPnl / totalTrades;
        const variance = this.metrics.tradeReturns
          .reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / totalTrades;
        const stdDev = Math.sqrt(variance);
        this.metrics.sharpeRatio = stdDev > 0 ? mean / stdDev : 0;
      }

      // Max drawdown (peak-to-trough decline)
      let peak = 0;
      let maxDD = 0;
      let cumulative = 0;
      for (const ret of this.metrics.tradeReturns) {
        cumulative += ret;
        if (cumulative > peak) peak = cumulative;
        const drawdown = peak - cumulative;
        if (drawdown > maxDD) maxDD = drawdown;
      }
      this.metrics.maxDrawdown = maxDD;
    }
  }

  // Track divergence detection event
  recordDivergenceEvent(divergence) {
    const event = {
      timestamp: Date.now(),
      severity: divergence.severity,
      symbol: divergence.symbol,
      metrics: divergence.metrics,
      detected: divergence.detected,
      alertSent: divergence.alertSent
    };

    this.divergenceEvents.push(event);
    this.systemHealth.lastDivergenceCheck = new Date();

    // Keep only last 1000 events
    if (this.divergenceEvents.length > 1000) {
      this.divergenceEvents.shift();
    }

    this.emit('paper:divergence:event', event);
  }

  // Record system error
  recordError(error) {
    this.systemHealth.errorCount++;
    this.emit('paper:error', {
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack
    });
  }

  // Record system recovery
  recordRecovery(recovery) {
    this.systemHealth.recoveryCount++;
    this.emit('paper:recovery', {
      timestamp: Date.now(),
      recovery: recovery.message,
      duration: recovery.durationMs
    });
  }

  // Get current paper trading status
  getStatus() {
    const uptime = Date.now() - this.startTime;
    const openTrades = this.shadowTrades.filter(t => t.status === 'OPEN');

    return {
      uptime: uptime,
      uptimeHours: (uptime / (1000 * 60 * 60)).toFixed(2),
      metrics: this.metrics,
      openTrades: openTrades.length,
      closedTrades: this.shadowTrades.filter(t => t.status.startsWith('CLOSED')).length,
      systemHealth: this.systemHealth,
      divergenceEventsCount: this.divergenceEvents.length,
      timestamp: new Date()
    };
  }

  // Get detailed metrics report
  getMetricsReport() {
    return {
      summary: {
        totalSignals: this.metrics.signalsGenerated,
        executedSignals: this.metrics.signalsExecuted,
        winRate: this.metrics.winRate.toFixed(2) + '%',
        profitFactor: this.metrics.profitFactor.toFixed(2),
        totalPnL: this.metrics.totalPnL.toFixed(2),
        maxDrawdown: this.metrics.maxDrawdown.toFixed(2),
        sharpeRatio: this.metrics.sharpeRatio.toFixed(2)
      },
      trades: {
        wins: this.metrics.winCount,
        losses: this.metrics.lossCount,
        total: this.metrics.winCount + this.metrics.lossCount
      },
      systemHealth: this.systemHealth,
      divergenceEvents: {
        total: this.divergenceEvents.length,
        byServer: this.dividenceEvents
          ? this.divergenceEvents.reduce((acc, e) => {
              acc[e.severity] = (acc[e.severity] || 0) + 1;
              return acc;
            }, {})
          : {}
      }
    };
  }

  // Get divergence analysis report
  getDivergenceReport() {
    const report = {
      totalEvents: this.divergenceEvents.length,
      detected: this.divergenceEvents.filter(e => e.detected).length,
      notDetected: this.divergenceEvents.filter(e => !e.detected).length,
      bySeverity: {},
      timeline: []
    };

    // Group by severity
    this.divergenceEvents.forEach(event => {
      report.bySeverity[event.severity] = (report.bySeverity[event.severity] || 0) + 1;
    });

    // Timeline (last 20 events)
    report.timeline = this.divergenceEvents.slice(-20);

    return report;
  }

  // Get open trades for monitoring
  getOpenTrades() {
    return this.shadowTrades.filter(t => t.status === 'OPEN');
  }

  // Get trade history
  getTradeHistory(limit = 100) {
    return this.shadowTrades.slice(-limit);
  }

  // Decision criteria check (go/no-go for Phase 1)
  checkDeploymentReadiness() {
    const criteria = {
      signalQuality: false,
      divergenceDetection: false,
      systemStability: false,
      performanceTargets: false,
      overallReady: false
    };

    // Signal quality: >60% win rate, >1.5 profit factor
    if (this.metrics.winRate >= 60 && this.metrics.profitFactor >= 1.5) {
      criteria.signalQuality = true;
    }

    // Divergence detection: detected real deviations, <5% false positives
    const divergenceAccuracy =
      this.divergenceEvents.length > 0
        ? (this.divergenceEvents.filter(e => e.detected).length / this.divergenceEvents.length) * 100
        : 0;
    if (divergenceAccuracy >= 95) {
      criteria.divergenceDetection = true;
    }

    // System stability: <1% error rate, 10+ hour uptime
    const errorRate = this.systemHealth.errorCount / (this.metrics.signalsGenerated || 1);
    const uptimeHours = (Date.now() - this.startTime) / (1000 * 60 * 60);
    if (errorRate < 0.01 && uptimeHours >= 10) {
      criteria.systemStability = true;
    }

    // Performance: max drawdown <15%, Sharpe ratio >0.5
    if (this.metrics.maxDrawdown <= 15 && this.metrics.sharpeRatio >= 0.5) {
      criteria.performanceTargets = true;
    }

    criteria.overallReady =
      criteria.signalQuality &&
      criteria.divergenceDetection &&
      criteria.systemStability &&
      criteria.performanceTargets;

    return criteria;
  }
}

export default PaperTradingManager;
