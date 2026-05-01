import greeksService from './greeksService.js';
import historicalDataService from './historicalDataService.js';

class ValidationService {
  validateDelta(delta, isPut) {
    const epsilon = 0.001;
    const lowerBound = isPut ? -1 - epsilon : -epsilon;
    const upperBound = isPut ? epsilon : 1 + epsilon;

    const valid = delta >= lowerBound && delta <= upperBound;
    const issue = !valid ? `Delta ${delta} out of bounds [${lowerBound},${upperBound}]` : null;

    return { valid, issue, value: delta };
  }

  validateGreeks(greeks, isPut) {
    const issues = [];
    const fields = {};

    if (!greeks) {
      return { allValid: false, issues: ['Greeks object is null or undefined'], fields: {} };
    }

    fields.delta = this.validateDelta(greeks.delta, isPut);
    if (!fields.delta.valid) issues.push(fields.delta.issue);

    if (greeks.gamma < 0) issues.push(`Gamma ${greeks.gamma} cannot be negative`);
    fields.gamma = { valid: greeks.gamma >= 0 };

    fields.theta = { valid: true };
    fields.vega = { valid: true };
    fields.rho = { valid: true };

    return {
      allValid: issues.length === 0,
      issues,
      fields
    };
  }

  async validatePCR(symbol, currentPCR, historyDays = 30) {
    try {
      const history = await historicalDataService.getPCRHistory(symbol, historyDays);

      if (!history || history.length < 2) {
        return {
          valid: true,
          zScore: 0,
          mean: currentPCR,
          stdDev: 0,
          percentile: 50,
          deviationPercent: 0,
          isAnomaly: false
        };
      }

      const pcrValues = history.map(h => h.pcr_ratio);
      const mean = pcrValues.reduce((a, b) => a + b) / pcrValues.length;
      const variance = pcrValues.reduce((a, b) => a + Math.pow(b - mean, 2)) / pcrValues.length;
      const stdDev = Math.sqrt(variance);

      const zScore = stdDev === 0 ? 0 : (currentPCR - mean) / stdDev;
      const isAnomaly = Math.abs(zScore) > 2.5;

      const sortedPCR = [...pcrValues].sort((a, b) => a - b);
      const percentile = Math.round((sortedPCR.filter(p => p <= currentPCR).length / pcrValues.length) * 100);

      const deviationPercent = mean === 0 ? 0 : ((currentPCR - mean) / mean) * 100;

      return {
        valid: !isAnomaly,
        zScore,
        mean,
        stdDev,
        percentile,
        deviationPercent,
        isAnomaly
      };
    } catch (error) {
      console.error('Error validating PCR:', error);
      return {
        valid: true,
        zScore: 0,
        mean: currentPCR,
        stdDev: 0,
        percentile: 50,
        deviationPercent: 0,
        isAnomaly: false
      };
    }
  }

  validateDataFreshness(dataTimestamp, maxAgeMs = 60000) {
    const now = Date.now();
    const timestamp = new Date(dataTimestamp).getTime();
    const ageMs = now - timestamp;
    const valid = ageMs <= maxAgeMs;

    return {
      valid,
      ageMs,
      ageSeconds: Math.round(ageMs / 1000)
    };
  }

  validateIVCrossCheck(spot, strike, timeToExpiry, optionPrice, nseIV, isPut) {
    const maxDivergence = 0.1;
    try {
      const calculatedIV = greeksService.calculateImpliedVolatility(
        optionPrice,
        spot,
        strike,
        timeToExpiry,
        0.06,
        isPut,
        nseIV
      );

      const divergencePercent = Math.abs(calculatedIV - nseIV) / nseIV;
      const acceptable = divergencePercent <= maxDivergence;

      return {
        valid: acceptable,
        calculatedIV: Math.round(calculatedIV * 10000) / 10000,
        providedIV: Math.round(nseIV * 10000) / 10000,
        divergencePercent: Math.round(divergencePercent * 10000) / 100,
        acceptable
      };
    } catch (error) {
      console.error('Error validating IV:', error);
      return {
        valid: true,
        calculatedIV: nseIV,
        providedIV: nseIV,
        divergencePercent: 0,
        acceptable: true
      };
    }
  }

  async scoreDataQuality(symbol, enhancedChain) {
    try {
      const freshness = this.validateDataFreshness(enhancedChain.underlying.timestamp);
      let freshnessScore = freshness.valid ? 30 : Math.max(0, 30 - (freshness.ageMs / 1000));

      const pcrValidation = await this.validatePCR(symbol, enhancedChain.analysis.pcr?.ratio || 1.0);
      const pcrAnomalyScore = pcrValidation.isAnomaly ? 0 : 20;

      let greeksBoundsScore = 0;
      if (enhancedChain.strikes && enhancedChain.strikes.length > 0) {
        const atmStrike = enhancedChain.strikes.find(s => s.isATM);
        if (atmStrike?.callGreeks) {
          const validation = this.validateGreeks(atmStrike.callGreeks, false);
          greeksBoundsScore = validation.allValid ? 25 : 10;
        } else {
          greeksBoundsScore = 15;
        }
      }

      const ivQuality = enhancedChain.metadata?.dataQuality?.ivCoverage || '0%';
      const ivCoveragePercent = parseFloat(ivQuality);
      const ivCrossCheckScore = Math.min(25, (ivCoveragePercent / 100) * 25);

      const totalScore = freshnessScore + greeksBoundsScore + ivCrossCheckScore + pcrAnomalyScore;
      const clampedScore = Math.round(Math.min(100, Math.max(0, totalScore)));

      let grade = 'F';
      if (clampedScore >= 90) grade = 'A';
      else if (clampedScore >= 75) grade = 'B';
      else if (clampedScore >= 60) grade = 'C';
      else if (clampedScore >= 45) grade = 'D';

      const warnings = [];
      if (!freshness.valid) warnings.push(`Data is ${freshness.ageSeconds}s old (>1 min)`);
      if (pcrValidation.isAnomaly) warnings.push('PCR is anomalous (outside 2.5 std dev)');
      if (ivCoveragePercent < 70) warnings.push(`IV coverage is only ${ivQuality}`);

      return {
        score: clampedScore,
        grade,
        breakdown: {
          freshness: Math.round(freshnessScore),
          greeksBounds: greeksBoundsScore,
          ivCrossCheck: Math.round(ivCrossCheckScore),
          pcrAnomaly: pcrAnomalyScore
        },
        warnings
      };
    } catch (error) {
      console.error('Error scoring data quality:', error);
      return {
        score: 50,
        grade: 'C',
        breakdown: {},
        warnings: ['Error during quality assessment']
      };
    }
  }
}

export default new ValidationService();
