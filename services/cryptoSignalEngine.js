class CryptoSignalEngine {
  static generate(symbol, klines, ticker) {
    if (!klines || klines.length < 50 || !ticker) {
      return this.emptySignal(symbol, ticker?.price || 0);
    }

    const closes = klines.map(k => k.close);
    const prices = klines.map(k => k.close);
    const volumes = klines.map(k => k.volume);

    // Technical indicators
    const rsi14 = this.rsi(closes, 14);
    const ema9 = this.ema(prices, 9);
    const ema21 = this.ema(prices, 21);
    const macd = this.macd(closes);
    const bb = this.bollingerBands(closes, 20, 2);

    // Market data
    const currentPrice = ticker.price;
    const priceChange = ticker.priceChangePercent;

    // Volume analysis
    const totalVolume = klines.slice(-20).reduce((sum, k) => sum + k.volume, 0);
    const takerBuyVolume = klines.slice(-20).reduce((sum, k) => sum + k.takerBuyBaseVolume, 0);
    const volumeRatio = totalVolume > 0 ? takerBuyVolume / totalVolume : 0.5;
    const volumeTrend = this.analyzeVolumeTrend(volumes);

    // Breakdown scoring
    const breakdown = this.calculateBreakdown(
      rsi14, ema9, ema21, currentPrice, priceChange,
      volumeRatio, macd, bb, volumeTrend
    );

    let score = 50;
    let confidence = 0;

    // Factor 1: RSI (weight: 25%)
    if (rsi14 < 30) {
      score += 15;
      confidence += 25;
    } else if (rsi14 < 40) {
      score += 10;
      confidence += 15;
    } else if (rsi14 > 70) {
      score -= 15;
      confidence += 20;
    } else if (rsi14 > 60) {
      score -= 10;
      confidence += 10;
    }

    // Factor 2: EMA alignment (weight: 20%)
    if (currentPrice > ema9 && ema9 > ema21) {
      score += 10;
      confidence += 20;
    } else if (currentPrice < ema9 && ema9 < ema21) {
      score -= 10;
      confidence += 20;
    }

    // Factor 3: Volume ratio (weight: 15%)
    if (volumeRatio > 0.6) {
      score += 8;
      confidence += 15;
    } else if (volumeRatio < 0.4) {
      score -= 8;
      confidence += 10;
    }

    // Factor 4: MACD (weight: 20%)
    if (macd.histogram > 0 && macd.macd > macd.signal) {
      score += 12;
      confidence += 20;
    } else if (macd.histogram < 0 && macd.macd < macd.signal) {
      score -= 12;
      confidence += 20;
    }

    // Factor 5: Bollinger Bands (weight: 10%)
    if (currentPrice < bb.lower) {
      score += 10;
      confidence += 10;
    } else if (currentPrice > bb.upper) {
      score -= 10;
      confidence += 10;
    }

    // Factor 6: Volume trend (weight: 10%)
    if (volumeTrend.trend === 'increasing') {
      score += volumeTrend.strength * 5;
      confidence += 10;
    } else if (volumeTrend.trend === 'decreasing') {
      score -= volumeTrend.strength * 3;
      confidence += 5;
    }

    score = Math.max(0, Math.min(100, score));
    confidence = Math.min(100, confidence);

    // Determine signal type with stricter rules
    let signalType = 'NO TRADE';
    if (score >= 65 && rsi14 < 40 && currentPrice > ema9 && macd.histogram > 0) {
      signalType = 'BUY CALL'; // Strong long signal
    } else if (score >= 65 && rsi14 > 60 && currentPrice < ema9 && macd.histogram < 0) {
      signalType = 'BUY PUT'; // Strong short signal
    } else if (score >= 55 && rsi14 < 50 && currentPrice > ema21) {
      signalType = 'BUY CALL'; // Moderate long signal
    } else if (score >= 55 && rsi14 > 50 && currentPrice < ema21) {
      signalType = 'BUY PUT'; // Moderate short signal
    }

    // Entry, stop loss, target
    let entryPrice, stopLoss, target;
    if (signalType === 'BUY CALL') {
      entryPrice = currentPrice;
      stopLoss = entryPrice * 0.97; // 3% below
      target = entryPrice * 1.07; // 7% above
    } else if (signalType === 'BUY PUT') {
      entryPrice = currentPrice;
      stopLoss = entryPrice * 1.03; // 3% above (for short)
      target = entryPrice * 0.93; // 7% below
    } else {
      entryPrice = currentPrice;
      stopLoss = currentPrice * 0.97;
      target = currentPrice * 1.07;
    }

    return {
      symbol,
      price: currentPrice,
      signalType,
      score,
      confidence: Math.round(confidence),
      entryPrice: Number(entryPrice.toFixed(4)),
      stopLoss: Number(stopLoss.toFixed(4)),
      target: Number(target.toFixed(4)),
      pcr: Number(volumeRatio.toFixed(4)),
      maxPain: Number(priceChange.toFixed(2)),
      daysToExpiry: null,
      generatedAt: new Date().toISOString(),
      isMock: false,
      breakdown,
      indicators: {
        rsi14: Number(rsi14.toFixed(2)),
        ema9: Number(ema9.toFixed(4)),
        ema21: Number(ema21.toFixed(4)),
        macd: Number(macd.macd.toFixed(4)),
        signal: Number(macd.signal.toFixed(4)),
        histogram: Number(macd.histogram.toFixed(4)),
        bbUpper: Number(bb.upper.toFixed(4)),
        bbLower: Number(bb.lower.toFixed(4)),
        priceChange24h: priceChange,
        volumeRatio,
        volumeTrend: volumeTrend.trend
      }
    };
  }

  static calculateBreakdown(rsi14, ema9, ema21, price, priceChange, volumeRatio, macd, bb, volumeTrend) {
    const components = [];

    // RSI component
    if (rsi14 < 30) {
      components.push({
        label: 'RSI (Oversold)',
        score: 15,
        maxScore: 25,
        direction: 'BULLISH',
        reason: `RSI at ${rsi14.toFixed(1)} indicates oversold conditions`
      });
    } else if (rsi14 > 70) {
      components.push({
        label: 'RSI (Overbought)',
        score: 0,
        maxScore: 25,
        direction: 'BEARISH',
        reason: `RSI at ${rsi14.toFixed(1)} indicates overbought conditions`
      });
    } else {
      components.push({
        label: 'RSI (Neutral)',
        score: 5,
        maxScore: 25,
        direction: null,
        reason: `RSI at ${rsi14.toFixed(1)} in neutral zone`
      });
    }

    // EMA component
    if (price > ema9 && ema9 > ema21) {
      components.push({
        label: 'EMA Alignment',
        score: 20,
        maxScore: 20,
        direction: 'BULLISH',
        reason: 'Price > EMA9 > EMA21 (uptrend confirmation)'
      });
    } else if (price < ema9 && ema9 < ema21) {
      components.push({
        label: 'EMA Alignment',
        score: 20,
        maxScore: 20,
        direction: 'BEARISH',
        reason: 'Price < EMA9 < EMA21 (downtrend confirmation)'
      });
    } else {
      components.push({
        label: 'EMA Alignment',
        score: 10,
        maxScore: 20,
        direction: null,
        reason: 'EMA not fully aligned'
      });
    }

    // Volume component
    if (volumeRatio > 0.6) {
      components.push({
        label: 'Volume Ratio',
        score: 15,
        maxScore: 15,
        direction: 'BULLISH',
        reason: `Buy volume ${(volumeRatio * 100).toFixed(1)}% - Strong buy pressure`
      });
    } else if (volumeRatio < 0.4) {
      components.push({
        label: 'Volume Ratio',
        score: 15,
        maxScore: 15,
        direction: 'BEARISH',
        reason: `Buy volume ${(volumeRatio * 100).toFixed(1)}% - Weak buy pressure`
      });
    } else {
      components.push({
        label: 'Volume Ratio',
        score: 7,
        maxScore: 15,
        direction: null,
        reason: `Buy volume ${(volumeRatio * 100).toFixed(1)}% - Balanced`
      });
    }

    // MACD component
    if (macd.histogram > 0 && macd.macd > macd.signal) {
      components.push({
        label: 'MACD',
        score: 20,
        maxScore: 20,
        direction: 'BULLISH',
        reason: 'MACD above signal line with positive histogram (bullish momentum)'
      });
    } else if (macd.histogram < 0 && macd.macd < macd.signal) {
      components.push({
        label: 'MACD',
        score: 20,
        maxScore: 20,
        direction: 'BEARISH',
        reason: 'MACD below signal line with negative histogram (bearish momentum)'
      });
    } else {
      components.push({
        label: 'MACD',
        score: 10,
        maxScore: 20,
        direction: null,
        reason: 'MACD showing mixed signals'
      });
    }

    // Bollinger Bands component
    if (price < bb.lower) {
      components.push({
        label: 'Bollinger Bands',
        score: 10,
        maxScore: 10,
        direction: 'BULLISH',
        reason: 'Price below lower band (potential reversal upward)'
      });
    } else if (price > bb.upper) {
      components.push({
        label: 'Bollinger Bands',
        score: 10,
        maxScore: 10,
        direction: 'BEARISH',
        reason: 'Price above upper band (potential reversal downward)'
      });
    } else {
      components.push({
        label: 'Bollinger Bands',
        score: 5,
        maxScore: 10,
        direction: null,
        reason: 'Price within normal bands'
      });
    }

    return components;
  }

  static macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const emaFast = this.ema(closes, fastPeriod);
    const emaSlow = this.ema(closes, slowPeriod);
    const macdLine = emaFast - emaSlow;

    // Signal line is EMA of MACD
    const macdValues = [];
    for (let i = slowPeriod - 1; i < closes.length; i++) {
      const fast = this.ema(closes.slice(0, i + 1), fastPeriod);
      const slow = this.ema(closes.slice(0, i + 1), slowPeriod);
      macdValues.push(fast - slow);
    }
    const signalLine = this.ema(macdValues, signalPeriod);

    return {
      macd: macdLine,
      signal: signalLine,
      histogram: macdLine - signalLine
    };
  }

  static bollingerBands(closes, period = 20, stdDevs = 2) {
    const sma = closes.slice(-period).reduce((a, b) => a + b) / period;
    const variance = closes.slice(-period).reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      middle: sma,
      upper: sma + stdDev * stdDevs,
      lower: sma - stdDev * stdDevs
    };
  }

  static analyzeVolumeTrend(volumes) {
    const recent = volumes.slice(-10);
    const older = volumes.slice(-20, -10);

    const recentAvg = recent.reduce((a, b) => a + b) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b) / older.length;

    const trend = recentAvg > olderAvg ? 'increasing' : 'decreasing';
    const strength = Math.abs(recentAvg - olderAvg) / olderAvg;

    return { trend, strength: Math.min(1, strength) };
  }

  static emptySignal(symbol, price) {
    return {
      symbol,
      price: price || 0,
      signalType: 'NO TRADE',
      score: 50,
      confidence: 20,
      entryPrice: price || 0,
      stopLoss: (price || 0) * 0.97,
      target: (price || 0) * 1.07,
      pcr: 0.5,
      maxPain: 0,
      daysToExpiry: null,
      generatedAt: new Date().toISOString(),
      isMock: true,
      breakdown: [],
      indicators: {}
    };
  }

  static ema(prices, period) {
    if (!prices || prices.length === 0) return 0;
    if (prices.length < period) return prices[prices.length - 1];

    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * multiplier + ema * (1 - multiplier);
    }
    return Number(ema.toFixed(4));
  }

  static rsi(closes, period = 14) {
    if (!closes || closes.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = closes[closes.length - period + i] - closes[closes.length - period + i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return avgGain === 0 ? 50 : 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    return Number(rsi.toFixed(2));
  }
}

export default CryptoSignalEngine;
