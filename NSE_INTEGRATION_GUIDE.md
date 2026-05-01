# NSE API Integration & Real Data Testing Guide

## Overview

The backend now fetches **real option chain data from NSE India** and processes it through the enhanced Greeks/Max Pain/PCR analysis pipeline.

---

## 🔗 Environment Setup

### Required Environment Variables

Create/update `.env` file with:

```bash
# NSE API Configuration
NSE_API_BASE=https://www.nseindia.com
NSE_API_TIMEOUT=15000

# Optional: Logging
LOG_LEVEL=info
```

### .env.example Reference

```bash
# Server
PORT=3000
NODE_ENV=development

# NSE API
NSE_API_BASE=https://www.nseindia.com
NSE_API_TIMEOUT=15000  # milliseconds

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

---

## 📊 Data Flow

### 1. **Fetch from NSE**
```
NSEService.fetchOptionChain('NIFTY')
  ↓
(Handles session cookies automatically)
  ↓
Parses NSE response into strike-by-strike format
  ↓
Returns: [{strikePrice, CE: {...}, PE: {...}}, ...]
```

### 2. **Enhance with Analytics**
```
OptionChainEnhancedService.enhanceOptionChain(rawData)
  ↓
- GreeksService: Calculates Delta, Gamma, Theta, Vega for each strike
  ↓
- MaxPainService: Identifies level where most options expire worthless
  ↓
- PCRAlerts: Generates alerts based on Put-Call Ratio
  ↓
Returns: Complete analysis with Greeks, Max Pain, PCR, volatility skew
```

### 3. **Deliver via API**
```
REST Endpoint (e.g., /api/option-chain/NIFTY)
  ↓
Returns JSON with:
  - Underlying price & expiry info
  - Strike-by-strike Greeks (Delta, Gamma, Theta, Vega)
  - Max Pain level & distance
  - PCR sentiment & confidence
  - Alerts & trading recommendations
```

---

## 🧪 Testing with Real NSE Data

### **Test 1: Simple Fetch Test**
```bash
curl "http://192.168.1.21:3000/api/option-chain/NIFTY"
```

**Expected Output:**
```json
{
  "success": true,
  "data": {
    "underlying": {
      "symbol": "NIFTY",
      "price": 22350,
      "timestamp": "2026-04-30T10:30:00.000Z"
    },
    "expiryInfo": {
      "expiryDate": "07-May-2026",
      "daysToExpiry": 7,
      "timeToExpiry": 0.0192
    },
    "strikes": [
      {
        "strike": 22000,
        "isATM": false,
        "call": {
          "bid": 420.50,
          "ask": 421.25,
          "iv": 18.5,
          "oi": 2500000
        },
        "put": {
          "bid": 65.00,
          "ask": 65.75,
          "iv": 17.8,
          "oi": 1500000
        },
        "callGreeks": {
          "delta": 0.85,
          "gamma": 0.0045,
          "theta": -0.12,
          "vega": 0.25
        },
        "putGreeks": {
          "delta": -0.15,
          "gamma": 0.0045,
          "theta": -0.08,
          "vega": 0.25
        }
      }
      // ... more strikes
    ],
    "analysis": {
      "pcr": {
        "ratio": 1.15,
        "sentiment": "Mild Bearish",
        "confidence": 0.75
      },
      "maxPain": {
        "level": 22400,
        "distance": 50,
        "direction": "up"
      },
      "volatility": {
        "atmIV": 18.2,
        "skew": "put_skew"
      }
    }
  }
}
```

---

### **Test 2: Test All 3 Indices**
```bash
# Individual tests
curl "http://192.168.1.21:3000/api/option-chain/NIFTY"
curl "http://192.168.1.21:3000/api/option-chain/BANKNIFTY"
curl "http://192.168.1.21:3000/api/option-chain/SENSEX"

# Batch test
curl "http://192.168.1.21:3000/api/option-chain/multi/NIFTY,BANKNIFTY,SENSEX"
```

---

### **Test 3: Greeks Validation**

Compare with TradingView (or similar):

```bash
# Get strike-specific Greeks
curl "http://192.168.1.21:3000/api/option-chain/NIFTY/strikes?format=compact"
```

**For each strike, validate:**
- ✅ Delta: Call Delta + Put Delta ≈ 1.0
- ✅ Gamma: Call Gamma = Put Gamma
- ✅ Theta: Should decay as expiry approaches
- ✅ Vega: Should be highest for ATM strikes
- ✅ Tolerance: ±2% vs external source

---

### **Test 4: Max Pain Verification**

```bash
curl "http://192.168.1.21:3000/api/option-chain/NIFTY/max-pain"
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "symbol": "NIFTY",
    "currentPrice": 22350,
    "maxPain": {
      "level": 22400,
      "distance": 50,
      "direction": "up",
      "percentageMove": "0.22"
    },
    "zones": {
      "zones": [22350, 22400, 22450],
      "primaryZone": 22400
    }
  }
}
```

**To Validate:**
- If max pain is > current price, market likely to go down
- If max pain is < current price, market likely to go up
- Zone width depends on strike spacing

---

### **Test 5: PCR Analysis with Signals**

```bash
curl "http://192.168.1.21:3000/api/signals/NIFTY/pcr-analysis"
```

**Check Alerts:**
```json
{
  "pcrAnalysis": {
    "pcr": 1.15,
    "signal": "Mild Bearish",
    "confidence": 0.75
  },
  "alerts": [
    {
      "severity": "warning",
      "message": "Mild bearish sentiment in options market",
      "recommendation": "Monitor for reversal"
    }
  ],
  "tradingSignals": {
    "pcr": {
      "strategy": "MILD_BEARISH",
      "actions": ["Reduce long exposure", "Use protective puts"]
    }
  }
}
```

---

## 🔍 Debugging Common Issues

### **Issue: "No option chain data found"**

**Cause**: NSE API not responding or NSE is closed

**Solution**:
```bash
# Check if NSE is accessible
curl -I https://www.nseindia.com/

# Check server logs
tail -f logs/app.log

# Verify during market hours (9:15 AM - 3:30 PM IST)
```

---

### **Issue: IV data missing (0 values)**

**Cause**: NSE sometimes doesn't return IV for all strikes

**Solution**:
```bash
# Check data quality in response metadata
{
  "metadata": {
    "dataQuality": {
      "ivCoverage": "85%"  // Good if > 80%
    }
  }
}

# If low, try again after market opens more fully
```

---

### **Issue: Greeks values seem off**

**Cause**: IV data quality or incorrect time-to-expiry calculation

**Debug Steps**:
1. Check IV values in strikes data
2. Verify expiryDate format: should be "DD-Mon-YYYY" (e.g., "07-May-2026")
3. Compare daysToExpiry calculation
4. Validate against TradingView

---

### **Issue: API times out (>1 second)**

**Cause**: NSE API slow or network latency

**Solution**:
```bash
# Increase timeout in .env
NSE_API_TIMEOUT=20000  # 20 seconds

# Check NSE status
curl -w "Total time: %{time_total}s\n" https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY
```

---

## 📈 Sample Data Validation

### Greeks Relationships to Verify

**Call Option:**
```
Delta: 0 to 1 (higher for ITM)
Gamma: Highest at ATM
Theta: Negative (decays over time)
Vega: Positive (benefits from IV rise)
```

**Put Option:**
```
Delta: -1 to 0 (lower for ITM)
Gamma: Highest at ATM (same as call)
Theta: Usually negative
Vega: Positive (same as call)
```

### Example Validation Query
```bash
# Get ATM strikes with Greeks
curl "http://192.168.1.21:3000/api/option-chain/NIFTY/strikes?format=detailed" | \
  jq '.data.strikes[] | select(.isATM == true) | {
    strike: .strike,
    callDelta: .callGreeks.delta,
    putDelta: .putGreeks.delta,
    callGamma: .callGreeks.gamma,
    putGamma: .putGreeks.gamma
  }'
```

Expected:
- `callDelta + putDelta ≈ 1.0` (for ATM, close to 0.5 + -0.5)
- `callGamma ≈ putGamma`

---

## 🚀 Production Deployment Checklist

- [ ] NSE API connectivity confirmed (test during market hours)
- [ ] Environment variables configured in .env
- [ ] Tested all 3 indices (NIFTY, BANKNIFTY, SENSEX)
- [ ] Greeks validated against external source (±2% tolerance)
- [ ] Max Pain calculation verified
- [ ] PCR alerts trigger correctly
- [ ] Response times acceptable (<1s per symbol)
- [ ] Error handling working (invalid symbols, NSE downtime)
- [ ] Logging configured and working
- [ ] iOS app can consume endpoints
- [ ] WebSocket ready for real-time streaming

---

## 📋 Next Steps

1. **Immediate**: Test with real NSE data during market hours
2. **Week 1**: Validate Greeks accuracy against TradingView
3. **Week 2**: WebSocket integration for real-time updates
4. **Week 3**: Database setup for historical tracking
5. **Week 4**: Production deployment

---

## 🔗 NSE API Reference

**Endpoint**: `/api/option-chain-indices?symbol=NIFTY`

**Response Fields**:
- `records.underlyingValue` - Current price
- `records.expiryDates` - Available expiry dates
- `records.data[]` - Strike-by-strike data
  - `strikePrice`
  - `CE` (Call)
    - `bidprice`, `askprice`, `lastPrice`
    - `impliedVolatility`
    - `openInterest`, `totalTradedVolume`
  - `PE` (Put) - Same fields as CE

---

**Status**: ✅ Ready for Real Data Testing
**Last Updated**: 2026-04-30
