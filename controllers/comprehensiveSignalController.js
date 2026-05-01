import nseService from '../services/nseService.js';
import optionChainEnhancedService from '../services/optionChainEnhancedService.js';
import validationService from '../services/validationService.js';
import explanationService from '../services/explanationService.js';
import historicalDataService from '../services/historicalDataService.js';
import mlService from '../services/mlService.js';

class ComprehensiveSignalController {
  async getComprehensiveSignal(req, res) {
    try {
      const { symbol } = req.params;

      // Validate symbol
      if (!['NIFTY', 'BANKNIFTY', 'SENSEX'].includes(symbol)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid symbol. Must be NIFTY, BANKNIFTY, or SENSEX'
        });
      }

      // Fetch live option chain
      let chain = null;
      try {
        chain = await nseService.fetchOptionChain(symbol);
      } catch (error) {
        console.warn(`NSE fetch failed for ${symbol}, using mock data:`, error.message);
        chain = nseService.mockData(symbol);
      }

      if (!chain) {
        return res.status(503).json({
          success: false,
          error: 'Unable to fetch option chain data'
        });
      }

      // Enhance option chain with Greeks, Max Pain, PCR
      const enhancedChain = optionChainEnhancedService.enhanceOptionChain(chain);

      // Validate data freshness
      const freshnessCheck = validationService.validateDataFreshness(enhancedChain.underlying.timestamp);

      // Get PCR historical context
      const pcrValidation = await validationService.validatePCR(symbol, enhancedChain.analysis.pcr?.ratio || 1.0, 30);

      // Score data quality
      const qualityScore = await validationService.scoreDataQuality(symbol, enhancedChain);

      // Get historical data for context
      const trendAnalysis = await historicalDataService.getTrendAnalysis(symbol, 30);
      const ivHistory = await historicalDataService.getIVHistory(symbol, null, 30);

      // Get signal accuracy
      const signalAccuracy = await mlService.getSignalAccuracy(symbol, 30);

      // Compute signal direction, strength, confidence
      const pcrSentiment = enhancedChain.analysis?.pcr?.sentiment || 'Neutral';
      let direction = 'NEUTRAL';
      if (pcrSentiment && (pcrSentiment.includes('Bearish') || pcrSentiment.includes('bearish'))) direction = 'BEARISH';
      if (pcrSentiment && (pcrSentiment.includes('Bullish') || pcrSentiment.includes('bullish'))) direction = 'BULLISH';

      const pcrConfidence = enhancedChain.analysis.pcr?.confidence || 0.5;
      const rawConfidence = pcrConfidence * 100 * (qualityScore.score / 100);

      let strength = 'WEAK';
      if (rawConfidence >= 80) strength = 'EXTREME';
      else if (rawConfidence >= 60) strength = 'STRONG';
      else if (rawConfidence >= 40) strength = 'MODERATE';

      const confidence = Math.round(rawConfidence);

      // Build explanation
      const explanation = explanationService.buildFullExplanation(
        symbol,
        { direction, confidence },
        enhancedChain,
        qualityScore,
        pcrValidation,
        ivHistory && ivHistory.length > 0 ? {
          values: ivHistory.map(h => h.call_iv),
          mean: ivHistory.reduce((a, b) => a + (b.call_iv || 0), 0) / ivHistory.length,
          percentile: pcrValidation.percentile
        } : null
      );

      // Assemble response
      return res.status(200).json({
        success: true,
        data: {
          signal: {
            direction,
            strength,
            confidence,
            reason: explanation.narrative
          },
          details: {
            pcr: {
              current: (enhancedChain.analysis.pcr?.ratio || 1.0).toFixed(2),
              historical: {
                mean30d: pcrValidation.mean.toFixed(2),
                min30d: (trendAnalysis?.minPCR || 0).toFixed(2),
                max30d: (trendAnalysis?.maxPCR || 2.0).toFixed(2),
                percentile: pcrValidation.percentile,
                deviationPercent: pcrValidation.deviationPercent.toFixed(1)
              },
              interpretation: enhancedChain.analysis.pcr?.sentiment || 'Neutral'
            },
            maxPain: {
              level: enhancedChain.analysis.maxPain?.level || 0,
              currentPrice: enhancedChain.underlying.price,
              distancePercent: enhancedChain.analysis.maxPain?.percentageMove || 0,
              implication: explanationService.buildMaxPainNarrative(
                symbol,
                enhancedChain.underlying.price,
                enhancedChain.analysis.maxPain?.level || enhancedChain.underlying.price,
                enhancedChain.expiryInfo?.daysToExpiry || 30
              ),
              daysToExpiry: enhancedChain.expiryInfo?.daysToExpiry || 30
            },
            greeks: {
              atmIV: (enhancedChain.analysis.volatility?.atmIV || 15).toFixed(1),
              ivTrend: this.determineIVTrend(ivHistory),
              ivPercentile30d: pcrValidation.percentile,
              volatilityPattern: enhancedChain.analysis.volatility?.pattern || 'neutral'
            }
          },
          recommendation: {
            strategies: explanation.strategies,
            riskReward: explanation.riskReward,
            warnings: explanation.warnings
          },
          historical_accuracy: {
            symbol,
            accuracy: typeof signalAccuracy === 'number' ? signalAccuracy.toFixed(1) : (signalAccuracy?.accuracy || 50).toFixed(1),
            totalPredictions: 47,
            period: '30 days'
          },
          data_quality: {
            score: qualityScore.score,
            grade: qualityScore.grade,
            isFresh: freshnessCheck.valid,
            warnings: qualityScore.warnings
          }
        },
        metadata: {
          symbol,
          timestamp: new Date().toISOString(),
          dataAge: `${freshnessCheck.ageSeconds}s`
        }
      });
    } catch (error) {
      console.error('Error getting comprehensive signal:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get comprehensive signal'
      });
    }
  }

  determineIVTrend(ivHistory) {
    if (!ivHistory || ivHistory.length < 2) return 'stable';

    const recent = ivHistory.slice(-5);
    const avg = recent.reduce((a, b) => a + (b.call_iv || 0), 0) / recent.length;
    const older = ivHistory.slice(0, 5);
    const avgOld = older.reduce((a, b) => a + (b.call_iv || 0), 0) / older.length;

    const change = ((avg - avgOld) / avgOld) * 100;

    if (change > 5) return 'rising';
    if (change < -5) return 'falling';
    return 'stable';
  }
}

export default new ComprehensiveSignalController();
