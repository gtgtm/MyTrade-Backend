class ExplanationService {
  buildPCRNarrative(pcrContext) {
    if (!pcrContext) return '';

    const { current, mean, deviationPercent, percentile } = pcrContext;
    const direction = deviationPercent > 0 ? 'above' : 'below';
    const absDev = Math.abs(deviationPercent).toFixed(1);

    if (current > 1.2) {
      return `PCR of ${current.toFixed(2)} is ${absDev}% ${direction} the 30-day average of ${mean.toFixed(2)}, indicating heavy put buying and strong bearish sentiment.`;
    } else if (current < 0.8) {
      return `PCR of ${current.toFixed(2)} is ${absDev}% ${direction} the 30-day average of ${mean.toFixed(2)}, showing strong call buying with bullish conviction.`;
    } else {
      return `PCR of ${current.toFixed(2)} is near the 30-day average of ${mean.toFixed(2)}, suggesting neutral sentiment at the ${percentile}th percentile.`;
    }
  }

  buildMaxPainNarrative(symbol, currentPrice, maxPain, daysToExpiry) {
    if (!maxPain) return '';

    const distance = currentPrice - maxPain;
    const distancePct = (Math.abs(distance) / currentPrice * 100).toFixed(2);
    const direction = distance > 0 ? 'above' : 'below';
    const implication = distance > 0
      ? `price has downward gravitational pull toward max pain as expiry (${daysToExpiry} days) approaches.`
      : `price has upward gravitational pull toward max pain as expiry (${daysToExpiry} days) approaches.`;

    return `${symbol} is trading ${distancePct}% ${direction} max pain at ${maxPain.toFixed(0)}, creating ${implication}`;
  }

  buildIVNarrative(ivContext) {
    if (!ivContext) return '';

    const { current, historicalAvg, percentile } = ivContext;
    const isHigh = current > 20;
    const isLow = current < 12;

    if (isHigh) {
      return `IV at ${current.toFixed(1)}% is elevated (${percentile}th percentile), suggesting option premium is expensive — consider selling strategies.`;
    } else if (isLow) {
      return `IV at ${current.toFixed(1)}% is low (${percentile}th percentile), making options cheap — consider buying strategies or avoid selling.`;
    } else {
      return `IV at ${current.toFixed(1)}% is near the historical average, suggesting normal option pricing with balanced premium.`;
    }
  }

  buildComprehensiveNarrative(signal, pcrContext, maxPainContext, ivContext) {
    const parts = [];

    if (pcrContext) parts.push(this.buildPCRNarrative(pcrContext));
    if (maxPainContext) parts.push(this.buildMaxPainNarrative(maxPainContext.symbol, maxPainContext.currentPrice, maxPainContext.maxPain, maxPainContext.daysToExpiry));
    if (ivContext) parts.push(this.buildIVNarrative(ivContext));

    return parts.join(' ');
  }

  suggestStrategies(direction, confidencePercent, atmIVPercent, daysToExpiry) {
    const highIV = atmIVPercent > 20;
    const lowIV = atmIVPercent < 12;
    const nearExpiry = daysToExpiry <= 3;

    if (direction === 'BULLISH') {
      if (highIV) return ['Short Put', 'Bull Put Spread', 'Iron Condor'];
      if (lowIV) return ['Bull Call Spread', 'Long Call'];
      return ['Bull Call Spread', 'Call Ratio Spread'];
    }

    if (direction === 'BEARISH') {
      if (highIV) return ['Short Call', 'Bear Call Spread', 'Call Ratio Spread'];
      if (lowIV) return ['Bear Put Spread', 'Long Put'];
      return ['Bear Put Spread', 'Put Ratio Spread'];
    }

    if (highIV) return ['Iron Condor', 'Short Straddle', 'Short Strangle'];
    if (lowIV) return ['Long Straddle', 'Long Strangle'];
    return ['Short Strangle', 'Iron Butterfly'];
  }

  generateRiskWarnings(direction, confidencePercent, atmIVPercent, daysToExpiry, pcrAnomalyFlag) {
    const warnings = [];

    if (daysToExpiry <= 3) {
      warnings.push('Near expiry — time decay accelerating; avoid long options unless high conviction.');
    }

    if (atmIVPercent > 25) {
      warnings.push('IV elevated — option premium is expensive; prefer selling strategies.');
    } else if (atmIVPercent < 10) {
      warnings.push('IV very low — options are cheap but IV expansion risk is present.');
    }

    if (confidencePercent < 50) {
      warnings.push(`Signal confidence is ${confidencePercent}% — treat as informational, not actionable.`);
    }

    if (pcrAnomalyFlag) {
      warnings.push('PCR is anomalous — may be distorted by large hedging flows.');
    }

    return warnings;
  }

  describeRiskReward(direction, stopLossPct, targetPct) {
    const riskPercent = (stopLossPct * 100).toFixed(1);
    const rewardPercent = (targetPct * 100).toFixed(1);
    const ratio = (targetPct / stopLossPct).toFixed(1);

    return `1:${ratio} (stop ${riskPercent}%, target ${rewardPercent}%)`;
  }

  buildFullExplanation(symbol, signal, enhancedChain, validationResult, historicalPCRContext, ivContext) {
    const pcrData = enhancedChain?.analysis?.pcr;
    const maxPainData = enhancedChain?.analysis?.maxPain;

    const pcrContext = historicalPCRContext ? {
      current: pcrData?.ratio || 1.0,
      mean: historicalPCRContext.mean || 1.0,
      deviationPercent: historicalPCRContext.deviationPercent || 0,
      percentile: historicalPCRContext.percentile || 50
    } : null;

    const maxPainContext = maxPainData ? {
      symbol,
      currentPrice: enhancedChain.underlying.price,
      maxPain: maxPainData.level,
      daysToExpiry: enhancedChain.expiryInfo?.daysToExpiry || 30
    } : null;

    const ivContextFull = ivContext ? {
      current: enhancedChain.analysis?.volatility?.atmIV || 15,
      historicalAvg: ivContext.mean || 15,
      percentile: ivContext.percentile || 50
    } : null;

    return {
      narrative: this.buildComprehensiveNarrative(signal, pcrContext, maxPainContext, ivContextFull),
      strategies: this.suggestStrategies(
        signal.direction,
        signal.confidence,
        ivContextFull?.current || 15,
        maxPainContext?.daysToExpiry || 30
      ),
      warnings: this.generateRiskWarnings(
        signal.direction,
        signal.confidence,
        ivContextFull?.current || 15,
        maxPainContext?.daysToExpiry || 30,
        historicalPCRContext?.isAnomaly || false
      ),
      riskReward: this.describeRiskReward(signal.direction, 0.02, 0.05)
    };
  }
}

export default new ExplanationService();
