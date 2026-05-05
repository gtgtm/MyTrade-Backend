/**
 * Intelligent Position Sizer
 * Uses Kelly Criterion, volatility adjustment, and risk management
 *
 * Features:
 * - Kelly Criterion for optimal sizing
 * - Volatility-adjusted position size
 * - Confidence-based scaling
 * - Account heat (max drawdown) protection
 * - Multi-position correlation awareness
 */

class PositionSizer {
  /**
   * Kelly Criterion: f* = (bp - q) / b
   * f* = optimal fraction of bankroll to risk
   * b = odds (win/loss ratio)
   * p = probability of win
   * q = probability of loss (1-p)
   *
   * @param {Object} options - { bankroll, winRate, avgWinSize, avgLossSize }
   * @returns {Object} Kelly sizing recommendation
   */
  static kellyCriterion(options) {
    const {
      bankroll = 10000,
      winRate = 0.5,
      avgWinSize = 100,
      avgLossSize = 100,
      riskPerTrade = 0.02,
    } = options;

    // Validate inputs
    if (winRate < 0 || winRate > 1) {
      return { error: "Win rate must be between 0 and 1" };
    }

    if (avgWinSize <= 0 || avgLossSize <= 0) {
      return { error: "Win and loss sizes must be positive" };
    }

    // Calculate odds ratio (b)
    const b = avgWinSize / avgLossSize;

    // Calculate win/loss probabilities
    const p = winRate;
    const q = 1 - p;

    // Kelly formula
    const kellyFraction = (b * p - q) / b;

    // Validate Kelly result
    if (kellyFraction <= 0) {
      return {
        kellyFraction: 0,
        safeFraction: 0,
        riskAmount: 0,
        positionSize: 0,
        recommendation: "AVOID - Negative expectancy",
        reasoning:
          "Win rate or win/loss ratio does not support trading this setup",
      };
    }

    // Use fractional Kelly for safety (reduces volatility)
    // 1/4 Kelly is standard conservative approach
    const kellyFractions = {
      full: kellyFraction,
      half: kellyFraction * 0.5,
      quarter: kellyFraction * 0.25,
      eighth: kellyFraction * 0.125,
    };

    // Choose Kelly fraction based on edge quality
    let safeFraction = kellyFraction * 0.25; // Default: 1/4 Kelly

    // Adjust based on confidence
    if (kellyFraction > 0.2) {
      safeFraction = kellyFraction * 0.2; // Use 1/5 Kelly for very aggressive
    } else if (kellyFraction > 0.1) {
      safeFraction = kellyFraction * 0.25; // Use 1/4 Kelly
    } else {
      safeFraction = kellyFraction * 0.5; // Use 1/2 Kelly for small edges
    }

    // Calculate position size
    const riskAmount = bankroll * safeFraction;
    const positionUnits = Math.floor(riskAmount / avgLossSize);
    const positionPercent = (safeFraction * 100) / (riskPerTrade * 100); // Normalize to account % at 2% risk

    return {
      kellyFraction: Number((kellyFraction * 100).toFixed(2)),
      safeFraction: Number((safeFraction * 100).toFixed(2)),
      riskAmount: Number(riskAmount.toFixed(2)),
      positionSize: Math.min(100, Math.max(5, positionPercent)),
      recommendation:
        safeFraction > 0.1
          ? "FULL SIZE"
          : safeFraction > 0.05
            ? "HALF SIZE"
            : "SMALL SIZE",
      reasoning: `Kelly: ${(kellyFraction * 100).toFixed(1)}% → Safe: ${(safeFraction * 100).toFixed(1)}% (${positionPercent.toFixed(0)}% position)`,
    };
  }

  /**
   * Volatility-Adjusted Position Size
   * Higher volatility = smaller position
   *
   * @param {number} baseSize - Base position size (10-100)
   * @param {number} atr - Average True Range
   * @param {number} closePrice - Current price
   * @returns {number} Adjusted position size
   */
  static volatilityAdjustedSize(baseSize = 100, atr = 0, closePrice = 1) {
    if (!atr || closePrice === 0) {
      return baseSize;
    }

    const atrPercent = (atr / closePrice) * 100;

    // Map ATR% to position size multiplier
    let multiplier = 1;

    if (atrPercent > 3) {
      multiplier = 0.3; // Extreme volatility = 30% size
    } else if (atrPercent > 2) {
      multiplier = 0.5; // High volatility = 50% size
    } else if (atrPercent > 1) {
      multiplier = 0.75; // Moderate volatility = 75% size
    } else if (atrPercent > 0.5) {
      multiplier = 1.0; // Normal volatility = 100% size
    } else if (atrPercent < 0.3) {
      multiplier = 1.25; // Low volatility = 125% size (more aggressive)
    }

    const adjustedSize = baseSize * multiplier;
    return Math.min(100, Math.max(5, adjustedSize));
  }

  /**
   * Confidence-Based Position Sizing
   * Scales position based on signal confidence
   *
   * @param {number} baseSize - Base position size
   * @param {number} confidence - Confidence 0-100
   * @returns {number} Scaled position
   */
  static confidenceScaledSize(baseSize = 100, confidence = 50) {
    // 0-100 confidence → 0.3-1.2 multiplier
    const multiplier = 0.3 + (confidence / 100) * 0.9;
    const scaledSize = baseSize * multiplier;
    return Math.min(100, Math.max(5, scaledSize));
  }

  /**
   * Account Heat Check
   * Limits total risk across all open positions
   *
   * @param {Object} options - { totalAccountRisk, currentHeat, riskLimit }
   * @returns {Object} Heat status and sizing recommendation
   */
  static accountHeatCheck(options) {
    const {
      totalAccountRisk = 0, // Already at risk in current positions
      riskPerThisTrade = 200, // Risk if we take this position
      maxDrawdown = 0.1, // 10% max account drawdown
      accountSize = 10000,
    } = options;

    const maxRiskAllowed = accountSize * maxDrawdown;
    const totalRiskAfter = totalAccountRisk + riskPerThisTrade;

    return {
      currentHeat: Number((totalAccountRisk / accountSize * 100).toFixed(2)),
      heatAfterTrade: Number((totalRiskAfter / accountSize * 100).toFixed(2)),
      maxAllowed: Number((maxDrawdown * 100).toFixed(2)),
      canTrade: totalRiskAfter <= maxRiskAllowed,
      recommendation:
        totalRiskAfter > maxRiskAllowed
          ? "REDUCE_SIZE_OR_SKIP"
          : "OK_TO_TRADE",
      reasoning: `Account heat: ${(totalRiskAfter / accountSize * 100).toFixed(2)}% of max ${(maxDrawdown * 100).toFixed(2)}%`,
    };
  }

  /**
   * Combined Optimal Position Size
   * Uses Kelly + Volatility + Confidence + Heat
   *
   * @param {Object} metrics - Complete trading metrics
   * @returns {Object} Complete sizing recommendation
   */
  static optimalSize(metrics) {
    const {
      bankroll = 10000,
      winRate = 0.5,
      avgWinSize = 100,
      avgLossSize = 100,
      confidence = 50,
      atr = 0,
      closePrice = 1,
      currentHeat = 0,
      volatilityRegime = "NORMAL",
    } = metrics;

    // Step 1: Kelly Criterion sizing
    const kellyResult = this.kellyCriterion({
      bankroll,
      winRate,
      avgWinSize,
      avgLossSize,
    });

    if (kellyResult.error) {
      return {
        ...kellyResult,
        recommendation: "DO_NOT_TRADE",
      };
    }

    const baseSize = kellyResult.positionSize;

    // Step 2: Volatility adjustment
    const volAdjusted = this.volatilityAdjustedSize(baseSize, atr, closePrice);

    // Step 3: Confidence scaling
    const confidenceAdjusted = this.confidenceScaledSize(volAdjusted, confidence);

    // Step 4: Heat check
    const riskPerTrade = (confidenceAdjusted / 100) * bankroll * 0.02;
    const heatCheck = this.accountHeatCheck({
      totalAccountRisk: currentHeat,
      riskPerThisTrade: riskPerTrade,
      accountSize: bankroll,
    });

    // Final size
    let finalSize = confidenceAdjusted;

    // Reduce if account heat is too high
    if (!heatCheck.canTrade) {
      finalSize = Math.max(5, finalSize * 0.5);
    }

    // Additional regime-based adjustments
    const regimeMultiplier = {
      CALM: 1.2,
      NORMAL: 1.0,
      VOLATILE: 0.75,
      EXTREME: 0.5,
    }[volatilityRegime] || 1.0;

    finalSize = finalSize * regimeMultiplier;
    finalSize = Math.min(100, Math.max(5, finalSize));

    return {
      kelly: {
        fraction: kellyResult.kellyFraction,
        safeFraction: kellyResult.safeFraction,
        positionSize: baseSize,
      },
      volatility: {
        atrPercent: ((atr / closePrice) * 100).toFixed(2),
        adjusted: volAdjusted.toFixed(0),
      },
      confidence: {
        level: confidence,
        adjusted: confidenceAdjusted.toFixed(0),
      },
      accountHeat: {
        current: heatCheck.currentHeat,
        after: heatCheck.heatAfterTrade,
        canTrade: heatCheck.canTrade,
      },
      regime: volatilityRegime,
      finalPositionSize: finalSize.toFixed(0),
      finalPositionPercent: `${finalSize.toFixed(0)}%`,
      recommendation:
        finalSize > 50
          ? "FULL_SIZE"
          : finalSize > 30
            ? "MEDIUM_SIZE"
            : finalSize > 15
              ? "SMALL_SIZE"
              : "VERY_SMALL_SIZE",
      riskPerTrade: riskPerTrade.toFixed(0),
      expectedProfit: (riskPerTrade * (winRate / (1 - winRate))).toFixed(0),
      breakeven: `${((1 - winRate) * 100).toFixed(0)}% drawdown protection`,
    };
  }

  /**
   * Calculate optimal stop loss and target based on volatility
   */
  static optimalStopAndTarget(entryPrice, direction, volatilityPercent) {
    const volatility = volatilityPercent / 100;

    if (direction === "BUY_CALL" || direction === "BUY") {
      // For uptrends, use 2x ATR for stop, 4x ATR for target
      const stopLoss = entryPrice * (1 - volatility * 2);
      const target = entryPrice * (1 + volatility * 4);

      return {
        entry: entryPrice,
        stopLoss: Number(stopLoss.toFixed(2)),
        target: Number(target.toFixed(2)),
        riskReward: (
          ((target - entryPrice) / (entryPrice - stopLoss)) *
          100
        ).toFixed(1),
        recommendation: "Risk 1% to gain 4%",
      };
    } else {
      // For downtrends, reverse logic
      const stopLoss = entryPrice * (1 + volatility * 2);
      const target = entryPrice * (1 - volatility * 4);

      return {
        entry: entryPrice,
        stopLoss: Number(stopLoss.toFixed(2)),
        target: Number(target.toFixed(2)),
        riskReward: (
          ((entryPrice - target) / (stopLoss - entryPrice)) *
          100
        ).toFixed(1),
        recommendation: "Risk 1% to gain 4%",
      };
    }
  }

  /**
   * Drawdown recovery calculator
   * Shows how much you need to gain to recover from a loss
   */
  static recoveryRequired(drawdownPercent) {
    // Formula: recovery_needed = drawdown / (1 - drawdown)
    const drawdown = drawdownPercent / 100;
    const recoveryNeeded = drawdown / (1 - drawdown);

    return {
      drawdown: drawdownPercent.toFixed(1),
      recoveryNeeded: (recoveryNeeded * 100).toFixed(1),
      example: {
        accountSize: 10000,
        afterLoss: (10000 * (1 - drawdown)).toFixed(0),
        recoveryTarget: 10000,
        gainNeeded: (10000 * recoveryNeeded).toFixed(0),
        gainPercent: (recoveryNeeded * 100).toFixed(1),
      },
    };
  }
}

export default PositionSizer;
