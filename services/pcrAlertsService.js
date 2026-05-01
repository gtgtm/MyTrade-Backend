/**
 * PCR Alerts Service - Generates alerts and signals based on Put-Call Ratio
 * Monitors PCR movements and provides actionable trading signals
 */

class PCRAlertsService {
  constructor() {
    this.alertThresholds = {
      extremeBearish: 1.5,
      strongBearish: 1.2,
      mildBearish: 1.05,
      neutral: 0.95,
      mildBullish: 0.8,
      strongBullish: 0.65
    };

    this.changeThresholds = {
      extremeMove: 20, // 20% change
      significantMove: 10, // 10% change
      normalMove: 5 // 5% change
    };
  }

  /**
   * Analyze PCR and generate alerts
   *
   * @param {number} currentPCR - Current Put-Call Ratio
   * @param {number} previousPCR - Previous Put-Call Ratio (from 5-15 mins ago)
   * @returns {Object} Alerts and signals
   */
  analyzePCR(currentPCR, previousPCR) {
    const alerts = [];
    const change = previousPCR > 0 ? ((currentPCR - previousPCR) / previousPCR) * 100 : 0;

    // Level-based alerts
    this.generateLevelAlerts(currentPCR, alerts);

    // Momentum alerts
    this.generateMomentumAlerts(change, currentPCR, alerts);

    // Reversal detection
    this.generateReversalAlerts(currentPCR, previousPCR, alerts);

    return {
      currentPCR: parseFloat(currentPCR.toFixed(4)),
      previousPCR: parseFloat(previousPCR.toFixed(4)),
      change: parseFloat(change.toFixed(2)),
      signal: this.getPCRSignal(currentPCR),
      confidence: this.getConfidence(currentPCR),
      alerts: alerts,
      timestamp: new Date().toISOString(),
      actionable: alerts.some(a => a.severity === 'critical' || a.severity === 'warning')
    };
  }

  /**
   * Generate alerts based on PCR levels
   *
   * @private
   * @param {number} pcr - Current PCR
   * @param {Array} alerts - Alerts array to populate
   */
  generateLevelAlerts(pcr, alerts) {
    if (pcr > this.alertThresholds.extremeBearish) {
      alerts.push({
        severity: 'critical',
        type: 'extreme_put_buying',
        message: 'Extreme put buying activity - Very bearish sentiment',
        recommendation: 'Strong selling pressure expected. Consider protective puts or sell calls.',
        confidence: Math.min((pcr - this.alertThresholds.extremeBearish) / 0.5, 1.0),
        riskLevel: 'high'
      });
    } else if (pcr > this.alertThresholds.strongBearish) {
      alerts.push({
        severity: 'warning',
        type: 'strong_put_buying',
        message: 'Strong put buying activity - Bearish bias detected',
        recommendation: 'Monitor price action. Be cautious with long positions.',
        confidence: (pcr - this.alertThresholds.strongBearish) / 0.3,
        riskLevel: 'medium'
      });
    } else if (pcr > this.alertThresholds.mildBearish) {
      alerts.push({
        severity: 'info',
        type: 'mild_bearish',
        message: 'Slight bearish tilt in options market',
        recommendation: 'Neutral stance. Monitor for reversal signals.',
        confidence: (pcr - this.alertThresholds.mildBearish) / 0.1,
        riskLevel: 'low'
      });
    }

    if (pcr < this.alertThresholds.strongBullish) {
      alerts.push({
        severity: 'critical',
        type: 'extreme_call_buying',
        message: 'Extreme call buying activity - Very bullish sentiment',
        recommendation: 'Strong buying momentum expected. Consider long positions or buy calls.',
        confidence: Math.min((this.alertThresholds.strongBullish - pcr) / 0.3, 1.0),
        riskLevel: 'high'
      });
    } else if (pcr < this.alertThresholds.mildBullish) {
      alerts.push({
        severity: 'warning',
        type: 'strong_call_buying',
        message: 'Strong call buying activity - Bullish bias detected',
        recommendation: 'Monitor momentum. Favorable for long positions.',
        confidence: (this.alertThresholds.mildBullish - pcr) / 0.15,
        riskLevel: 'medium'
      });
    } else if (pcr < this.alertThresholds.neutral) {
      alerts.push({
        severity: 'info',
        type: 'mild_bullish',
        message: 'Slight bullish tilt in options market',
        recommendation: 'Positive bias. Monitor for reversal signals.',
        confidence: (this.alertThresholds.neutral - pcr) / 0.05,
        riskLevel: 'low'
      });
    }
  }

  /**
   * Generate alerts based on PCR momentum/changes
   *
   * @private
   * @param {number} change - Percentage change in PCR
   * @param {number} currentPCR - Current PCR
   * @param {Array} alerts - Alerts array to populate
   */
  generateMomentumAlerts(change, currentPCR, alerts) {
    if (Math.abs(change) > this.changeThresholds.extremeMove) {
      alerts.push({
        severity: 'critical',
        type: 'extreme_pcr_move',
        message: `PCR moved ${change > 0 ? 'sharply higher' : 'sharply lower'} (${Math.abs(change).toFixed(1)}%)`,
        recommendation: change > 0 ?
          'Sudden shift to bearish. Risk management priority.' :
          'Sudden shift to bullish. Capitalize on momentum.',
        confidence: Math.min(Math.abs(change) / 30, 1.0),
        riskLevel: 'high'
      });
    } else if (Math.abs(change) > this.changeThresholds.significantMove) {
      alerts.push({
        severity: 'warning',
        type: 'significant_pcr_move',
        message: `PCR moved ${change > 0 ? 'higher' : 'lower'} by ${Math.abs(change).toFixed(1)}%`,
        recommendation: 'Notable sentiment shift. Confirm with price action.',
        confidence: Math.min(Math.abs(change) / 15, 1.0),
        riskLevel: 'medium'
      });
    } else if (Math.abs(change) > this.changeThresholds.normalMove) {
      alerts.push({
        severity: 'info',
        type: 'pcr_momentum',
        message: `PCR momentum: ${change > 0 ? 'increasing' : 'decreasing'} (${Math.abs(change).toFixed(1)}%)`,
        recommendation: 'Normal market activity. Trend confirmation.',
        confidence: Math.min(Math.abs(change) / 7.5, 1.0),
        riskLevel: 'low'
      });
    }
  }

  /**
   * Generate alerts for potential reversals
   *
   * @private
   * @param {number} currentPCR - Current PCR
   * @param {number} previousPCR - Previous PCR
   * @param {Array} alerts - Alerts array to populate
   */
  generateReversalAlerts(currentPCR, previousPCR, alerts) {
    // Detect reversal: was at extreme, now moving toward neutral
    if ((previousPCR > this.alertThresholds.extremeBearish && currentPCR <= this.alertThresholds.extremeBearish) ||
        (previousPCR < this.alertThresholds.strongBullish && currentPCR >= this.alertThresholds.strongBullish)) {
      alerts.push({
        severity: 'warning',
        type: 'extreme_reversal',
        message: 'PCR reversal from extreme level detected',
        recommendation: 'Potential trend reversal. Watch for confirmation.',
        confidence: 0.8,
        riskLevel: 'medium'
      });
    }

    // Cross threshold reversal
    if ((previousPCR < 1.0 && currentPCR > 1.0) || (previousPCR > 1.0 && currentPCR < 1.0)) {
      alerts.push({
        severity: 'info',
        type: 'neutral_cross',
        message: 'PCR crossed neutral (1.0) level',
        recommendation: 'Sentiment shift from bullish to bearish or vice versa.',
        confidence: 0.6,
        riskLevel: 'low'
      });
    }
  }

  /**
   * Get signal description based on PCR
   *
   * @param {number} pcr - Put-Call Ratio
   * @returns {string} Signal description
   */
  getPCRSignal(pcr) {
    if (pcr > this.alertThresholds.extremeBearish) return 'Extreme Bearish';
    if (pcr > this.alertThresholds.strongBearish) return 'Strong Bearish';
    if (pcr > this.alertThresholds.mildBearish) return 'Mild Bearish';
    if (pcr > this.alertThresholds.neutral) return 'Neutral';
    if (pcr > this.alertThresholds.mildBullish) return 'Mild Bullish';
    if (pcr > this.alertThresholds.strongBullish) return 'Strong Bullish';
    return 'Extreme Bullish';
  }

  /**
   * Calculate confidence level (0 to 1) for the PCR signal
   * Higher confidence at extremes, lower at neutral
   *
   * @param {number} pcr - Put-Call Ratio
   * @returns {number} Confidence between 0 and 1
   */
  getConfidence(pcr) {
    // Deviation from neutral (1.0)
    const deviation = Math.abs(pcr - 1.0);

    if (deviation < 0.05) {
      return 0.3; // Very uncertain near neutral
    } else if (deviation < 0.15) {
      return 0.5; // Moderate confidence
    } else if (deviation < 0.3) {
      return 0.7; // Good confidence
    } else {
      return 0.9; // High confidence at extremes
    }
  }

  /**
   * Generate trading recommendations based on PCR and price
   *
   * @param {number} pcr - Current PCR
   * @param {number} currentPrice - Current underlying price
   * @param {number} maxPain - Max pain level
   * @returns {Object} Trading recommendations
   */
  generateTradingRecommendations(pcr, currentPrice, maxPain) {
    const recommendations = {
      pcr: pcr,
      price: currentPrice,
      maxPain: maxPain,
      distance: Math.abs(currentPrice - maxPain),
      direction: currentPrice > maxPain ? 'down' : 'up',
      strategy: '',
      actions: [],
      riskReward: 'Neutral'
    };

    const signal = this.getPCRSignal(pcr);

    // Determine strategy based on PCR and max pain alignment
    if (pcr > 1.2) {
      recommendations.strategy = 'BEARISH_HEDGED';
      recommendations.actions = [
        'Consider selling calls at higher strikes',
        'Buy puts at or near max pain level',
        'Avoid new long positions'
      ];
      recommendations.riskReward = currentPrice > maxPain ? 'Favorable' : 'Caution';
    } else if (pcr > 1.05) {
      recommendations.strategy = 'MILD_BEARISH';
      recommendations.actions = [
        'Reduce long exposure',
        'Use protective puts',
        'Monitor price action'
      ];
      recommendations.riskReward = 'Neutral';
    } else if (pcr < 0.8) {
      recommendations.strategy = 'BULLISH_AGGRESSIVE';
      recommendations.actions = [
        'Consider buying calls',
        'Sell puts at support levels',
        'Add to long positions'
      ];
      recommendations.riskReward = currentPrice < maxPain ? 'Favorable' : 'Caution';
    } else if (pcr < 0.95) {
      recommendations.strategy = 'MILD_BULLISH';
      recommendations.actions = [
        'Increase long exposure',
        'Buy on dips',
        'Monitor resistance'
      ];
      recommendations.riskReward = 'Favorable';
    } else {
      recommendations.strategy = 'NEUTRAL';
      recommendations.actions = [
        'Range-bound trading expected',
        'Use options for income',
        'Monitor for breakout signals'
      ];
      recommendations.riskReward = 'Neutral';
    }

    return recommendations;
  }

  /**
   * Filter alerts for critical actions only
   *
   * @param {Object} analysisResult - Result from analyzePCR
   * @returns {Array} Critical alerts only
   */
  getCriticalAlerts(analysisResult) {
    return analysisResult.alerts.filter(a => a.severity === 'critical');
  }

  /**
   * Check if PCR requires immediate action
   *
   * @param {number} pcr - Current PCR
   * @returns {boolean} True if action required
   */
  requiresImmediateAction(pcr) {
    return pcr > this.alertThresholds.extremeBearish || pcr < this.alertThresholds.strongBullish;
  }
}

export default new PCRAlertsService();
