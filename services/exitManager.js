// Exit Manager - Tracks signal exits and calculates accuracy
// Monitors when trades hit targets (WIN), stop losses (LOSS), or timeout (EXPIRED)

class ExitManager {
  constructor(io) {
    this.io = io;
    this.activeSignals = new Map(); // signal.id -> { signal, entryPrice, entryTime, status }
    this.exitedSignals = []; // Keep history for accuracy calculation
    this.accuracyMetrics = new Map(); // symbol -> { wins, losses, winRate, avgPnl }
  }

  // Register a new signal as active (tracking begins)
  registerSignal(signal) {
    if (!signal.id || !signal.symbol) return;

    const entry = {
      id: signal.id,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      signalType: signal.signalType,
      entryPrice: signal.entryPrice || signal.price,
      currentPrice: signal.price,
      target: signal.target,
      stopLoss: signal.stopLoss,
      entryTime: new Date(),
      validUntil: signal.validUntil ? new Date(signal.validUntil) : null,
      status: 'ACTIVE',
      updateCount: 0
    };

    this.activeSignals.set(signal.id, entry);
    console.log(`📍 Exit tracking started: ${signal.symbol} ${signal.signalType}`);
  }

  // Update price for an active signal and check for exit conditions
  updateSignalPrice(signalId, currentPrice, priceData = {}) {
    const activeSignal = this.activeSignals.get(signalId);
    if (!activeSignal) return null;

    activeSignal.currentPrice = currentPrice;
    activeSignal.updateCount++;

    // Check exit conditions
    const exit = this.checkExitConditions(activeSignal);

    if (exit) {
      this.activeSignals.delete(signalId);
      this.exitedSignals.push(exit);

      // Trim history to last 500 trades
      if (this.exitedSignals.length > 500) {
        this.exitedSignals = this.exitedSignals.slice(-500);
      }

      // Update metrics
      this.updateMetrics(exit);

      // Emit exit event
      this.io.emit('signal:exited', exit);

      console.log(`✨ Exit: ${exit.symbol} ${exit.exitType} | PnL: ${exit.pnlPercent > 0 ? '+' : ''}${exit.pnlPercent.toFixed(2)}%`);

      return exit;
    }

    return null;
  }

  // Check if signal has hit target, stop loss, or expired
  checkExitConditions(activeSignal) {
    const { entryPrice, currentPrice, target, stopLoss, validUntil, signalType, symbol } = activeSignal;

    // Check if expired
    if (validUntil && new Date() > validUntil) {
      return this.createExit(activeSignal, 'TIMEOUT', currentPrice);
    }

    // Check target hit (for LONG)
    if (signalType === 'BUY CALL' && target && currentPrice >= target) {
      return this.createExit(activeSignal, 'TARGET_HIT', target);
    }

    // Check target hit (for SHORT)
    if (signalType === 'BUY PUT' && target && currentPrice <= target) {
      return this.createExit(activeSignal, 'TARGET_HIT', target);
    }

    // Check stop loss (for LONG)
    if (signalType === 'BUY CALL' && stopLoss && currentPrice <= stopLoss) {
      return this.createExit(activeSignal, 'STOP_LOSS_HIT', stopLoss);
    }

    // Check stop loss (for SHORT)
    if (signalType === 'BUY PUT' && stopLoss && currentPrice >= stopLoss) {
      return this.createExit(activeSignal, 'STOP_LOSS_HIT', stopLoss);
    }

    return null;
  }

  // Create exit record
  createExit(activeSignal, exitType, exitPrice) {
    const entryPrice = activeSignal.entryPrice;
    const holdTime = Date.now() - activeSignal.entryTime.getTime();
    const holdMinutes = Math.round(holdTime / (1000 * 60));

    // Calculate PnL
    let pnl, pnlPercent;
    if (activeSignal.signalType === 'BUY CALL') {
      // Long position
      pnl = exitPrice - entryPrice;
      pnlPercent = (pnl / entryPrice) * 100;
    } else {
      // Short position
      pnl = entryPrice - exitPrice;
      pnlPercent = (pnl / entryPrice) * 100;
    }

    return {
      id: activeSignal.id,
      symbol: activeSignal.symbol,
      timeframe: activeSignal.timeframe,
      signalType: activeSignal.signalType,
      entryPrice,
      exitPrice,
      exitType, // STOP_LOSS_HIT | TARGET_HIT | TIMEOUT
      pnl: parseFloat(pnl.toFixed(2)),
      pnlPercent: parseFloat(pnlPercent.toFixed(2)),
      holdMinutes,
      isWin: pnlPercent > 0,
      entryTime: activeSignal.entryTime.toISOString(),
      exitTime: new Date().toISOString()
    };
  }

  // Update accuracy metrics for a symbol
  updateMetrics(exit) {
    const symbol = exit.symbol;
    const current = this.accuracyMetrics.get(symbol) || {
      wins: 0,
      losses: 0,
      draws: 0,
      totalPnl: 0,
      totalTrades: 0,
      avgPnl: 0,
      winRate: 0,
      avgWinSize: 0,
      avgLossSize: 0
    };

    if (exit.isWin) {
      current.wins++;
      current.avgWinSize = (current.avgWinSize * (current.wins - 1) + exit.pnlPercent) / current.wins;
    } else if (exit.pnlPercent < 0) {
      current.losses++;
      current.avgLossSize = (current.avgLossSize * (current.losses - 1) + Math.abs(exit.pnlPercent)) / current.losses;
    } else {
      current.draws++;
    }

    current.totalPnl += exit.pnl;
    current.totalTrades = current.wins + current.losses + current.draws;
    current.avgPnl = current.totalPnl / current.totalTrades;
    current.winRate = current.wins / current.totalTrades;

    this.accuracyMetrics.set(symbol, current);
  }

  // Get accuracy metrics for a symbol or all symbols
  getMetrics(symbol = null) {
    if (symbol) {
      return this.accuracyMetrics.get(symbol) || null;
    }

    // Return aggregate metrics
    let aggregate = {
      totalTrades: 0,
      totalWins: 0,
      totalLosses: 0,
      totalPnl: 0,
      overallWinRate: 0,
      avgPnlPercent: 0
    };

    for (const metrics of this.accuracyMetrics.values()) {
      aggregate.totalTrades += metrics.totalTrades;
      aggregate.totalWins += metrics.wins;
      aggregate.totalLosses += metrics.losses;
      aggregate.totalPnl += metrics.totalPnl;
    }

    if (aggregate.totalTrades > 0) {
      aggregate.overallWinRate = aggregate.totalWins / aggregate.totalTrades;
      aggregate.avgPnlPercent = aggregate.totalPnl / aggregate.totalTrades;
    }

    return aggregate;
  }

  // Get recent exits with optional symbol filter
  getRecentExits(symbol = null, limit = 20) {
    let exits = this.exitedSignals;

    if (symbol) {
      exits = exits.filter(e => e.symbol === symbol);
    }

    return exits.slice(-limit).reverse();
  }

  // Get accuracy dashboard data
  getDashboard() {
    const metrics = this.getMetrics();
    const recentExits = this.getRecentExits(null, 50);

    // Group by symbol
    const bySymbol = {};
    for (const [symbol, data] of this.accuracyMetrics) {
      bySymbol[symbol] = data;
    }

    return {
      summary: metrics,
      bySymbol,
      recentTrades: recentExits,
      totalTracked: this.exitedSignals.length,
      activeSignals: this.activeSignals.size
    };
  }
}

export default ExitManager;
