/**
 * Claude Opus 4.6 Analysis Service
 * Deep market analysis for trading signals using Claude's advanced reasoning
 *
 * Features:
 * - Extended thinking for complex analysis (up to 2000 tokens)
 * - Multi-factor signal evaluation
 * - Risk assessment and position sizing recommendations
 * - Market regime detection
 * - Confidence scoring
 */

import Anthropic from "@anthropic-ai/sdk";

class ClaudeAnalysisService {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    // Use Opus 4.7 for best trading analysis
    this.model = process.env.CLAUDE_MODEL || "claude-opus-4-7";
    this.cache = new Map(); // Simple in-memory cache
    this.cacheTimeMs = 5 * 60 * 1000; // 5 minute cache
  }

  /**
   * Deep analysis of trading signal with extended thinking
   * @param {Object} signalData - Technical signal from signalEngine
   * @param {Array} historicalContext - Last 30 days of data for context
   * @param {Object} options - Optional analysis parameters
   * @returns {Object} Enhanced signal with confidence and recommendations
   */
  async analyzeSignal(signalData, historicalContext = [], options = {}) {
    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(signalData);

      // Check cache first
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log(
          `📦 Claude analysis cache hit for ${signalData.symbol}`
        );
        return cached;
      }

      // Build comprehensive analysis prompt
      const prompt = this.buildAnalysisPrompt(
        signalData,
        historicalContext,
        options
      );

      console.log(`🤔 Running Opus 4.7 deep analysis for ${signalData.symbol}...`);

      // Call Claude with extended thinking enabled
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4000,
        thinking: {
          type: "enabled",
          budget_tokens: 2000, // Allow deep reasoning
        },
        temperature: 1, // Required for extended thinking
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Parse response
      const analysis = this.parseClaudeResponse(response);

      // Cache the result
      this.setCache(cacheKey, analysis);

      console.log(
        `✅ Claude analysis complete: ${analysis.recommendation} (${analysis.confidence}% confidence)`
      );

      return analysis;
    } catch (error) {
      console.error("❌ Claude analysis error:", error.message);

      // Return safe default on error
      return {
        signalQuality: signalData.score || 50,
        confidence: 30,
        riskLevel: "HIGH",
        expectedWinRate: 45,
        positionSize: 20,
        reasoning:
          "Claude analysis unavailable. Using default conservative approach.",
        riskFactors: ["api_error", "limited_data"],
        recommendation: "WAIT",
        fallback: true,
      };
    }
  }

  /**
   * Build comprehensive analysis prompt for Claude
   */
  buildAnalysisPrompt(signalData, historicalContext, options) {
    const contextSummary = this.summarizeHistory(historicalContext);

    return `You are a professional trading analyst specializing in options trading. Analyze this trading signal with deep reasoning about market structure and risk management.

CURRENT MARKET SIGNAL:
Symbol: ${signalData.symbol}
Signal Type: ${signalData.signalType}
Current Price: ${signalData.price}
Technical Score: ${signalData.score}/100
Confidence: ${signalData.confidence || "N/A"}%
Entry Price: ${signalData.entryPrice}
Stop Loss: ${signalData.stopLoss}
Target: ${signalData.target}

TECHNICAL INDICATORS:
${JSON.stringify(signalData.indicators || {}, null, 2)}

OPTIONS DATA:
PCR Ratio: ${signalData.pcr || "N/A"}
Max Pain: ${signalData.maxPain || "N/A"}
Days to Expiry: ${signalData.daysToExpiry || "N/A"}

SIGNAL BREAKDOWN:
${signalData.breakdown ? JSON.stringify(signalData.breakdown, null, 2) : "Not available"}

HISTORICAL CONTEXT (Last 30 days):
${contextSummary}

Your task: Provide a JSON response with your deep analysis.

Consider:
1. **Signal Quality**: How many indicators confirm this direction? Is confluence strong?
2. **Market Regime**: Is the market trending, ranging, or transitioning? What's the volatility regime?
3. **Risk/Reward**: What's the probability of reaching the target vs hitting the stop loss?
4. **Historical Pattern**: Have similar signals worked in the past? What was the win rate?
5. **Position Sizing**: Based on volatility and account size, what % should be risked?
6. **Market Context**: Are there any major support/resistance levels that matter?
7. **Time Decay**: For options, is theta decay helping or hurting this trade?
8. **Volatility Expansion/Contraction**: Is IV likely to expand or contract?

RESPOND WITH ONLY THIS JSON (no other text):
{
  "signalQuality": <0-100 score>,
  "confidence": <0-100 probability of signal working>,
  "riskLevel": "<LOW|MEDIUM|HIGH>",
  "expectedWinRate": <0-100 historical win rate for similar setups>,
  "positionSize": <10-100 recommended % of account>,
  "reasoning": "<Your detailed analysis explaining the confidence level>",
  "riskFactors": [<list of key risks>],
  "profitTarget": <numerical target price>,
  "stopLossLevel": <numerical stop loss price>,
  "timeframeOptimal": "<5M|15M|1H|daily>",
  "marketRegime": "<TRENDING_UP|TRENDING_DOWN|RANGING|VOLATILE|TRANSITIONING>",
  "expectedHoldTime": "<minutes or hours>",
  "keyConfluences": [<factors supporting the signal>],
  "keyDivergences": [<factors against the signal>],
  "recommendedAction": "<BUY_CALL|BUY_PUT|REDUCE_POSITION|WAIT|TAKE_PROFIT>",
  "alternativeScenario": "<What could go wrong?>",
  "edgeRating": <0-10 rating of how good this edge is>
}`;
  }

  /**
   * Parse Claude's JSON response
   */
  parseClaudeResponse(response) {
    try {
      // Find the thinking and text blocks
      let analysisText = "";

      for (const block of response.content) {
        if (block.type === "text") {
          analysisText = block.text;
        }
      }

      // Extract JSON from response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const analysis = JSON.parse(jsonMatch[0]);

      // Validate required fields
      const required = [
        "signalQuality",
        "confidence",
        "riskLevel",
        "expectedWinRate",
        "positionSize",
        "reasoning",
        "recommendation",
      ];

      for (const field of required) {
        if (!(field in analysis)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Normalize values
      return {
        ...analysis,
        signalQuality: Math.round(analysis.signalQuality),
        confidence: Math.round(analysis.confidence),
        expectedWinRate: Math.round(analysis.expectedWinRate),
        positionSize: Math.min(100, Math.max(10, Math.round(analysis.positionSize))),
        edgeRating: Math.min(10, Math.max(0, analysis.edgeRating || 0)),
        analysisTimestamp: new Date().toISOString(),
        model: this.model,
      };
    } catch (error) {
      console.error("Parse error:", error.message);
      throw error;
    }
  }

  /**
   * Summarize historical data for context
   */
  summarizeHistory(historicalContext) {
    if (!historicalContext || historicalContext.length === 0) {
      return "No historical data available";
    }

    // Aggregate statistics
    const pcrs = historicalContext
      .filter((h) => h.pcr_ratio)
      .map((h) => h.pcr_ratio);
    const prices = historicalContext
      .filter((h) => h.price)
      .map((h) => h.price);

    if (pcrs.length === 0) {
      return "Insufficient historical data";
    }

    const avgPCR = (pcrs.reduce((a, b) => a + b) / pcrs.length).toFixed(2);
    const maxPCR = Math.max(...pcrs).toFixed(2);
    const minPCR = Math.min(...pcrs).toFixed(2);

    const bullishDays = historicalContext.filter((h) =>
      h.sentiment ? h.sentiment.includes("bullish") : false
    ).length;
    const bearishDays = historicalContext.filter((h) =>
      h.sentiment ? h.sentiment.includes("bearish") : false
    ).length;

    return `
Average PCR: ${avgPCR}
PCR Range: ${minPCR} - ${maxPCR}
Bullish Days: ${bullishDays}
Bearish Days: ${bearishDays}
Trading Days: ${historicalContext.length}
Recent Trend: ${bullishDays > bearishDays ? "Slightly Bullish" : "Slightly Bearish"}
Volatility: ${this.estimateVolatility(prices)}
`;
  }

  /**
   * Estimate volatility from price data
   */
  estimateVolatility(prices) {
    if (prices.length < 2) return "Unknown";

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const mean = returns.reduce((a, b) => a + b) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < 0.01) return "Low (< 1%)";
    if (stdDev < 0.02) return "Moderate (1-2%)";
    if (stdDev < 0.03) return "High (2-3%)";
    return "Very High (> 3%)";
  }

  /**
   * Cache management
   */
  generateCacheKey(signalData) {
    return `claude_${signalData.symbol}_${signalData.signalType}_${signalData.score}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeMs) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Batch analyze multiple signals
   */
  async analyzeMultiple(signals) {
    const results = [];

    for (const signal of signals) {
      const analysis = await this.analyzeSignal(signal);
      results.push({
        symbol: signal.symbol,
        analysis,
      });

      // Rate limit to avoid API issues
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  }

  /**
   * Get market regime analysis
   */
  async getMarketRegime(symbol, historicalData) {
    const prompt = `
Analyze the current market regime for ${symbol} based on this data:

${JSON.stringify(historicalData, null, 2)}

Respond with only this JSON:
{
  "regime": "<STRONG_UPTREND|UPTREND|RANGING_UP|RANGING|RANGING_DOWN|DOWNTREND|STRONG_DOWNTREND>",
  "volatilityLevel": "<LOW|NORMAL|HIGH|EXTREME>",
  "trend": <0-100 strength of trend>,
  "support": <nearest support level>,
  "resistance": <nearest resistance level>,
  "recommendation": "<favor bullish|favor bearish|remain neutral>"
}`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });

      const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error("Regime analysis error:", error.message);
    }

    return {
      regime: "UNKNOWN",
      volatilityLevel: "NORMAL",
      trend: 50,
      recommendation: "remain neutral",
    };
  }
}

export default new ClaudeAnalysisService();
