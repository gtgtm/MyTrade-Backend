// src/strategy/regimeDetector.ts
// Market Regime Detection (4 Regimes)

import { Regime, Direction, Indicators } from '../types/signal'

export class RegimeDetector {
  /**
   * Detect market regime based on indicators
   * Returns one of 4 regimes: TREND_UP, TREND_DOWN, RANGE, SQUEEZE
   */
  detectRegime(indicators: Indicators): Regime {
    // First priority: Check for chaos/volatile
    if (indicators.atrPercentile > 80) {
      return Regime.VOLATILE
    }

    // Check for strong trend
    const emaStack = [indicators.ema21, indicators.ema55, indicators.ema200]
    const isTrendUp =
      emaStack[0] > emaStack[1] &&
      emaStack[1] > emaStack[2] &&
      indicators.adx > 25

    const isTrendDown =
      emaStack[0] < emaStack[1] &&
      emaStack[1] < emaStack[2] &&
      indicators.adx > 25

    if (isTrendUp) return Regime.TREND_UP
    if (isTrendDown) return Regime.TREND_DOWN

    // Check for squeeze (BB inside Keltner)
    const bbWidth = indicators.bbHigh - indicators.bbLow
    const kelWidth = indicators.kelHigh - indicators.kelLow

    if (bbWidth < kelWidth * 0.7 && indicators.atrPercentile < 25) {
      return Regime.SQUEEZE
    }

    // Default: Range
    return Regime.RANGE
  }

  /**
   * Check if we should trade this regime + direction combination
   */
  shouldTradeRegime(regime: Regime, direction: Direction): boolean {
    if (regime === Regime.VOLATILE) return false

    if (regime === Regime.TREND_UP && direction === Direction.SHORT) {
      return false
    }

    if (regime === Regime.TREND_DOWN && direction === Direction.LONG) {
      return false
    }

    return true
  }

  /**
   * Get regime description for logging
   */
  getRegimeDescription(regime: Regime, indicators: Indicators): string {
    switch (regime) {
      case Regime.TREND_UP:
        return `Strong uptrend (ADX: ${indicators.adx.toFixed(1)}, EMA stack bullish)`

      case Regime.TREND_DOWN:
        return `Strong downtrend (ADX: ${indicators.adx.toFixed(1)}, EMA stack bearish)`

      case Regime.RANGE:
        return `Range-bound (ADX: ${indicators.adx.toFixed(1)}, flat EMA)`

      case Regime.SQUEEZE:
        return `Squeeze (pre-breakout, low volatility)`

      case Regime.VOLATILE:
        return `Chaotic/Volatile (ATR: ${indicators.atrPercentile}th percentile)`

      default:
        return `Unknown regime`
    }
  }
}
