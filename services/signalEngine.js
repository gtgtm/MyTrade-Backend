class SignalEngine {
  // Signal strength scoring (0-100)
  static generate(chain, priceHistory = []) {
    const indicators = this.computeIndicators(chain, priceHistory);
    const score = this.computeScore(indicators, chain);
    const signalType = this.determineSignalType(indicators, score, chain);

    // Determine the direction for SL/Target calculation
    // Use the determined signal type, or infer from RSI if NO TRADE
    let calcDirection = signalType;
    if (signalType === 'WAIT' || signalType === 'NO TRADE') {
      const rsi = indicators.rsi5m;
      calcDirection = rsi < 35 ? 'BUY CALL' : rsi > 65 ? 'BUY PUT' : 'BUY CALL';
    }

    return {
      symbol: chain.symbol,
      price: chain.price,
      signalType: signalType === 'WAIT' ? 'NO TRADE' : signalType,
      score,
      entryPrice: chain.price,
      stopLoss: this.computeStopLoss(chain, calcDirection),
      target: this.computeTarget(chain, calcDirection),
      pcr: chain.pcr,
      maxPain: chain.maxPain,
      daysToExpiry: chain.daysToExpiry,
      generatedAt: new Date().toISOString(),
      indicators
    };
  }

  static computeIndicators(chain, priceHistory) {
    let rsi1h = 50, rsi15m = 50, rsi5m = 50;
    let ema1h = chain.price, ema15m = chain.price, ema5m = chain.price;

    if (priceHistory.length >= 30) {
      const resampled = this.resample(priceHistory, 4);
      if (resampled.length >= 1) {
        rsi5m = this.rsi(resampled);
        ema5m = this.ema(resampled, 9);
      }
      if (resampled.length >= 3) {
        rsi15m = this.rsi(resampled.slice(-3));
        ema15m = this.ema(resampled.slice(-3), 9);
      }
      if (resampled.length >= 12) {
        rsi1h = this.rsi(resampled.slice(-12));
        ema1h = this.ema(resampled.slice(-12), 9);
      }
    }

    return {
      rsi1h: Math.round(rsi1h),
      rsi15m: Math.round(rsi15m),
      rsi5m: Math.round(rsi5m),
      ema1h: Math.round(ema1h * 100) / 100,
      ema15m: Math.round(ema15m * 100) / 100,
      ema5m: Math.round(ema5m * 100) / 100,
      pcrRatio: chain.pcr,
      maxPain: chain.maxPain
    };
  }

  static computeScore(indicators, chain) {
    let score = 50;
    let confirmations = 0; // Track confluence

    // RSI scoring (must be oversold/overbought)
    const rsi5m = indicators.rsi5m;
    if (rsi5m < 30) {
      score += 15;
      confirmations++;
    } else if (rsi5m < 40) {
      score += 10;
      confirmations++;
    } else if (rsi5m > 70) {
      score -= 15;
      confirmations++;
    } else if (rsi5m > 60) {
      score -= 10;
      confirmations++;
    }

    // EMA alignment (price > 5m EMA > 15m EMA = uptrend)
    const priceAboveEma5m = chain.price > indicators.ema5m;
    const ema5mAboveEma15m = indicators.ema5m > indicators.ema15m;
    const ema15mAboveEma1h = indicators.ema15m > indicators.ema1h;

    if (priceAboveEma5m && ema5mAboveEma15m) {
      score += 12;
      confirmations++;
    }
    if (ema5mAboveEma15m && ema15mAboveEma1h) {
      score += 8;
      confirmations++;
    }

    // PCR scoring (must be extreme)
    if (chain.pcr > 1.20) {
      score += 10;
      confirmations++;
    } else if (chain.pcr < 0.80) {
      score += 10;
      confirmations++;
    }

    // Max Pain proximity (closer = stronger signal)
    const distanceToMP = Math.abs(chain.price - chain.maxPain);
    const percentFromMP = (distanceToMP / chain.price) * 100;
    if (percentFromMP < 0.5) {
      score += 8;
      confirmations++;
    } else if (percentFromMP < 2) {
      score += 4;
    }

    // Store confirmation count in score object
    score = Math.max(0, Math.min(100, score));

    // Add confluence indicator (will be used in signal type determination)
    chain._confirmations = confirmations;

    return score;
  }

  static determineSignalType(indicators, score, chain) {
    const rsi = indicators.rsi5m;
    const confirmations = chain._confirmations || 0;

    // STRICT: Require 4+ confirmations (confluence) for strong signal
    // This filters out noisy signals
    const minConfirmations = 4;

    const priceAboveEma5m = chain.price > indicators.ema5m;
    const ema5mAboveEma15m = indicators.ema5m > indicators.ema15m;

    // BUY CALL: Oversold + uptrend + strong confluence
    if (rsi < 35 &&
        priceAboveEma5m &&
        ema5mAboveEma15m &&
        score >= 70 &&
        confirmations >= minConfirmations) {
      return 'BUY CALL';
    }

    // BUY PUT: Overbought + downtrend + strong confluence
    if (rsi > 65 &&
        chain.price < indicators.ema5m &&
        indicators.ema5m < indicators.ema15m &&
        score >= 70 &&
        confirmations >= minConfirmations) {
      return 'BUY PUT';
    }

    // If score is good but confirmations are low, return WAIT (no signal)
    // This prevents trading weak setups
    return 'NO TRADE';
  }

  static computeStopLoss(chain, signalType) {
    const slPercent = 0.02;
    return signalType === 'BUY CALL'
      ? Math.round((chain.price * (1 - slPercent)) * 100) / 100
      : Math.round((chain.price * (1 + slPercent)) * 100) / 100;
  }

  static computeTarget(chain, signalType) {
    const tpPercent = 0.05;
    return signalType === 'BUY CALL'
      ? Math.round((chain.price * (1 + tpPercent)) * 100) / 100
      : Math.round((chain.price * (1 - tpPercent)) * 100) / 100;
  }

  static resample(prices, targetCount) {
    if (prices.length < 2) return prices;
    if (prices.length <= targetCount) return prices;

    const result = [];
    const step = Math.floor(prices.length / targetCount);
    for (let i = 0; i < prices.length; i += step) {
      result.push(prices[i]);
    }
    return result.slice(0, targetCount);
  }

  static ema(prices, period) {
    if (prices.length < period) return prices[prices.length - 1] || 0;

    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  static rsi(prices) {
    if (prices.length < 2) return 50;

    let gains = 0, losses = 0;
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / (prices.length - 1);
    const avgLoss = losses / (prices.length - 1);

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  static mockPrice() {
    return 22300 + (Math.random() - 0.5) * 600;
  }
}

export default SignalEngine;
