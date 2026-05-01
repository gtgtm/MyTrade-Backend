# Call/Put Analysis Enhancements

## 🎯 Overview
This guide shows how to enhance the backend to provide accurate, real-time call/put analysis for NIFTY, BANKNIFTY, and SENSEX.

---

## 1️⃣ Real Option Chain Data

### Current Issue
- Using mock/simulated option chain data
- Missing real Open Interest (OI) and Implied Volatility (IV)
- No strike-by-strike detail

### Solution: Enhanced NSE Service

```javascript
// services/enhancedNSEService.js
async fetchDetailedOptionChain(symbol) {
  const chain = await this.fetchOptionChain(symbol);
  
  return {
    underlying: {
      symbol: symbol,
      price: chain.underlyingValue,
      timestamp: new Date().toISOString()
    },
    expiryDate: chain.expiryDates[0],
    greeks: {
      calls: this.calculateGreeks(chain.data, 'CE'),
      puts: this.calculateGreeks(chain.data, 'PE')
    },
    strikes: chain.data.map(row => ({
      strike: row.strikePrice,
      call: {
        bid: row.CE?.bidprice,
        ask: row.CE?.askprice,
        iv: row.CE?.impliedVolatility,
        oi: row.CE?.openInterest,
        volume: row.CE?.totalTradedVolume,
        delta: calculateDelta(row.strikePrice, chain.underlyingValue),
        theta: calculateTheta(row.strikePrice, chain.underlyingValue)
      },
      put: {
        bid: row.PE?.bidprice,
        ask: row.PE?.askprice,
        iv: row.PE?.impliedVolatility,
        oi: row.PE?.openInterest,
        volume: row.PE?.totalTradedVolume,
        delta: calculateDelta(row.strikePrice, chain.underlyingValue, true),
        theta: calculateTheta(row.strikePrice, chain.underlyingValue, true)
      }
    })),
    analysis: {
      pcr: this.calculatePCR(chain.data),
      maxPain: this.calculateMaxPain(chain.data),
      atmIV: this.calculateATMIV(chain.data),
      skew: this.analyzeVolatilitySkew(chain.data)
    }
  };
}
```

---

## 2️⃣ Accurate Greeks Calculation

### Implementation
Each option's Greeks must be calculated using:
- **Current IV** from NSE (not assumed)
- **Days to expiry** from contract details
- **Spot price** updated in real-time
- **Risk-free rate** = 10-year G-Sec rate

```javascript
// services/greeksService.js
class GreeksService {
  calculateDelta(spot, strike, timeToExpiry, iv, rate = 0.06, isPut = false) {
    const d1 = this.d1(spot, strike, timeToExpiry, iv, rate);
    const N = this.normalCDF(d1);
    return isPut ? N - 1 : N;
  }

  calculateTheta(spot, strike, timeToExpiry, iv, rate = 0.06, isPut = false) {
    const d1 = this.d1(spot, strike, timeToExpiry, iv, rate);
    const d2 = d1 - iv * Math.sqrt(timeToExpiry);
    const n = this.normalPDF(d1);
    
    if (!isPut) {
      const term1 = -(spot * n * iv) / (2 * Math.sqrt(timeToExpiry));
      const term2 = -rate * strike * Math.exp(-rate * timeToExpiry) * this.normalCDF(d2);
      return (term1 + term2) / 365;
    } else {
      const term1 = -(spot * n * iv) / (2 * Math.sqrt(timeToExpiry));
      const term2 = rate * strike * Math.exp(-rate * timeToExpiry) * this.normalCDF(-d2);
      return (term1 + term2) / 365;
    }
  }

  calculateImpliedVolatility(optionPrice, spot, strike, timeToExpiry, rate = 0.06, isPut = false) {
    // Newton-Raphson method
    let sigma = 0.2;
    for (let i = 0; i < 100; i++) {
      const price = this.blackScholesPrice(spot, strike, timeToExpiry, sigma, rate, isPut);
      const vega = spot * this.normalPDF(this.d1(spot, strike, timeToExpiry, sigma, rate)) * Math.sqrt(timeToExpiry);
      
      sigma = sigma - (price - optionPrice) / vega;
      if (Math.abs(price - optionPrice) < 0.01) break;
    }
    return sigma;
  }

  // Helper functions
  d1(spot, strike, timeToExpiry, iv, rate) {
    return (Math.log(spot / strike) + (rate + 0.5 * iv * iv) * timeToExpiry) / (iv * Math.sqrt(timeToExpiry));
  }

  normalCDF(x) {
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  normalPDF(x) {
    return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  }

  erf(x) {
    // Approximation of error function
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1 / (1 + p * absX);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return sign * y;
  }

  blackScholesPrice(spot, strike, timeToExpiry, iv, rate, isPut = false) {
    const d1 = this.d1(spot, strike, timeToExpiry, iv, rate);
    const d2 = d1 - iv * Math.sqrt(timeToExpiry);
    const df = Math.exp(-rate * timeToExpiry);

    if (!isPut) {
      return spot * this.normalCDF(d1) - strike * df * this.normalCDF(d2);
    } else {
      return strike * df * this.normalCDF(-d2) - spot * this.normalCDF(-d1);
    }
  }
}

module.exports = new GreeksService();
```

---

## 3️⃣ Max Pain Calculation

```javascript
// services/maxPainService.js
calculateMaxPain(optionChainData) {
  const strikes = optionChainData.map(row => row.strikePrice);
  const callOI = optionChainData.map(row => row.CE?.openInterest || 0);
  const putOI = optionChainData.map(row => row.PE?.openInterest || 0);

  let maxPain = strikes[0];
  let minLoss = Infinity;

  for (const testPrice of strikes) {
    let totalLoss = 0;

    for (let i = 0; i < strikes.length; i++) {
      if (testPrice > strikes[i]) {
        totalLoss += (testPrice - strikes[i]) * callOI[i];
      }
      if (testPrice < strikes[i]) {
        totalLoss += (strikes[i] - testPrice) * putOI[i];
      }
    }

    if (totalLoss < minLoss) {
      minLoss = totalLoss;
      maxPain = testPrice;
    }
  }

  return {
    maxPain: maxPain,
    maxPainLoss: minLoss,
    currentPrice: optionChainData[0].underlyingValue
  };
}
```

---

## 4️⃣ PCR Alerts & Signals

```javascript
// services/pcrAlertsService.js
analyzePCR(currentPCR, previousPCR) {
  const change = ((currentPCR - previousPCR) / previousPCR) * 100;
  
  const alerts = [];

  // Threshold alerts
  if (currentPCR > 1.5) {
    alerts.push({
      severity: 'critical',
      message: 'Extreme put buying - very bearish',
      action: 'Consider selling puts or buying calls'
    });
  } else if (currentPCR > 1.2) {
    alerts.push({
      severity: 'warning',
      message: 'High put activity - bearish bias',
      action: 'Monitor for reversal'
    });
  }

  if (currentPCR < 0.7) {
    alerts.push({
      severity: 'bullish',
      message: 'Strong call buying - bullish momentum',
      action: 'Buy calls or sell puts'
    });
  }

  // Momentum alerts
  if (Math.abs(change) > 20) {
    alerts.push({
      severity: 'info',
      message: `PCR moved ${change > 0 ? 'higher' : 'lower'} - sentiment shift`,
      action: 'Monitor for trading opportunity'
    });
  }

  return {
    currentPCR: currentPCR,
    previousPCR: previousPCR,
    change: change,
    alerts: alerts,
    signal: this.getPCRSignal(currentPCR),
    confidence: this.getConfidence(currentPCR)
  };
}

getPCRSignal(pcr) {
  if (pcr > 1.2) return 'Bearish';
  if (pcr > 1.05) return 'Neutral-Bearish';
  if (pcr < 0.8) return 'Bullish';
  if (pcr < 0.95) return 'Neutral-Bullish';
  return 'Neutral';
}

getConfidence(pcr) {
  // Confidence is higher when PCR is extreme
  const deviation = Math.abs(pcr - 1.0);
  return Math.min(1.0, deviation / 0.4);
}
```

---

## 5️⃣ API Endpoints

### Enhanced Option Chain Endpoint
```
GET /api/option-chain/:symbol
Response: {
  underlying: { symbol, price, timestamp },
  expiryDate: "2026-05-29",
  greeks: { calls: [...], puts: [...] },
  strikes: [
    {
      strike: 22300,
      call: { bid, ask, iv, oi, volume, delta, theta },
      put: { bid, ask, iv, oi, volume, delta, theta }
    },
    ...
  ],
  analysis: {
    pcr: 1.15,
    maxPain: 22400,
    atmIV: 18.5,
    skew: "moderate_put_skew"
  }
}
```

### PCR Signals Endpoint
```
GET /api/signals/:symbol/pcr-analysis
Response: {
  currentPCR: 1.15,
  previousPCR: 1.08,
  change: 6.48,
  signal: "Mild Bearish",
  confidence: 0.75,
  alerts: [...]
}
```

---

## 6️⃣ Real-Time Updates

### Enhance PriceStreamer
```javascript
// Broadcast Greeks updates along with prices
broadcastPrices() {
  const priceData = {
    prices: this.prices,
    pcr: this.pcrCache,
    greeks: this.greeksCache,  // Add this
    maxPain: this.maxPainCache, // Add this
    timestamp: new Date().toISOString(),
    activeConnections: this.activeConnections.size
  };

  this.io.emit('prices', priceData);
}
```

---

## 🚀 Implementation Priority

1. **Phase 1** (Week 1): Real NSE option chain data
2. **Phase 2** (Week 2): Accurate Greeks calculation
3. **Phase 3** (Week 3): Max Pain & PCR signals
4. **Phase 4** (Week 4): Historical tracking & alerts

---

## ✅ Validation Checklist

- [ ] NSE API returns correct strike-by-strike data
- [ ] Greeks match TradingView/other sources (±2%)
- [ ] Max Pain calculated correctly for multiple strikes
- [ ] PCR alerts triggered at thresholds
- [ ] Real-time updates < 1 second latency
- [ ] Tested on NIFTY, BANKNIFTY, SENSEX

---

## 📊 Testing with Sample Data

```bash
# Test with real NSE data
curl http://localhost:3000/api/option-chain/NIFTY

# Check PCR signals
curl http://localhost:3000/api/signals/NIFTY/pcr-analysis

# Monitor WebSocket
wscat -c ws://localhost:3000
```

---

## 🔗 References

- Black-Scholes Model: https://en.wikipedia.org/wiki/Black%E2%80%93Scholes_model
- Implied Volatility: https://www.investopedia.com/terms/i/iv.asp
- Max Pain: https://www.investopedia.com/terms/m/maxpain.asp
- NSE Option Chain API: https://www.nseindia.com/
