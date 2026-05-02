// Quality Filter - Veto checks to block low-quality signals
// Implements 7-veto rule system from TypeScript pipeline

class QualityFilter {
  static VETO_CHECKS = {
    ATR_CHAOS: 'ATR_CHAOS',
    SPREAD_WIDTH: 'SPREAD_WIDTH',
    ENTRY_ZONE: 'ENTRY_ZONE',
    LIQUIDITY: 'LIQUIDITY',
    EXPIRY_DAY: 'EXPIRY_DAY',
    REGIME_INCOMPATIBLE: 'REGIME_INCOMPATIBLE',
    DRAWDOWN_PROTECTION: 'DRAWDOWN_PROTECTION'
  };

  // Filter signal based on market conditions
  static filterSignal(signal, marketContext = {}) {
    const vetoes = this.runVetoChecks(signal, marketContext);
    const blocked = Object.values(vetoes).some(v => !v.passed);

    return {
      signal,
      isValid: !blocked,
      vetoes,
      blockReason: blocked ? Object.values(vetoes).find(v => !v.passed)?.reason : null
    };
  }

  static runVetoChecks(signal, marketContext = {}) {
    return {
      [this.VETO_CHECKS.ATR_CHAOS]: this.checkATRChaos(signal, marketContext),
      [this.VETO_CHECKS.SPREAD_WIDTH]: this.checkSpreadWidth(signal, marketContext),
      [this.VETO_CHECKS.ENTRY_ZONE]: this.checkEntryZone(signal, marketContext),
      [this.VETO_CHECKS.LIQUIDITY]: this.checkLiquidityHours(signal, marketContext),
      [this.VETO_CHECKS.EXPIRY_DAY]: this.checkExpiryDay(signal, marketContext),
      [this.VETO_CHECKS.REGIME_INCOMPATIBLE]: this.checkRegimeCompatibility(signal, marketContext),
      [this.VETO_CHECKS.DRAWDOWN_PROTECTION]: this.checkDrawdownProtection(signal, marketContext)
    };
  }

  // Veto 1: ATR Chaos - block if volatility is too extreme
  static checkATRChaos(signal, context) {
    // If breakdown includes ATR, use it; otherwise allow
    const breakdown = signal.breakdown || {};
    const atrValue = breakdown.atr || 0;
    const atrPercent = (atrValue / signal.price) * 100;

    // Block if ATR > 5% of price (extreme volatility)
    if (atrPercent > 5) {
      return {
        passed: false,
        reason: `ATR chaos: ${atrPercent.toFixed(2)}% > 5% threshold`,
        severity: 'high'
      };
    }

    return {
      passed: true,
      reason: 'ATR within acceptable range',
      atrPercent: atrPercent.toFixed(2)
    };
  }

  // Veto 2: Spread Width - block if bid-ask spread is too wide
  static checkSpreadWidth(signal, context) {
    const tickerData = context.ticker || {};
    const bid = tickerData.bidPrice || signal.price * 0.999;
    const ask = tickerData.askPrice || signal.price * 1.001;
    const spread = ask - bid;
    const spreadPercent = (spread / signal.price) * 100;

    // Block if spread > 0.5% (illiquid)
    if (spreadPercent > 0.5) {
      return {
        passed: false,
        reason: `Spread too wide: ${spreadPercent.toFixed(3)}% > 0.5% threshold`,
        severity: 'medium'
      };
    }

    return {
      passed: true,
      reason: 'Spread within acceptable range',
      spreadPercent: spreadPercent.toFixed(3)
    };
  }

  // Veto 3: Entry Zone - ensure entry is not at extreme extremes
  static checkEntryZone(signal, context) {
    const breakdown = signal.breakdown || {};
    const bbLow = breakdown.bbLow || signal.price * 0.97;
    const bbHigh = breakdown.bbHigh || signal.price * 1.03;

    if (signal.signalType === 'BUY CALL') {
      // For long, entry should not be within 1% of resistance
      if (signal.entryPrice > bbHigh * 0.99) {
        return {
          passed: false,
          reason: 'Entry too close to resistance (potential rejection)',
          severity: 'medium'
        };
      }
    } else if (signal.signalType === 'BUY PUT') {
      // For short, entry should not be within 1% of support
      if (signal.entryPrice < bbLow * 1.01) {
        return {
          passed: false,
          reason: 'Entry too close to support (potential bounce)',
          severity: 'medium'
        };
      }
    }

    return {
      passed: true,
      reason: 'Entry price in valid zone'
    };
  }

  // Veto 4: Liquidity Hours - only trade during market hours
  static checkLiquidityHours(signal, context) {
    const now = new Date();
    const hour = now.getUTCHours();
    const dayOfWeek = now.getUTCDay();

    // For crypto: 24/7 trading, but avoid lowest liquidity (2-8 UTC on weekends)
    // For stocks: 9:15-15:30 IST = 3:45-10:00 UTC
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isLowLiquidityHour = hour >= 2 && hour <= 8;

    if (isWeekend && isLowLiquidityHour) {
      return {
        passed: false,
        reason: 'Low liquidity hours (weekend 2-8 UTC)',
        severity: 'low'
      };
    }

    return {
      passed: true,
      reason: 'Trading during acceptable liquidity hours'
    };
  }

  // Veto 5: Expiry Day Protection - avoid trading on option expiry
  static checkExpiryDay(signal, context) {
    const now = new Date();
    const dayOfMonth = now.getUTCDate();
    const dayOfWeek = now.getUTCDay();

    // Options expire on last Thursday of month typically
    // Simple heuristic: avoid last 3 days of month
    const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
    const isNearMonthEnd = dayOfMonth > daysInMonth - 3;

    if (isNearMonthEnd && dayOfWeek === 4) {
      // Thursday near month end
      return {
        passed: false,
        reason: 'Near option expiry (last Thursday of month)',
        severity: 'low'
      };
    }

    return {
      passed: true,
      reason: 'Not on option expiry day'
    };
  }

  // Veto 6: Regime Compatibility - check if signal aligns with trend
  static checkRegimeCompatibility(signal, context) {
    const breakdown = signal.breakdown || {};
    const ema21 = breakdown.ema21 || signal.price;
    const trendUp = signal.price > ema21;

    // Long signals should trade in uptrend, shorts in downtrend
    if (signal.signalType === 'BUY CALL' && !trendUp) {
      return {
        passed: false,
        reason: 'Buy signal generated in downtrend (regime incompatible)',
        severity: 'high'
      };
    }

    if (signal.signalType === 'BUY PUT' && trendUp) {
      return {
        passed: false,
        reason: 'Sell signal generated in uptrend (regime incompatible)',
        severity: 'high'
      };
    }

    return {
      passed: true,
      reason: 'Signal direction aligned with trend regime'
    };
  }

  // Veto 7: Drawdown Protection - avoid trading after recent significant losses
  static checkDrawdownProtection(signal, context) {
    // This would track cumulative PnL from recent signals
    // For now, simple check: don't generate more than 2 signals per hour per symbol
    // (This prevents overtrading same symbol)
    const recentSignals = context.recentSignals || [];
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentCount = recentSignals.filter(
      s => s.symbol === signal.symbol && new Date(s.generatedAt).getTime() > oneHourAgo
    ).length;

    if (recentCount >= 2) {
      return {
        passed: false,
        reason: `Too many recent signals for ${signal.symbol} (${recentCount} in last hour)`,
        severity: 'low'
      };
    }

    return {
      passed: true,
      reason: 'Position size and frequency acceptable'
    };
  }

  // Convenience method: check if signal passes all critical vetoes
  static isHighQuality(signal, marketContext) {
    const result = this.filterSignal(signal, marketContext);
    return result.isValid;
  }

  // Convenience method: get human-readable quality report
  static getQualityReport(signal, marketContext) {
    const vetoes = this.runVetoChecks(signal, marketContext);
    const passedCount = Object.values(vetoes).filter(v => v.passed).length;
    const totalCount = Object.keys(vetoes).length;

    return {
      signal: signal.symbol,
      signalType: signal.signalType,
      score: signal.score,
      qualityScore: `${passedCount}/${totalCount}`,
      isValid: passedCount === totalCount,
      vetoes: Object.entries(vetoes).map(([check, result]) => ({
        check,
        passed: result.passed,
        reason: result.reason,
        severity: result.severity || 'info'
      }))
    };
  }
}

export default QualityFilter;
