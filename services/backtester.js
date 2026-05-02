// Backtester - Validates signal accuracy against historical price data
// Generates signals on historical data and measures actual outcomes

import CryptoService from './cryptoService.js';
import CryptoSignalEngine from './cryptoSignalEngine.js';

class Backtester {
  constructor() {
    this.cryptoService = new CryptoService();
  }

  // Backtest a symbol over N candles using historical data
  async backtestSymbol(symbol, lookbackDays = 30) {
    console.log(`🔍 Backtesting ${symbol} over ${lookbackDays} days...`);

    try {
      // Fetch historical data in larger chunks
      const klines = await this.cryptoService.fetchKlines(symbol, '1h', 24 * lookbackDays);
      if (!klines || klines.length < 100) {
        console.warn(`⚠️ Insufficient historical data for ${symbol}`);
        return {
          symbol,
          status: 'insufficient_data',
          message: `Less than 100 candles available`,
          totalCandles: klines?.length || 0
        };
      }

      // Walk forward through history, generating signals and measuring outcomes
      const results = [];
      const windowSize = 50; // Need 50 candles for indicators
      const stepSize = 5;    // Step every 5 candles (reducing redundancy)

      for (let i = windowSize; i < klines.length - 20; i += stepSize) {
        const historicalWindow = klines.slice(0, i + 1);
        const currentCandle = historicalWindow[historicalWindow.length - 1];

        // Generate signal using historical data up to this point
        const futureData = klines.slice(i + 1, i + 21); // Look 20 candles ahead
        const signal = CryptoSignalEngine.generate(symbol, historicalWindow, {
          price: currentCandle.close,
          priceChangePercent: 0,
          volume: currentCandle.volume
        });

        if (!signal || signal.signalType === 'NO TRADE') {
          continue;
        }

        // Determine actual outcome from future price data
        const outcome = this.measureOutcome(
          signal,
          currentCandle,
          futureData
        );

        results.push({
          ...signal,
          generatedAt: new Date(currentCandle.time).toISOString(),
          outcome
        });
      }

      // Calculate aggregate metrics
      const metrics = this.calculateMetrics(results);

      console.log(`✅ Backtest complete: ${results.length} signals, ${metrics.winRate.toFixed(1)}% win rate`);

      return {
        symbol,
        status: 'completed',
        totalSignals: results.length,
        metrics,
        signals: results.slice(-50) // Return last 50 for inspection
      };
    } catch (err) {
      console.error(`❌ Backtest failed for ${symbol}:`, err.message);
      return {
        symbol,
        status: 'error',
        error: err.message
      };
    }
  }

  // Measure actual outcome for a signal
  measureOutcome(signal, entryCandle, futureData) {
    const entryPrice = signal.entryPrice || entryCandle.close;
    const target = signal.target;
    const stopLoss = signal.stopLoss;

    let outcome = {
      status: 'TIMEOUT',
      hitTarget: false,
      hitStopLoss: false,
      pnl: 0,
      pnlPercent: 0,
      candles: 0
    };

    // Check future prices against target and stop loss
    for (let i = 0; i < Math.min(futureData.length, 20); i++) {
      const candle = futureData[i];
      outcome.candles = i + 1;

      if (signal.signalType === 'BUY CALL') {
        // Long position
        if (target && candle.high >= target) {
          outcome.status = 'TARGET_HIT';
          outcome.hitTarget = true;
          outcome.pnl = target - entryPrice;
          outcome.pnlPercent = (outcome.pnl / entryPrice) * 100;
          break;
        }
        if (stopLoss && candle.low <= stopLoss) {
          outcome.status = 'STOP_LOSS_HIT';
          outcome.hitStopLoss = true;
          outcome.pnl = stopLoss - entryPrice;
          outcome.pnlPercent = (outcome.pnl / entryPrice) * 100;
          break;
        }
      } else if (signal.signalType === 'BUY PUT') {
        // Short position
        if (target && candle.low <= target) {
          outcome.status = 'TARGET_HIT';
          outcome.hitTarget = true;
          outcome.pnl = entryPrice - target;
          outcome.pnlPercent = (outcome.pnl / entryPrice) * 100;
          break;
        }
        if (stopLoss && candle.high >= stopLoss) {
          outcome.status = 'STOP_LOSS_HIT';
          outcome.hitStopLoss = true;
          outcome.pnl = entryPrice - stopLoss;
          outcome.pnlPercent = (outcome.pnl / entryPrice) * 100;
          break;
        }
      }
    }

    // If no target/SL hit, measure P&L at last candle
    if (outcome.status === 'TIMEOUT' && futureData.length > 0) {
      const lastCandle = futureData[futureData.length - 1];
      if (signal.signalType === 'BUY CALL') {
        outcome.pnl = lastCandle.close - entryPrice;
      } else {
        outcome.pnl = entryPrice - lastCandle.close;
      }
      outcome.pnlPercent = (outcome.pnl / entryPrice) * 100;
    }

    return outcome;
  }

  // Calculate aggregate metrics from backtest results
  calculateMetrics(signals) {
    if (signals.length === 0) {
      return { winRate: 0, totalTrades: 0, winners: 0, losers: 0 };
    }

    const winners = signals.filter(s => s.outcome.pnlPercent > 0);
    const losers = signals.filter(s => s.outcome.pnlPercent < 0);
    const breakeven = signals.filter(s => s.outcome.pnlPercent === 0);

    const totalPnl = signals.reduce((sum, s) => sum + s.outcome.pnl, 0);
    const totalPnlPercent = signals.reduce((sum, s) => sum + s.outcome.pnlPercent, 0);

    const targetHits = signals.filter(s => s.outcome.hitTarget).length;
    const slHits = signals.filter(s => s.outcome.hitStopLoss).length;

    return {
      totalTrades: signals.length,
      winners: winners.length,
      losers: losers.length,
      breakeven: breakeven.length,
      winRate: (winners.length / signals.length) * 100,
      lossRate: (losers.length / signals.length) * 100,
      avgPnl: totalPnl / signals.length,
      avgPnlPercent: totalPnlPercent / signals.length,
      totalPnl,
      targetHitRate: (targetHits / signals.length) * 100,
      slHitRate: (slHits / signals.length) * 100,
      profitFactor: winners.length > 0 ? (
        winners.reduce((sum, s) => sum + s.outcome.pnlPercent, 0) /
        Math.abs(losers.reduce((sum, s) => sum + s.outcome.pnlPercent, 0))
      ) : 0
    };
  }

  // Run full backtests on all major symbols
  async backtestAll(lookbackDays = 30) {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];
    const results = {};

    console.log(`🔬 Starting full backtest suite (${lookbackDays} days)...`);

    for (const symbol of symbols) {
      const result = await this.backtestSymbol(symbol, lookbackDays);
      results[symbol] = result;
    }

    // Aggregate summary
    const completedSymbols = Object.values(results).filter(r => r.status === 'completed');
    if (completedSymbols.length > 0) {
      const avgWinRate = (
        completedSymbols.reduce((sum, r) => sum + r.metrics.winRate, 0) /
        completedSymbols.length
      );
      const totalTrades = completedSymbols.reduce((sum, r) => sum + r.totalSignals, 0);
      const totalWins = completedSymbols.reduce((sum, r) => sum + r.metrics.winners, 0);

      console.log(`\n📊 Backtest Summary:`);
      console.log(`   Symbols tested: ${completedSymbols.length}/${symbols.length}`);
      console.log(`   Total signals: ${totalTrades}`);
      console.log(`   Aggregate win rate: ${(totalWins / totalTrades * 100).toFixed(1)}%`);
      console.log(`   Average win rate: ${avgWinRate.toFixed(1)}%`);
    }

    return results;
  }
}

export default Backtester;
