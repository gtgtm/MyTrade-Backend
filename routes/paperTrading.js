// Paper Trading Routes - Shadow mode validation endpoints
// Endpoints for tracking, monitoring, and validating paper trades

import express from 'express';

const router = express.Router();

// Middleware to get paper trading manager (injected from server)
const getPaperTradingManager = (req) => req.app.get('paperTradingManager');
const getDivergenceValidator = (req) => req.app.get('divergenceValidator');

// Execute a shadow trade (simulate entry)
router.post('/execute', (req, res) => {
  try {
    const { symbol, signalType, currentPrice, target, stop, confidence } = req.body;

    if (!symbol || !signalType || !currentPrice) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: symbol, signalType, currentPrice'
      });
    }

    const paperTrading = getPaperTradingManager(req);
    const trade = paperTrading.executeShadowTrade({
      symbol,
      signalType,
      currentPrice,
      target: target || currentPrice * 1.05,
      stop: stop || currentPrice * 0.95,
      confidence: confidence || 80
    });

    res.json({
      status: 'executed',
      trade: {
        id: trade.id,
        symbol: trade.symbol,
        entryPrice: trade.entryPrice,
        target: trade.target,
        stop: trade.stop,
        confidence: trade.entryConfidence,
        entryTime: new Date(trade.entryTime)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Update trade with current price
router.post('/update', (req, res) => {
  try {
    const { symbol, currentPrice } = req.body;

    if (!symbol || currentPrice === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: symbol, currentPrice'
      });
    }

    const paperTrading = getPaperTradingManager(req);
    paperTrading.updateShadowTrade(symbol, currentPrice);

    res.json({
      status: 'updated',
      symbol,
      currentPrice,
      openTrades: paperTrading.getOpenTrades().length
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get current paper trading status
router.get('/status', (req, res) => {
  try {
    const paperTrading = getPaperTradingManager(req);
    const status = paperTrading.getStatus();

    res.json({
      status: 'ok',
      data: status
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get detailed metrics report
router.get('/metrics', (req, res) => {
  try {
    const paperTrading = getPaperTradingManager(req);
    const report = paperTrading.getMetricsReport();

    res.json({
      status: 'ok',
      data: report
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get divergence analysis report
router.get('/divergence/report', (req, res) => {
  try {
    const paperTrading = getPaperTradingManager(req);
    const report = paperTrading.getDivergenceReport();

    res.json({
      status: 'ok',
      data: report
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Record divergence event
router.post('/divergence/record', (req, res) => {
  try {
    const { severity, symbol, metrics, detected, alertSent } = req.body;

    const paperTrading = getPaperTradingManager(req);
    const divergenceValidator = getDivergenceValidator(req);

    const timestamp = Date.now();

    // Record in paper trading
    paperTrading.recordDivergenceEvent({
      severity: severity || 'WARNING',
      symbol,
      metrics,
      detected: detected || false,
      alertSent: alertSent || false
    });

    // Validate divergence
    const validation = divergenceValidator.validateDivergence(detected, timestamp);

    res.json({
      status: 'recorded',
      validation: {
        confirmed: validation.confirmed,
        severity: validation.severity,
        metrics: validation.metrics
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get open trades
router.get('/trades/open', (req, res) => {
  try {
    const paperTrading = getPaperTradingManager(req);
    const openTrades = paperTrading.getOpenTrades();

    res.json({
      status: 'ok',
      count: openTrades.length,
      trades: openTrades
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get trade history
router.get('/trades/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const paperTrading = getPaperTradingManager(req);
    const history = paperTrading.getTradeHistory(limit);

    res.json({
      status: 'ok',
      count: history.length,
      trades: history
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Record error event
router.post('/system/error', (req, res) => {
  try {
    const { message, stack } = req.body;
    const paperTrading = getPaperTradingManager(req);

    paperTrading.recordError({
      message: message || 'Unknown error',
      stack
    });

    res.json({
      status: 'recorded',
      message: 'Error event recorded'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Record recovery event
router.post('/system/recovery', (req, res) => {
  try {
    const { message, durationMs } = req.body;
    const paperTrading = getPaperTradingManager(req);

    paperTrading.recordRecovery({
      message: message || 'System recovered',
      durationMs: durationMs || 0
    });

    res.json({
      status: 'recorded',
      message: 'Recovery event recorded'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Check deployment readiness
router.get('/readiness', (req, res) => {
  try {
    const paperTrading = getPaperTradingManager(req);
    const divergenceValidator = getDivergenceValidator(req);

    const paperTradingReadiness = paperTrading.checkDeploymentReadiness();
    const divergenceReadiness = divergenceValidator.isReadyForProduction();

    const overallReady =
      paperTradingReadiness.overallReady && divergenceReadiness.overallReady;

    res.json({
      status: 'ok',
      readyForPhase1: overallReady,
      paperTrading: {
        signalQuality: paperTradingReadiness.signalQuality,
        systemStability: paperTradingReadiness.systemStability,
        performanceTargets: paperTradingReadiness.performanceTargets,
        metrics: paperTrading.getMetricsReport().summary
      },
      divergence: {
        detectionAccuracy: divergenceReadiness.overallReady,
        accuracyMetrics: divergenceValidator.getAccuracyMetrics(),
        latencyStats: divergenceValidator.getDetectionLatencyStats()
      },
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get divergence validation report
router.get('/divergence/validation', (req, res) => {
  try {
    const divergenceValidator = getDivergenceValidator(req);
    const report = divergenceValidator.getValidationReport();

    res.json({
      status: 'ok',
      data: report
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Adjust divergence tolerance bands (for live tuning)
router.post('/divergence/tune-bands', (req, res) => {
  try {
    const { winRate, profitFactor, targetHitRate, confidence } = req.body;
    const divergenceValidator = getDivergenceValidator(req);

    const newBands = {};
    if (winRate) newBands.winRate = winRate;
    if (profitFactor) newBands.profitFactor = profitFactor;
    if (targetHitRate) newBands.targetHitRate = targetHitRate;
    if (confidence) newBands.confidence = confidence;

    divergenceValidator.adjustToleranceBands(newBands);

    res.json({
      status: 'adjusted',
      newBands: divergenceValidator.toleranceBands
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

export default router;
