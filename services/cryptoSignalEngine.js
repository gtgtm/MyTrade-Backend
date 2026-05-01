class CryptoSignalEngine {
  static generate(symbol, klines, ticker) {
    if (!klines || klines.length < 50 || !ticker) {
      return this.emptySignal(symbol, ticker?.price || 0);
    }

    const closes = klines.map(k => k.close);
    const prices = klines.map(k => k.close);

    // Technical indicators
    const rsi14 = this.rsi(closes, 14);
    const ema9 = this.ema(prices, 9);
    const ema21 = this.ema(prices, 21);

    // Market data
    const currentPrice = ticker.price;
    const priceChange = ticker.priceChangePercent;

    // Volume ratio
    const totalVolume = klines.slice(-20).reduce((sum, k) => sum + k.volume, 0);
    const takerBuyVolume = klines.slice(-20).reduce((sum, k) => sum + k.takerBuyBaseVolume, 0);
    const volumeRatio = totalVolume > 0 ? takerBuyVolume / totalVolume : 0.5;

    // Score calculation (baseline 50)
    let score = 50;

    // Factor 1: RSI
    if (rsi14 < 30) score += 15;
    else if (rsi14 < 40) score += 10;
    else if (rsi14 > 70) score -= 15;
    else if (rsi14 > 60) score -= 10;

    // Factor 2: EMA alignment
    if (currentPrice > ema9 && ema9 > ema21) score += 10;
    else if (currentPrice < ema9 && ema9 < ema21) score -= 10;

    // Factor 3: Volume ratio
    if (volumeRatio > 0.6) score += 8;
    else if (volumeRatio < 0.4) score -= 8;

    // Factor 4: 24h momentum
    if (priceChange > 7) score += 8;
    else if (priceChange > 3) score += 5;
    else if (priceChange < -7) score -= 8;
    else if (priceChange < -3) score -= 5;

    score = Math.max(0, Math.min(100, score));

    // Determine signal type
    let signalType = 'NO_TRADE';
    if (score >= 60 && rsi14 < 40 && currentPrice > ema9) {
      signalType = 'BUY_CALL'; // Long signal
    } else if (score >= 60 && rsi14 > 60 && currentPrice < ema9) {
      signalType = 'BUY_PUT'; // Short signal
    }

    // Entry, stop loss, target (3% SL, 7% target for crypto volatility)
    let entryPrice, stopLoss, target;
    if (signalType === 'BUY_CALL') {
      entryPrice = currentPrice;
      stopLoss = entryPrice * 0.97; // 3% below
      target = entryPrice * 1.07; // 7% above
    } else if (signalType === 'BUY_PUT') {
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
      entryPrice: Number(entryPrice.toFixed(4)),
      stopLoss: Number(stopLoss.toFixed(4)),
      target: Number(target.toFixed(4)),
      pcr: Number(volumeRatio.toFixed(4)), // Repurposed as volume ratio
      maxPain: Number(priceChange.toFixed(2)), // Repurposed as 24h change %
      daysToExpiry: null, // N/A for crypto
      generatedAt: new Date().toISOString(),
      isMock: false,
      indicators: {
        rsi14,
        ema9,
        ema21,
        priceChange24h: priceChange,
        volumeRatio
      }
    };
  }

  static emptySignal(symbol, price) {
    return {
      symbol,
      price: price || 0,
      signalType: 'NO_TRADE',
      score: 50,
      entryPrice: price || 0,
      stopLoss: (price || 0) * 0.97,
      target: (price || 0) * 1.07,
      pcr: 0.5,
      maxPain: 0,
      daysToExpiry: null,
      generatedAt: new Date().toISOString(),
      isMock: true,
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
