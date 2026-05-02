// src/services/exitManager.ts
// Exit Manager - Track target hits and update stop losses dynamically

import { SignalV2, SignalStatus } from '../types/signal'

export interface PriceTick {
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface SignalOutcome {
  signalId: string
  symbol: string
  entryPrice: number
  entryTime: Date
  exitPrice?: number
  exitTime?: Date
  exitReason?: string
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
  pnlR: number
  pnlPercent: number
  status: SignalStatus
  targetHits: {
    t1: boolean
    t2: boolean
    t3: boolean
    t4: boolean
    sl: boolean
  }
  slProgression: Array<{
    triggeredAt: Date
    reason: string
    slPrice: number
    previousSL: number
  }>
}

export class ExitManager {
  private activeSignals: Map<string, { signal: SignalV2; outcome: SignalOutcome }> = new Map()
  private completedSignals: SignalOutcome[] = []
  private maxHoldBars: number = 200

  /**
   * Register a new signal for tracking
   */
  registerSignal(signal: SignalV2): void {
    const outcome: SignalOutcome = {
      signalId: signal.id,
      symbol: signal.symbol,
      entryPrice: signal.entry.price,
      entryTime: signal.createdAt,
      pnlR: 0,
      pnlPercent: 0,
      status: SignalStatus.ACTIVE,
      targetHits: { t1: false, t2: false, t3: false, t4: false, sl: false },
      slProgression: [
        {
          triggeredAt: signal.createdAt,
          reason: 'Initial entry',
          slPrice: signal.stopLoss.initial,
          previousSL: 0
        }
      ]
    }

    this.activeSignals.set(signal.id, { signal, outcome })
  }

  /**
   * Process price tick and check for target/SL hits
   */
  processPriceTick(signal: SignalV2, tick: PriceTick): SignalOutcome | null {
    const key = signal.id
    const tracked = this.activeSignals.get(key)

    if (!tracked) {
      return null
    }

    const { outcome } = tracked
    const signal_direction = signal.direction

    // Check SL hit first (prevents further processing)
    if (!outcome.slHitAt && this.checkStopLossHit(signal.stopLoss.current, tick, signal_direction)) {
      outcome.slHitAt = tick.timestamp
      outcome.slHitPrice = signal_direction === 'LONG' ? tick.low : tick.high
      outcome.targetHits.sl = true
      outcome.exitPrice = outcome.slHitPrice
      outcome.exitTime = tick.timestamp
      outcome.exitReason = 'STOP_LOSS_HIT'
      outcome.pnlR = -1.0
      outcome.pnlPercent = ((outcome.slHitPrice - outcome.entryPrice) / outcome.entryPrice) * 100
      outcome.status = SignalStatus.SL_HIT

      this.completeSignal(key)
      return outcome
    }

    // Check T1 hit
    if (!outcome.t1HitAt && this.checkTargetHit(signal.targets[0].price, tick, signal_direction)) {
      outcome.t1HitAt = tick.timestamp
      outcome.t1HitPrice = signal.targets[0].price
      outcome.targetHits.t1 = true
      outcome.pnlR = signal.targets[0].riskMultiple

      // Update SL to breakeven on T1 hit
      this.progressStopLoss(signal, outcome, outcome.entryPrice, 'T1_HIT_BREAKEVEN')

      // Only exit if this is the last opportunity
      // Otherwise continue to potentially hit T2/T3/T4
    }

    // Check T2 hit
    if (!outcome.t2HitAt && this.checkTargetHit(signal.targets[1].price, tick, signal_direction)) {
      outcome.t2HitAt = tick.timestamp
      outcome.t2HitPrice = signal.targets[1].price
      outcome.targetHits.t2 = true
      outcome.pnlR = signal.targets[1].riskMultiple

      // Update SL to T1 price on T2 hit (lock 1R profit)
      if (outcome.t1HitPrice) {
        this.progressStopLoss(signal, outcome, outcome.t1HitPrice, 'T2_HIT_LOCK_T1')
      }
    }

    // Check T3 hit
    if (!outcome.t3HitAt && this.checkTargetHit(signal.targets[2].price, tick, signal_direction)) {
      outcome.t3HitAt = tick.timestamp
      outcome.t3HitPrice = signal.targets[2].price
      outcome.targetHits.t3 = true
      outcome.pnlR = signal.targets[2].riskMultiple

      // Update SL to T2 price on T3 hit (lock 2R profit)
      if (outcome.t2HitPrice) {
        this.progressStopLoss(signal, outcome, outcome.t2HitPrice, 'T3_HIT_LOCK_T2')
      }
    }

    // Check T4 hit
    if (!outcome.t4HitAt && this.checkTargetHit(signal.targets[3].price, tick, signal_direction)) {
      outcome.t4HitAt = tick.timestamp
      outcome.t4HitPrice = signal.targets[3].price
      outcome.targetHits.t4 = true
      outcome.pnlR = signal.targets[3].riskMultiple
      outcome.exitPrice = outcome.t4HitPrice
      outcome.exitTime = tick.timestamp
      outcome.exitReason = 'T4_HIT'
      outcome.status = SignalStatus.T4_HIT

      this.completeSignal(key)
      return outcome
    }

    // Update outcome P&L based on current state
    outcome.pnlPercent = ((outcome.exitPrice || tick.close) - outcome.entryPrice) / outcome.entryPrice * 100

    return null
  }

  /**
   * Check if stop loss was hit
   */
  private checkStopLossHit(slPrice: number, tick: PriceTick, direction: string): boolean {
    if (direction === 'LONG') {
      return tick.low <= slPrice
    } else {
      return tick.high >= slPrice
    }
  }

  /**
   * Check if target was hit
   */
  private checkTargetHit(targetPrice: number, tick: PriceTick, direction: string): boolean {
    if (direction === 'LONG') {
      return tick.high >= targetPrice
    } else {
      return tick.low <= targetPrice
    }
  }

  /**
   * Progress stop loss (lock profits, protect gains)
   */
  private progressStopLoss(
    signal: SignalV2,
    outcome: SignalOutcome,
    newSLPrice: number,
    reason: string
  ): void {
    const currentSL = signal.stopLoss.current
    const improved = Math.abs(newSLPrice - signal.entry.price) < Math.abs(currentSL - signal.entry.price)

    if (improved || reason.includes('HIT')) {
      outcome.slProgression.push({
        triggeredAt: new Date(),
        reason,
        slPrice: newSLPrice,
        previousSL: currentSL
      })

      // Update signal's SL
      signal.stopLoss.current = newSLPrice
      signal.stopLoss.history.push({
        at: new Date(),
        from: currentSL,
        to: newSLPrice,
        reason
      })
    }
  }

  /**
   * Exit signal at a specific price (manual exit or timeout)
   */
  exitSignalAtPrice(signalId: string, exitPrice: number, reason: string): SignalOutcome | null {
    const tracked = this.activeSignals.get(signalId)
    if (!tracked) return null

    const { signal, outcome } = tracked

    outcome.exitPrice = exitPrice
    outcome.exitTime = new Date()
    outcome.exitReason = reason
    outcome.pnlR = (exitPrice - outcome.entryPrice) / Math.abs(signal.stopLoss.initial - outcome.entryPrice)
    outcome.pnlPercent = ((exitPrice - outcome.entryPrice) / outcome.entryPrice) * 100

    if (reason === 'TIMEOUT') {
      outcome.status = SignalStatus.EXPIRED
    }

    this.completeSignal(signalId)
    return outcome
  }

  /**
   * Mark signal as complete and move to history
   */
  private completeSignal(signalId: string): void {
    const tracked = this.activeSignals.get(signalId)
    if (tracked) {
      this.completedSignals.push(tracked.outcome)
      this.activeSignals.delete(signalId)
    }
  }

  /**
   * Get current outcome for an active signal
   */
  getSignalOutcome(signalId: string): SignalOutcome | null {
    const tracked = this.activeSignals.get(signalId)
    return tracked ? tracked.outcome : null
  }

  /**
   * Get all active signals (being tracked)
   */
  getActiveSignals(): SignalOutcome[] {
    return Array.from(this.activeSignals.values()).map(t => t.outcome)
  }

  /**
   * Get all completed signals (history)
   */
  getCompletedSignals(): SignalOutcome[] {
    return [...this.completedSignals]
  }

  /**
   * Calculate performance metrics from completed signals
   */
  calculatePerformance(signals: SignalOutcome[]): {
    totalSignals: number
    winningSignals: number
    losingSignals: number
    t1HitCount: number
    t2HitCount: number
    t3HitCount: number
    t4HitCount: number
    slHitCount: number
    avgPnlR: number
    avgPnlPercent: number
    winRate: number
    profitFactor: number
    maxDrawdown: number
  } {
    if (signals.length === 0) {
      return {
        totalSignals: 0,
        winningSignals: 0,
        losingSignals: 0,
        t1HitCount: 0,
        t2HitCount: 0,
        t3HitCount: 0,
        t4HitCount: 0,
        slHitCount: 0,
        avgPnlR: 0,
        avgPnlPercent: 0,
        winRate: 0,
        profitFactor: 0,
        maxDrawdown: 0
      }
    }

    const t1Hits = signals.filter(s => s.targetHits.t1).length
    const t2Hits = signals.filter(s => s.targetHits.t2).length
    const t3Hits = signals.filter(s => s.targetHits.t3).length
    const t4Hits = signals.filter(s => s.targetHits.t4).length
    const slHits = signals.filter(s => s.targetHits.sl).length

    const wins = signals.filter(s => s.pnlR > 0).length
    const losses = signals.filter(s => s.pnlR < 0).length

    const totalR = signals.reduce((sum, s) => sum + s.pnlR, 0)
    const totalPercent = signals.reduce((sum, s) => sum + s.pnlPercent, 0)

    const grossWins = signals.filter(s => s.pnlR > 0).reduce((sum, s) => sum + s.pnlR, 0)
    const grossLosses = Math.abs(signals.filter(s => s.pnlR < 0).reduce((sum, s) => sum + s.pnlR, 0))

    // Max drawdown: peak-to-trough
    let maxDrawdown = 0
    let cumulative = 0
    let peak = 0

    for (const signal of signals) {
      cumulative += signal.pnlR
      peak = Math.max(peak, cumulative)
      maxDrawdown = Math.min(maxDrawdown, cumulative - peak)
    }

    return {
      totalSignals: signals.length,
      winningSignals: wins,
      losingSignals: losses,
      t1HitCount: t1Hits,
      t2HitCount: t2Hits,
      t3HitCount: t3Hits,
      t4HitCount: t4Hits,
      slHitCount: slHits,
      avgPnlR: totalR / signals.length,
      avgPnlPercent: totalPercent / signals.length,
      winRate: wins / signals.length,
      profitFactor: grossLosses > 0 ? grossWins / grossLosses : Infinity,
      maxDrawdown: Math.abs(maxDrawdown)
    }
  }

  /**
   * Generate outcome summary for logging
   */
  summarizeOutcome(outcome: SignalOutcome): string {
    const status = outcome.exitReason || 'PENDING'
    const duration = outcome.exitTime
      ? Math.round((outcome.exitTime.getTime() - outcome.entryTime.getTime()) / (1000 * 60))
      : 'N/A'

    return `${outcome.symbol} ${status} | Entry: ${outcome.entryPrice.toFixed(2)} → Exit: ${(outcome.exitPrice || 'N/A')} | P&L: ${outcome.pnlR >= 0 ? '+' : ''}${outcome.pnlR.toFixed(2)}R (${outcome.pnlPercent.toFixed(2)}%) | Duration: ${duration}m | Targets: T1=${outcome.targetHits.t1 ? '✅' : '❌'} T2=${outcome.targetHits.t2 ? '✅' : '❌'} T3=${outcome.targetHits.t3 ? '✅' : '❌'} T4=${outcome.targetHits.t4 ? '✅' : '❌'}`
  }
}
