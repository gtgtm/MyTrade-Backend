// Divergence Detection Validator - Live market condition validation
// Validates divergence detection accuracy and fine-tunes thresholds
// Tracks false positives, false negatives, and detection latency

import { EventEmitter } from 'events';

class DivergenceValidator extends EventEmitter {
  constructor(baselineMetrics) {
    super();
    this.baseline = baselineMetrics || {
      avgWinRate: 68.5,
      avgProfitFactor: 2.8,
      avgTargetHitRate: 72.0,
      confidence: 92
    };

    this.liveMetrics = {};
    this.divergenceHistory = [];
    this.validationResults = {
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0,
      detectionLatencyMs: [],
      recoveryCount: 0
    };
    this.toleranceBands = {
      winRate: { lower: 55, upper: 82 }, // ±13.5% from baseline
      profitFactor: { lower: 2.0, upper: 3.6 }, // ±0.8 from baseline
      targetHitRate: { lower: 60, upper: 84 }, // ±12% from baseline
      confidence: { lower: 85, upper: 100 } // ±7 from baseline
    };
    this.criticalThresholds = {
      winRate: 40, // <40% is critical
      profitFactor: 1.0, // <1.0 is critical
      targetHitRate: 50, // <50% is critical
      confidence: 70 // <70% is critical
    };
  }

  // Record live metric for validation
  recordLiveMetric(metric, value, timestamp) {
    if (!this.liveMetrics[metric]) {
      this.liveMetrics[metric] = [];
    }

    this.liveMetrics[metric].push({
      value,
      timestamp,
      baselineValue: this.baseline[this._mapMetricName(metric)]
    });

    // Keep only last 100 measurements
    if (this.liveMetrics[metric].length > 100) {
      this.liveMetrics[metric].shift();
    }

    this.emit('metric:recorded', { metric, value, timestamp });
  }

  // Validate if divergence is real (not false alarm)
  validateDivergence(detectedDivergence, timestamp) {
    const divergenceEvent = {
      timestamp,
      detected: detectedDivergence,
      validated: false,
      severity: 'NONE',
      metrics: {},
      detectionLatency: 0,
      confirmed: false
    };

    if (!detectedDivergence) {
      this.validationResults.trueNegatives++;
      divergenceEvent.validated = true;
      return divergenceEvent;
    }

    // Check if divergence metrics are within acceptable bands
    let isRealDivergence = false;
    const metricsOutOfBand = [];

    for (const [metric, band] of Object.entries(this.toleranceBands)) {
      const current = this.liveMetrics[metric]
        ? this.liveMetrics[metric][this.liveMetrics[metric].length - 1]?.value || 0
        : 0;

      if (current < band.lower || current > band.upper) {
        metricsOutOfBand.push(metric);
        divergenceEvent.metrics[metric] = {
          current,
          baseline: this.baseline[this._mapMetricName(metric)],
          band,
          outOfBand: true
        };

        // Check if critical threshold is breached
        if (current < this.criticalThresholds[metric]) {
          divergenceEvent.severity = 'CRITICAL';
          isRealDivergence = true;
        } else {
          divergenceEvent.severity = 'WARNING';
        }
      } else {
        divergenceEvent.metrics[metric] = {
          current,
          baseline: this.baseline[this._mapMetricName(metric)],
          band,
          outOfBand: false
        };
      }
    }

    // Real divergence requires >=2 metrics out of band
    if (metricsOutOfBand.length >= 2) {
      divergenceEvent.validated = true;
      divergenceEvent.confirmed = true;
      this.validationResults.truePositives++;
    } else if (metricsOutOfBand.length === 1 && divergenceEvent.severity === 'CRITICAL') {
      divergenceEvent.validated = true;
      divergenceEvent.confirmed = true;
      this.validationResults.truePositives++;
    } else {
      // False positive: divergence detected but metrics are fine
      divergenceEvent.validated = true;
      divergenceEvent.confirmed = false;
      this.validationResults.falsePositives++;

      this.emit('divergence:falsePositive', {
        timestamp,
        metricsOutOfBand,
        severity: divergenceEvent.severity
      });
    }

    this.divergenceHistory.push(divergenceEvent);

    // Keep only last 500 events
    if (this.divergenceHistory.length > 500) {
      this.divergenceHistory.shift();
    }

    return divergenceEvent;
  }

  // Record detection latency for performance tracking
  recordDetectionLatency(latencyMs) {
    this.validationResults.detectionLatencyMs.push(latencyMs);

    // Keep only last 100 measurements
    if (this.validationResults.detectionLatencyMs.length > 100) {
      this.validationResults.detectionLatencyMs.shift();
    }

    this.emit('divergence:latency', {
      latencyMs,
      avgLatency: this.getAverageDetectionLatency(),
      p95Latency: this.getP95DetectionLatency()
    });
  }

  // Record successful recovery after divergence
  recordRecovery(recoveryDetails) {
    this.validationResults.recoveryCount++;
    this.emit('divergence:recovery', {
      timestamp: Date.now(),
      durationMs: recoveryDetails.durationMs,
      metricsRestored: recoveryDetails.metricsRestored
    });
  }

  // Get detection accuracy metrics
  getAccuracyMetrics() {
    const { truePositives, falsePositives, trueNegatives, falseNegatives } =
      this.validationResults;

    const accuracy =
      (truePositives + trueNegatives) / (truePositives + falsePositives + trueNegatives + falseNegatives) || 0;
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = 2 * ((precision * recall) / (precision + recall)) || 0;

    return {
      accuracy: (accuracy * 100).toFixed(2) + '%',
      precision: (precision * 100).toFixed(2) + '%',
      recall: (recall * 100).toFixed(2) + '%',
      f1Score: f1Score.toFixed(2),
      truePositives,
      falsePositives,
      trueNegatives,
      falseNegatives
    };
  }

  // Get detection latency percentiles
  getDetectionLatencyStats() {
    const latencies = [...this.validationResults.detectionLatencyMs].sort((a, b) => a - b);

    if (latencies.length === 0) {
      return { samples: 0, mean: 0, p95: 0, p99: 0, max: 0 };
    }

    const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const max = latencies[latencies.length - 1];

    return {
      samples: latencies.length,
      mean: mean.toFixed(2) + 'ms',
      p95: p95 + 'ms',
      p99: p99 + 'ms',
      max: max + 'ms'
    };
  }

  // Get average detection latency
  getAverageDetectionLatency() {
    if (this.validationResults.detectionLatencyMs.length === 0) return 0;
    const sum = this.validationResults.detectionLatencyMs.reduce((a, b) => a + b, 0);
    return (sum / this.validationResults.detectionLatencyMs.length).toFixed(2);
  }

  // Get P95 detection latency
  getP95DetectionLatency() {
    const sorted = [...this.validationResults.detectionLatencyMs].sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    return sorted[Math.floor(sorted.length * 0.95)];
  }

  // Adjust tolerance bands based on live market conditions
  adjustToleranceBands(newBands) {
    this.toleranceBands = { ...this.toleranceBands, ...newBands };
    this.emit('divergence:bandsAdjusted', {
      timestamp: Date.now(),
      newBands: this.toleranceBands
    });
  }

  // Adjust critical thresholds
  adjustCriticalThresholds(newThresholds) {
    this.criticalThresholds = { ...this.criticalThresholds, ...newThresholds };
    this.emit('divergence:thresholdsAdjusted', {
      timestamp: Date.now(),
      newThresholds: this.criticalThresholds
    });
  }

  // Get validation report
  getValidationReport() {
    const confirmedDivergences = this.divergenceHistory.filter(d => d.confirmed);
    const criticalDivergences = confirmedDivergences.filter(d => d.severity === 'CRITICAL');

    return {
      summary: {
        totalValidations: this.divergenceHistory.length,
        confirmedDivergences: confirmedDivergences.length,
        criticalDivergences: criticalDivergences.length,
        recoveries: this.validationResults.recoveryCount,
        accuracyMetrics: this.getAccuracyMetrics()
      },
      latency: this.getDetectionLatencyStats(),
      toleranceBands: this.toleranceBands,
      criticalThresholds: this.criticalThresholds,
      recentEvents: this.divergenceHistory.slice(-20),
      timestamp: new Date()
    };
  }

  // Check if system is ready for production
  isReadyForProduction() {
    const accuracy = this.getAccuracyMetrics();
    const latency = this.getDetectionLatencyStats();

    const criteria = {
      highAccuracy: parseFloat(accuracy.accuracy) >= 95,
      lowFalsePositiveRate: parseFloat(accuracy.precision) >= 90,
      goodRecall: parseFloat(accuracy.recall) >= 80,
      lowDetectionLatency: latency.samples > 0 && parseInt(latency.p95) < 200,
      sufficientSamples: this.divergenceHistory.length >= 50,
      overallReady: false
    };

    criteria.overallReady =
      criteria.highAccuracy &&
      criteria.lowFalsePositiveRate &&
      criteria.goodRecall &&
      criteria.lowDetectionLatency &&
      criteria.sufficientSamples;

    return criteria;
  }

  // Helper: Map metric name to baseline property
  _mapMetricName(metric) {
    const mapping = {
      winRate: 'avgWinRate',
      profitFactor: 'avgProfitFactor',
      targetHitRate: 'avgTargetHitRate',
      confidence: 'confidence'
    };
    return mapping[metric] || metric;
  }
}

export default DivergenceValidator;
