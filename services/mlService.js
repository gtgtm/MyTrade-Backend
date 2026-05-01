/**
 * ML Service
 * Machine learning models for pattern detection, prediction, and anomaly detection
 * Uses pure statistical methods - no external ML libraries
 */

import historicalDataService from './historicalDataService.js';

class MLService {
  /**
   * Detect patterns in PCR history (rising/falling streaks, convergence)
   */
  async detectPatterns(symbol, days = 30) {
    try {
      const pcr = await historicalDataService.getPCRHistory(symbol, days);
      const maxPain = await historicalDataService.getMaxPainHistory(symbol, days);

      if (pcr.length < 3 || maxPain.length < 3) {
        return { patterns: [] };
      }

      const patterns = [];

      const pcrValues = pcr.map(p => p.pcr_ratio);
      const mpValues = maxPain.map(m => m.max_pain_level);
      const mpPrices = maxPain.map(m => m.current_price);

      let consecutiveUp = 0, consecutiveDown = 0;
      for (let i = 1; i < pcrValues.length; i++) {
        if (pcrValues[i] > pcrValues[i - 1]) {
          consecutiveUp++;
          consecutiveDown = 0;
          if (consecutiveUp >= 3) {
            patterns.push({
              name: 'PCR Rising Streak',
              strength: Math.min(consecutiveUp, 10),
              signal: 'bullish',
              confidence: (50 + consecutiveUp * 5).toFixed(0)
            });
          }
        } else if (pcrValues[i] < pcrValues[i - 1]) {
          consecutiveDown++;
          consecutiveUp = 0;
          if (consecutiveDown >= 3) {
            patterns.push({
              name: 'PCR Falling Streak',
              strength: Math.min(consecutiveDown, 10),
              signal: 'bearish',
              confidence: (50 + consecutiveDown * 5).toFixed(0)
            });
          }
        }
      }

      const mpMovements = [];
      for (let i = 1; i < mpValues.length; i++) {
        mpMovements.push(Math.abs(mpValues[i] - mpValues[i - 1]));
      }
      const avgMPMovement = mpMovements.reduce((a, b) => a + b) / mpMovements.length;
      const largeMovements = mpMovements.filter(m => m > avgMPMovement * 1.5).length;

      if (largeMovements >= 3) {
        patterns.push({
          name: 'Max Pain Volatility',
          strength: largeMovements,
          signal: 'caution',
          confidence: (60 + largeMovements * 3).toFixed(0)
        });
      }

      const lastMP = mpValues[mpValues.length - 1];
      const lastPrice = mpPrices[mpPrices.length - 1];
      const distance = Math.abs(lastMP - lastPrice) / lastPrice * 100;

      if (distance < 0.5) {
        patterns.push({
          name: 'Max Pain Convergence',
          strength: 10,
          signal: 'critical',
          confidence: (80 + (0.5 - distance) * 100).toFixed(0)
        });
      }

      return {
        symbol,
        dataPoints: pcr.length,
        patterns: patterns.slice(0, 5)
      };
    } catch (error) {
      console.error(`Error detecting patterns for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Linear regression to predict next value
   */
  linearRegression(xValues, yValues) {
    const n = Math.min(xValues.length, yValues.length);
    if (n < 2) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += xValues[i];
      sumY += yValues[i];
      sumXY += xValues[i] * yValues[i];
      sumX2 += xValues[i] * xValues[i];
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  /**
   * Predict next PCR value based on linear regression
   */
  async predictNextValue(symbol, days = 30) {
    try {
      const pcr = await historicalDataService.getPCRHistory(symbol, days);

      if (pcr.length < 5) {
        return {
          symbol,
          prediction: null,
          confidence: 0,
          message: 'Insufficient data for prediction'
        };
      }

      const values = pcr.map(p => p.pcr_ratio);
      const xValues = Array.from({ length: values.length }, (_, i) => i + 1);

      const regression = this.linearRegression(xValues, values);

      if (!regression) {
        return {
          symbol,
          prediction: null,
          confidence: 0,
          message: 'Could not fit regression model'
        };
      }

      const nextX = xValues.length + 1;
      const prediction = regression.intercept + regression.slope * nextX;

      const lastValue = values[values.length - 1];
      const percentChange = ((prediction - lastValue) / lastValue * 100).toFixed(2);

      const residuals = values.map((v, i) => v - (regression.intercept + regression.slope * (i + 1)));
      const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length);
      const confidence = Math.max(0, 100 - rmse * 10).toFixed(0);

      return {
        symbol,
        currentValue: lastValue.toFixed(4),
        predictedValue: prediction.toFixed(4),
        percentChange: parseFloat(percentChange),
        direction: prediction > lastValue ? 'up' : 'down',
        confidence: parseFloat(confidence),
        rmse: rmse.toFixed(4)
      };
    } catch (error) {
      console.error(`Error predicting next value for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Detect anomalies using z-score method
   */
  async detectAnomalies(symbol = null, days = 7, threshold = 2.5) {
    try {
      const symbols = symbol ? [symbol] : ['NIFTY', 'BANKNIFTY', 'SENSEX'];
      const anomalies = [];

      for (const sym of symbols) {
        const pcr = await historicalDataService.getPCRHistory(sym, days);

        if (pcr.length < 5) continue;

        const values = pcr.map(p => p.pcr_ratio);
        const mean = values.reduce((a, b) => a + b) / values.length;
        const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
        const stdDev = Math.sqrt(variance);

        pcr.forEach((record, index) => {
          const zScore = stdDev === 0 ? 0 : (record.pcr_ratio - mean) / stdDev;

          if (Math.abs(zScore) > threshold) {
            anomalies.push({
              symbol: sym,
              dataType: 'pcr',
              value: record.pcr_ratio.toFixed(4),
              zScore: zScore.toFixed(2),
              threshold: threshold.toFixed(2),
              flaggedAt: record.recorded_at,
              severity: Math.abs(zScore) > 3.5 ? 'critical' : 'warning'
            });
          }
        });
      }

      return {
        anomalyCount: anomalies.length,
        threshold,
        anomalies: anomalies.slice(0, 20)
      };
    } catch (error) {
      console.error('Error detecting anomalies:', error);
      throw error;
    }
  }

  /**
   * Calculate historical signal accuracy
   */
  async getSignalAccuracy(symbol, days = 30) {
    try {
      const pcr = await historicalDataService.getPCRHistory(symbol, days);

      if (pcr.length < 2) {
        return {
          symbol,
          accuracy: null,
          dataPoints: 0,
          message: 'Insufficient data'
        };
      }

      let correctPredictions = 0;
      let totalPredictions = 0;

      for (let i = 0; i < pcr.length - 1; i++) {
        const current = pcr[i].pcr_ratio;
        const next = pcr[i + 1].pcr_ratio;

        const bearishSignal = current > 1.2;
        const bullishSignal = current < 0.8;

        if (bearishSignal) {
          if (next < current) correctPredictions++;
          totalPredictions++;
        } else if (bullishSignal) {
          if (next > current) correctPredictions++;
          totalPredictions++;
        }
      }

      const accuracy = totalPredictions > 0 ? (correctPredictions / totalPredictions * 100).toFixed(2) : 0;

      return {
        symbol,
        accuracy: parseFloat(accuracy),
        correctPredictions,
        totalPredictions,
        dataPoints: pcr.length
      };
    } catch (error) {
      console.error(`Error calculating signal accuracy for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get trend reversal probability
   */
  async getTrendReversal(symbol, days = 20) {
    try {
      const pcr = await historicalDataService.getPCRHistory(symbol, days);

      if (pcr.length < 10) {
        return { symbol, probability: 0, message: 'Insufficient data' };
      }

      const values = pcr.map(p => p.pcr_ratio);

      let upTrendDays = 0, downTrendDays = 0;
      for (let i = 1; i < values.length; i++) {
        if (values[i] > values[i - 1]) upTrendDays++;
        else downTrendDays++;
      }

      const currentTrend = values[values.length - 1] > values[values.length - 2] ? 'up' : 'down';
      const trendLength = currentTrend === 'up' ? upTrendDays : downTrendDays;
      const oppositeTrendLength = currentTrend === 'up' ? downTrendDays : upTrendDays;

      let reversalProbability = 20;
      if (trendLength >= 5) reversalProbability += 30;
      if (trendLength >= 8) reversalProbability += 20;
      if (oppositeTrendLength >= 3) reversalProbability += 15;

      const extreme = currentTrend === 'up'
        ? values[values.length - 1] > 1.5
        : values[values.length - 1] < 0.7;
      if (extreme) reversalProbability = Math.min(reversalProbability + 15, 95);

      return {
        symbol,
        currentTrend,
        trendLength,
        reversalProbability: Math.min(reversalProbability, 95),
        recommendation: reversalProbability > 60 ? 'expect_reversal' : 'trend_continues'
      };
    } catch (error) {
      console.error(`Error calculating trend reversal for ${symbol}:`, error);
      throw error;
    }
  }
}

export default new MLService();
