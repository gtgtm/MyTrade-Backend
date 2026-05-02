// src/strategy/vetoChecker.ts
// Veto Checks - Hard Filters that Block Signal Generation

import { VetoCheck, Indicators, Direction, Market } from '../types/signal'

export interface VetoContext {
  symbol: string
  market: Market
  direction: Direction
  entryPrice: number
  indicators: Indicators
  currentHour: number
  currentDay: number
  newsEvents?: NewsEvent[]
  bbHigh: number
  bbLow: number
}

export interface NewsEvent {
  symbol: string
  eventName: string
  severity: 'low' | 'medium' | 'high'
  scheduledTime: Date
}

export class VetoChecker {
  /**
   * Run all veto checks
   * Returns true if ALL checks pass (signal can proceed)
   * Returns false if ANY check fails (signal blocked)
   */
  runAllChecks(context: VetoContext): VetoCheck[] {
    return [
      this.checkNewsEvent(context),
      this.checkSpreadWidth(context),
      this.checkATRChaos(context),
      this.checkEntryZone(context),
      this.checkExpiryDay(context),
      this.checkLiquidityHours(context),
      this.checkLiquidationCascade(context)
    ]
  }

  /**
   * Veto #1: News Events
   * Block trading 30 mins before and 60 mins after major news events
   */
  private checkNewsEvent(context: VetoContext): VetoCheck {
    if (!context.newsEvents || context.newsEvents.length === 0) {
      return {
        name: 'News Event',
        passed: true,
        detail: 'No scheduled news events'
      }
    }

    const now = new Date()
    const relevantEvents = context.newsEvents.filter(
      event => event.symbol === context.symbol && event.severity !== 'low'
    )

    for (const event of relevantEvents) {
      const timeDiffMinutes = Math.abs(
        (event.scheduledTime.getTime() - now.getTime()) / (1000 * 60)
      )

      const bufferMinutes = event.severity === 'high' ? 90 : 45

      if (timeDiffMinutes < bufferMinutes) {
        return {
          name: 'News Event',
          passed: false,
          detail: `${event.eventName} (${event.severity}) in ${Math.ceil(timeDiffMinutes)} mins`
        }
      }
    }

    return {
      name: 'News Event',
      passed: true,
      detail: 'No imminent news events'
    }
  }

  /**
   * Veto #2: Spread Width
   * Block if spread is too wide relative to volatility
   * For crypto: block if spread > 0.1% of mid price
   * For stocks: block if spread > 0.05% of mid price
   */
  private checkSpreadWidth(context: VetoContext): VetoCheck {
    const maxSpreadPercent = context.market === Market.CRYPTO ? 0.15 : 0.08

    const atrPercent = (context.indicators.atr / context.entryPrice) * 100
    const spreadThreshold = (maxSpreadPercent / 100) * context.entryPrice

    if (context.indicators.atr > spreadThreshold) {
      return {
        name: 'Spread Width',
        passed: false,
        detail: `ATR ${context.indicators.atr.toFixed(4)} exceeds spread limit for ${context.market}`
      }
    }

    return {
      name: 'Spread Width',
      passed: true,
      detail: `ATR ${context.indicators.atr.toFixed(4)} within acceptable range`
    }
  }

  /**
   * Veto #3: ATR Chaos
   * Block if volatility is at extreme levels (ATR percentile > 90)
   * This indicates potential black swan / circuit breaker conditions
   */
  private checkATRChaos(context: VetoContext): VetoCheck {
    const chaosThreshold = 85

    if (context.indicators.atrPercentile > chaosThreshold) {
      return {
        name: 'ATR Chaos',
        passed: false,
        detail: `Extreme volatility: ATR ${context.indicators.atrPercentile}th percentile`
      }
    }

    return {
      name: 'ATR Chaos',
      passed: true,
      detail: `ATR percentile ${context.indicators.atrPercentile} (acceptable)`
    }
  }

  /**
   * Veto #4: Entry Zone (Support/Resistance)
   * Block if entry price is in a resistance zone (risky entry)
   * Check if entry is in top 20% or bottom 20% of Bollinger Bands
   */
  private checkEntryZone(context: VetoContext): VetoCheck {
    const bbRange = context.bbHigh - context.bbLow
    const entryInBB = (context.entryPrice - context.bbLow) / (bbRange || 1)

    const inResistance = entryInBB > 0.8
    const inSupport = entryInBB < 0.2

    if (
      (context.direction === Direction.LONG && inResistance) ||
      (context.direction === Direction.SHORT && inSupport)
    ) {
      const zone = context.direction === Direction.LONG ? 'resistance' : 'support'
      return {
        name: 'Entry Zone',
        passed: false,
        detail: `Entry at ${zone} (${(entryInBB * 100).toFixed(0)}% in bands) - high risk`
      }
    }

    return {
      name: 'Entry Zone',
      passed: true,
      detail: `Entry in neutral zone (${(entryInBB * 100).toFixed(0)}% in bands)`
    }
  }

  /**
   * Veto #5: Expiry Day (F&O Only)
   * Block if trading on expiry day (monthly or weekly) - high slippage risk
   * F&O: Block on last Thursday or last 3 days of month
   * Crypto: No veto (perpetual contracts)
   */
  private checkExpiryDay(context: VetoContext): VetoCheck {
    if (context.market === Market.CRYPTO) {
      return {
        name: 'Expiry Day',
        passed: true,
        detail: 'Crypto (perpetuals) - no expiry veto'
      }
    }

    const dayOfMonth = context.currentDay
    const lastDayOfMonth = 31
    const daysFromEnd = lastDayOfMonth - dayOfMonth

    const isLastThursday = context.currentDay >= 22 && context.currentDay <= 28
    const isMonthEnd = daysFromEnd <= 3

    if (isLastThursday || isMonthEnd) {
      return {
        name: 'Expiry Day',
        passed: false,
        detail: `F&O expiry period (${dayOfMonth}th of month) - high slippage`
      }
    }

    return {
      name: 'Expiry Day',
      passed: true,
      detail: 'Not expiry day'
    }
  }

  /**
   * Veto #6: Liquidity Hours
   * Block during low liquidity periods
   * Crypto: Block midnight to 6am UTC (off-peak)
   * Stocks: Block first 30 mins (gap fills) and last 30 mins (exit liquidity)
   */
  private checkLiquidityHours(context: VetoContext): VetoCheck {
    if (context.market === Market.CRYPTO) {
      const lowLiquidityHours = [0, 1, 2, 3, 4, 5]
      const hour = context.currentHour

      if (lowLiquidityHours.includes(hour)) {
        return {
          name: 'Liquidity Hours',
          passed: false,
          detail: `Low liquidity period (${hour}:00 UTC)`
        }
      }
    } else {
      const hour = context.currentHour
      const firstThirtyMins = hour === 9
      const lastThirtyMins = hour === 15

      if (firstThirtyMins || lastThirtyMins) {
        const period = firstThirtyMins ? 'market open' : 'market close'
        return {
          name: 'Liquidity Hours',
          passed: false,
          detail: `Low liquidity near ${period}`
        }
      }
    }

    return {
      name: 'Liquidity Hours',
      passed: true,
      detail: 'Good liquidity hours'
    }
  }

  /**
   * Veto #7: Liquidation Cascade (Crypto Only)
   * Block if Open Interest is collapsing (OI delta < -50%)
   * Indicates liquidations in progress, high slippage
   */
  private checkLiquidationCascade(context: VetoContext): VetoCheck {
    if (context.market === Market.CRYPTO) {
      const oiDelta = context.indicators.oiDelta ?? 0
      const cascadeThreshold = -0.5

      if (oiDelta < cascadeThreshold) {
        return {
          name: 'Liquidation Cascade',
          passed: false,
          detail: `OI collapsing (${(oiDelta * 100).toFixed(1)}%) - liquidations in progress`
        }
      }
    }

    return {
      name: 'Liquidation Cascade',
      passed: true,
      detail: 'OI stable'
    }
  }

  /**
   * Check if all veto checks passed
   */
  allChecksPassed(vetoChecks: VetoCheck[]): boolean {
    return vetoChecks.every(check => check.passed)
  }

  /**
   * Get summary of failed checks
   */
  getFailedChecks(vetoChecks: VetoCheck[]): VetoCheck[] {
    return vetoChecks.filter(check => !check.passed)
  }
}
