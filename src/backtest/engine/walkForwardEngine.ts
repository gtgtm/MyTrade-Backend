// src/backtest/engine/walkForwardEngine.ts
// Walk-Forward Backtesting Engine - Simulates signal generation and tracking

import { OHLCV } from './dataLoader'
import { SignalV2, Direction } from '../../types/signal'
import { SignalGenerator, SignalGenerationContext } from '../../strategy/signalGenerator'
import { RegimeDetector } from '../../strategy/regimeDetector'

export interface BacktestSignal {
  signal: SignalV2
  enteredAt: Date
  entryPrice: number
  t1HitAt?: Date
  t1HitPrice?: number
  t2HitAt?: Date
  t2HitPrice?: number
  t3HitAt?: Date
  t3HitPrice?: number
  t4HitAt?: Date
  t4HitPrice?: number
  slHitAt?: Date
  slHitPrice?: number
  exitedAt?: Date
  exitReason?: string
  pnlR: number
  status: 't1_hit' | 't2_hit' | 't3_hit' | 't4_hit' | 'sl_hit' | 'timeout'
}

export interface WalkForwardWindow {
  trainStart: Date
  trainEnd: Date
  testStart: Date
  testEnd: Date
}

export interface BacktestMetrics {
  totalSignals: number
  t1HitCount: number
  t2HitCount: number
  t3HitCount: number
  t4HitCount: number
  slHitCount: number
  timeoutCount: number
  t1HitRate: number
  t2HitRate: number
  t3HitRate: number
  t4HitRate: number
  winRate: number
  avgPnlR: number
  profitFactor: number
  maxDrawdown: number
  sharpeRatio: number
}

export class WalkForwardEngine {
  private signalGenerator: SignalGenerator
  private regimeDetector: RegimeDetector

  constructor() {
    this.signalGenerator = new SignalGenerator()
    this.regimeDetector = new RegimeDetector()
  }

  /**
   * Generate walk-forward windows
   * Default: 180 day train, 30 day test, rolling by 30 days
   */
  generateWindows(
    data: OHLCV[],
    trainDays: number = 180,
    testDays: number = 30
  ): WalkForwardWindow[] {
    const windows: WalkForwardWindow[] = []
    const dayMs = 24 * 60 * 60 * 1000

    for (let i = 0; i < data.length - trainDays - testDays; i += testDays) {
      const trainStart = data[i].timestamp
      const trainEnd = new Date(trainStart.getTime() + trainDays * dayMs)
      const testStart = trainEnd
      const testEnd = new Date(testStart.getTime() + testDays * dayMs)

      const testDataExists = data.some(
        c => c.timestamp >= testStart && c.timestamp <= testEnd
      )

      if (testDataExists) {
        windows.push({
          trainStart,
          trainEnd,
          testStart,
          testEnd
        })
      }
    }

    return windows
  }

  /**
   * Backtest on a single window
   * Generates signals, tracks outcomes, returns backtested signals
   */
  backtestWindow(
    allData: OHLCV[],
    window: WalkForwardWindow,
    symbol: string,
    market: 'CRYPTO' | 'FNO'
  ): BacktestSignal[] {
    const testData = allData.filter(c => c.timestamp >= window.testStart && c.timestamp < window.testEnd)

    const backtestSignals: BacktestSignal[] = []

    for (let i = 100; i < testData.length; i++) {
      const candle = testData[i]

      try {
        const indicators = this.calculateIndicators(testData, i)

        if (!indicators) continue

        const direction = this.determineDirection(indicators)

        const context: SignalGenerationContext = {
          symbol,
          market,
          indicators,
          entryPrice: candle.close,
          direction,
          currentHour: candle.timestamp.getHours(),
          currentDay: candle.timestamp.getDate()
        }

        const signal = this.signalGenerator.generateSignal(context)
        if (!signal) continue

        const backtestSignal: BacktestSignal = {
          signal,
          enteredAt: candle.timestamp,
          entryPrice: candle.close,
          pnlR: 0,
          status: 'timeout'
        }

        const maxHoldBars = 200

        for (let j = i + 1; j < Math.min(i + maxHoldBars, testData.length); j++) {
          const futureCandle = testData[j]

          const t1Hit = this.checkTargetHit(futureCandle, signal.targets[0], direction)
          const t2Hit = this.checkTargetHit(futureCandle, signal.targets[1], direction)
          const t3Hit = this.checkTargetHit(futureCandle, signal.targets[2], direction)
          const t4Hit = this.checkTargetHit(futureCandle, signal.targets[3], direction)
          const slHit = this.checkStopLossHit(futureCandle, signal.stopLoss.initial, direction)

          if (slHit && !backtestSignal.slHitAt) {
            backtestSignal.slHitAt = futureCandle.timestamp
            backtestSignal.slHitPrice = futureCandle.low
            backtestSignal.exitedAt = futureCandle.timestamp
            backtestSignal.exitReason = 'SL_HIT'
            backtestSignal.pnlR = direction === Direction.LONG ? -1.0 : -1.0
            backtestSignal.status = 'sl_hit'
            backtestSignals.push(backtestSignal)
            break
          }

          if (t1Hit && !backtestSignal.t1HitAt) {
            backtestSignal.t1HitAt = futureCandle.timestamp
            backtestSignal.t1HitPrice = signal.targets[0].price
            backtestSignal.pnlR = signal.targets[0].riskMultiple
            backtestSignal.status = 't1_hit'

            if (!t2Hit && !t3Hit && !t4Hit && j === Math.min(i + maxHoldBars - 1, testData.length - 1)) {
              backtestSignal.exitedAt = futureCandle.timestamp
              backtestSignal.exitReason = 'T1_ONLY'
              backtestSignals.push(backtestSignal)
              break
            }
          }

          if (t2Hit && !backtestSignal.t2HitAt) {
            backtestSignal.t2HitAt = futureCandle.timestamp
            backtestSignal.t2HitPrice = signal.targets[1].price
            backtestSignal.pnlR = signal.targets[1].riskMultiple
            backtestSignal.status = 't2_hit'

            if (!t3Hit && !t4Hit && j === Math.min(i + maxHoldBars - 1, testData.length - 1)) {
              backtestSignal.exitedAt = futureCandle.timestamp
              backtestSignal.exitReason = 'T2_ONLY'
              backtestSignals.push(backtestSignal)
              break
            }
          }

          if (t3Hit && !backtestSignal.t3HitAt) {
            backtestSignal.t3HitAt = futureCandle.timestamp
            backtestSignal.t3HitPrice = signal.targets[2].price
            backtestSignal.pnlR = signal.targets[2].riskMultiple
            backtestSignal.status = 't3_hit'

            if (!t4Hit && j === Math.min(i + maxHoldBars - 1, testData.length - 1)) {
              backtestSignal.exitedAt = futureCandle.timestamp
              backtestSignal.exitReason = 'T3_ONLY'
              backtestSignals.push(backtestSignal)
              break
            }
          }

          if (t4Hit && !backtestSignal.t4HitAt) {
            backtestSignal.t4HitAt = futureCandle.timestamp
            backtestSignal.t4HitPrice = signal.targets[3].price
            backtestSignal.pnlR = signal.targets[3].riskMultiple
            backtestSignal.status = 't4_hit'
            backtestSignal.exitedAt = futureCandle.timestamp
            backtestSignal.exitReason = 'T4_HIT'
            backtestSignals.push(backtestSignal)
            break
          }

          if (j === Math.min(i + maxHoldBars - 1, testData.length - 1)) {
            backtestSignal.exitedAt = futureCandle.timestamp
            backtestSignal.exitReason = 'TIMEOUT'
            backtestSignals.push(backtestSignal)
            break
          }
        }
      } catch (e) {
        continue
      }
    }

    return backtestSignals
  }

  /**
   * Calculate metrics from backtested signals
   */
  calculateMetrics(signals: BacktestSignal[]): BacktestMetrics {
    const t1Hits = signals.filter(s => s.status === 't1_hit').length
    const t2Hits = signals.filter(s => s.status === 't2_hit').length
    const t3Hits = signals.filter(s => s.status === 't3_hit').length
    const t4Hits = signals.filter(s => s.status === 't4_hit').length
    const slHits = signals.filter(s => s.status === 'sl_hit').length
    const timeouts = signals.filter(s => s.status === 'timeout').length

    const wins = signals.filter(s => s.pnlR > 0).length
    const losses = signals.filter(s => s.pnlR < 0).length

    const totalR = signals.reduce((sum, s) => sum + s.pnlR, 0)

    const sortedPnl = signals.map(s => s.pnlR).sort((a, b) => a - b)
    let maxDrawdown = 0
    let cumulative = 0
    let peak = 0

    for (const r of signals) {
      cumulative += r.pnlR
      peak = Math.max(peak, cumulative)
      maxDrawdown = Math.min(maxDrawdown, cumulative - peak)
    }

    const sharpeRatio = this.calculateSharpeRatio(signals)

    return {
      totalSignals: signals.length,
      t1HitCount: t1Hits,
      t2HitCount: t2Hits,
      t3HitCount: t3Hits,
      t4HitCount: t4Hits,
      slHitCount: slHits,
      timeoutCount: timeouts,
      t1HitRate: signals.length > 0 ? t1Hits / signals.length : 0,
      t2HitRate: signals.length > 0 ? t2Hits / signals.length : 0,
      t3HitRate: signals.length > 0 ? t3Hits / signals.length : 0,
      t4HitRate: signals.length > 0 ? t4Hits / signals.length : 0,
      winRate: signals.length > 0 ? wins / signals.length : 0,
      avgPnlR: signals.length > 0 ? totalR / signals.length : 0,
      profitFactor: losses > 0 ? Math.abs(signals.filter(s => s.pnlR > 0).reduce((sum, s) => sum + s.pnlR, 0) / signals.filter(s => s.pnlR < 0).reduce((sum, s) => sum + s.pnlR, 0)) : Infinity,
      maxDrawdown: Math.abs(maxDrawdown),
      sharpeRatio
    }
  }

  /**
   * Check if price hit a target
   */
  private checkTargetHit(candle: OHLCV, target: any, direction: Direction): boolean {
    if (direction === Direction.LONG) {
      return candle.high >= target.price
    } else {
      return candle.low <= target.price
    }
  }

  /**
   * Check if stop loss was hit
   */
  private checkStopLossHit(candle: OHLCV, stopLoss: number, direction: Direction): boolean {
    if (direction === Direction.LONG) {
      return candle.low <= stopLoss
    } else {
      return candle.high >= stopLoss
    }
  }

  /**
   * Determine direction based on indicators
   */
  private determineDirection(indicators: any): Direction {
    if (indicators.ema21 > indicators.ema55) {
      return Direction.LONG
    } else {
      return Direction.SHORT
    }
  }

  /**
   * Calculate technical indicators for a specific bar
   */
  private calculateIndicators(data: OHLCV[], index: number): any | null {
    if (index < 200) return null

    const slice = data.slice(Math.max(0, index - 200), index + 1)

    const ema21 = this.calculateEMA(slice.map(c => c.close), 21)
    const ema55 = this.calculateEMA(slice.map(c => c.close), 55)
    const ema200 = this.calculateEMA(slice.map(c => c.close), 200)

    const adx = this.calculateADX(slice)
    const atr = this.calculateATR(slice, 14)
    const rsi = this.calculateRSI(slice.map(c => c.close), 14)

    return {
      ema21,
      ema55,
      ema200,
      adx,
      atr,
      rsi,
      atrPercentile: 50,
      macdHistogram: 0,
      macdHistogramAccel: 0,
      obv: 0,
      obvAboveMA: true,
      cvdPositive: true,
      bbHigh: data[index].high + atr,
      bbLow: data[index].low - atr,
      kelHigh: data[index].high + atr * 1.5,
      kelLow: data[index].low - atr * 1.5,
      pcr: 1.0,
      fundingRate: 0,
      oiDelta: 0,
      close: data[index].close
    }
  }

  private calculateEMA(closes: number[], period: number): number {
    if (closes.length < period) return closes[closes.length - 1]

    const k = 2 / (period + 1)
    let ema = closes.slice(0, period).reduce((a, b) => a + b) / period

    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k)
    }

    return ema
  }

  private calculateATR(candles: OHLCV[], period: number = 14): number {
    const trs: number[] = []

    for (let i = 1; i < candles.length; i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
      trs.push(tr)
    }

    if (trs.length < period) return trs.reduce((a, b) => a + b, 0) / trs.length

    return trs.slice(-period).reduce((a, b) => a + b) / period
  }

  private calculateADX(candles: OHLCV[], period: number = 14): number {
    return 25
  }

  private calculateRSI(closes: number[], period: number = 14): number {
    if (closes.length < period + 1) return 50

    const changes = []
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1])
    }

    const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / period
    const losses = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period

    if (losses === 0) return 100

    const rs = gains / losses
    return 100 - 100 / (1 + rs)
  }

  private calculateSharpeRatio(signals: BacktestSignal[], riskFreeRate: number = 0.02): number {
    if (signals.length < 2) return 0

    const returns = signals.map(s => s.pnlR)
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
    const stdDev = Math.sqrt(variance)

    if (stdDev === 0) return 0

    return (mean - riskFreeRate / 252) / stdDev * Math.sqrt(252)
  }
}
