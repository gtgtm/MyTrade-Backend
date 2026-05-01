/**
 * Max Pain Service - Calculates the strike price where most options expire worthless
 * Max Pain is the strike price at expiration where the largest amount of options expire worthless
 * This represents the price that causes maximum loss for either call or put holders
 */

class MaxPainService {
  /**
   * Calculate Max Pain for an option chain
   * Iterates through all strikes to find the one with minimum total loss
   *
   * @param {Array} optionChainData - Option chain data with strikes, call OI, and put OI
   * @returns {Object} Max pain level, loss at that level, and current price
   */
  calculateMaxPain(optionChainData) {
    if (!optionChainData || optionChainData.length === 0) {
      return {
        maxPain: null,
        maxPainLoss: null,
        currentPrice: null,
        distance: null,
        direction: null
      };
    }

    // Extract strikes and open interest data
    const strikes = optionChainData.map(row => row.strikePrice);
    const callOI = optionChainData.map(row => row.CE?.openInterest || 0);
    const putOI = optionChainData.map(row => row.PE?.openInterest || 0);
    const currentPrice = optionChainData[0]?.underlyingValue;

    let maxPain = strikes[0];
    let minLoss = Infinity;

    // Test each strike as potential settlement price
    for (const testPrice of strikes) {
      let totalLoss = 0;

      // Calculate loss for all options at this test price
      for (let i = 0; i < strikes.length; i++) {
        // Call loss: if price goes above strike, call holders lose
        if (testPrice > strikes[i]) {
          totalLoss += (testPrice - strikes[i]) * callOI[i];
        }

        // Put loss: if price goes below strike, put holders lose
        if (testPrice < strikes[i]) {
          totalLoss += (strikes[i] - testPrice) * putOI[i];
        }
      }

      // Track the strike with minimum total loss
      if (totalLoss < minLoss) {
        minLoss = totalLoss;
        maxPain = testPrice;
      }
    }

    // Calculate distance and direction from current price
    const distance = Math.abs(currentPrice - maxPain);
    const direction = currentPrice > maxPain ? 'down' : currentPrice < maxPain ? 'up' : 'atMaxPain';

    return {
      maxPain: maxPain,
      maxPainLoss: minLoss,
      currentPrice: currentPrice,
      distance: distance,
      direction: direction,
      percentageMove: ((distance / currentPrice) * 100).toFixed(2)
    };
  }

  /**
   * Calculate Max Pain for multiple indices
   *
   * @param {Object} optionChains - Mapping of symbol to option chain data
   * @returns {Object} Max pain data for each symbol
   */
  calculateMaxPainMultiple(optionChains) {
    const results = {};

    for (const [symbol, chainData] of Object.entries(optionChains)) {
      results[symbol] = this.calculateMaxPain(chainData);
    }

    return results;
  }

  /**
   * Analyze Max Pain zones and resistance/support levels
   * Identifies clusters of potential settlement prices
   *
   * @param {Array} optionChainData - Option chain data
   * @returns {Object} Analysis of max pain zones
   */
  analyzeMaxPainZones(optionChainData) {
    if (!optionChainData || optionChainData.length < 3) {
      return { zones: [], primaryZone: null };
    }

    const { maxPain } = this.calculateMaxPain(optionChainData);
    const strikes = optionChainData.map(row => row.strikePrice);

    // Find strikes within 2% of max pain as potential zone
    const tolerance = (Math.max(...strikes) - Math.min(...strikes)) * 0.02;
    const zones = strikes.filter(s => Math.abs(s - maxPain) <= tolerance);

    return {
      zones: zones.sort((a, b) => a - b),
      primaryZone: maxPain,
      tolerance: tolerance,
      supportLevels: this.identifyLevels(optionChainData, 'support'),
      resistanceLevels: this.identifyLevels(optionChainData, 'resistance')
    };
  }

  /**
   * Identify support/resistance levels based on open interest concentration
   *
   * @private
   * @param {Array} optionChainData - Option chain data
   * @param {string} type - 'support' or 'resistance'
   * @returns {Array} Strike prices with high OI
   */
  identifyLevels(optionChainData, type) {
    const oiThreshold = this.calculateOIThreshold(optionChainData);

    if (type === 'support') {
      return optionChainData
        .filter(row => (row.PE?.openInterest || 0) > oiThreshold)
        .map(row => row.strikePrice)
        .sort((a, b) => b - a);
    } else {
      return optionChainData
        .filter(row => (row.CE?.openInterest || 0) > oiThreshold)
        .map(row => row.strikePrice)
        .sort((a, b) => a - b);
    }
  }

  /**
   * Calculate OI threshold for identifying significant levels
   *
   * @private
   * @param {Array} optionChainData - Option chain data
   * @returns {number} OI threshold
   */
  calculateOIThreshold(optionChainData) {
    const allOI = optionChainData
      .flatMap(row => [
        row.CE?.openInterest || 0,
        row.PE?.openInterest || 0
      ])
      .filter(oi => oi > 0);

    if (allOI.length === 0) return 0;

    const average = allOI.reduce((a, b) => a + b, 0) / allOI.length;
    return average * 0.75; // 75% of average OI
  }

  /**
   * Calculate Put-Call Ratio (PCR) for sentiment analysis
   *
   * @param {Array} optionChainData - Option chain data
   * @returns {Object} PCR metrics
   */
  calculatePCR(optionChainData) {
    const totalCallOI = optionChainData.reduce((sum, row) => sum + (row.CE?.openInterest || 0), 0);
    const totalPutOI = optionChainData.reduce((sum, row) => sum + (row.PE?.openInterest || 0), 0);

    const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

    return {
      pcr: parseFloat(pcr.toFixed(4)),
      totalCallOI: totalCallOI,
      totalPutOI: totalPutOI,
      sentiment: this.interpretPCR(pcr)
    };
  }

  /**
   * Interpret PCR value for market sentiment
   *
   * @private
   * @param {number} pcr - Put-Call Ratio
   * @returns {Object} Sentiment interpretation with confidence
   */
  interpretPCR(pcr) {
    let signal, confidence;

    if (pcr > 1.5) {
      signal = 'Extreme Bearish';
      confidence = Math.min((pcr - 1.5) / 0.5, 1.0);
    } else if (pcr > 1.2) {
      signal = 'Strong Bearish';
      confidence = (pcr - 1.2) / 0.3;
    } else if (pcr > 1.05) {
      signal = 'Mild Bearish';
      confidence = (pcr - 1.05) / 0.15;
    } else if (pcr > 0.95) {
      signal = 'Neutral';
      confidence = 0.5;
    } else if (pcr > 0.8) {
      signal = 'Mild Bullish';
      confidence = (0.95 - pcr) / 0.15;
    } else if (pcr > 0.65) {
      signal = 'Strong Bullish';
      confidence = (0.8 - pcr) / 0.15;
    } else {
      signal = 'Extreme Bullish';
      confidence = Math.min((0.65 - pcr) / 0.3, 1.0);
    }

    return {
      signal: signal,
      confidence: parseFloat(confidence.toFixed(2)),
      pcr: parseFloat(pcr.toFixed(4))
    };
  }
}

export default new MaxPainService();
