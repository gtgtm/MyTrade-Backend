import express from 'express';
import signalController from '../controllers/signalController.js';
import statsController from '../controllers/statsController.js';
import optionChainController from '../controllers/optionChainController.js';
import historicalDataController from '../controllers/historicalDataController.js';
import exportController from '../controllers/exportController.js';
import analyticsController from '../controllers/analyticsController.js';
import backtestController from '../controllers/backtestController.js';
import mlController from '../controllers/mlController.js';
import preferencesController from '../controllers/preferencesController.js';
import comprehensiveSignalController from '../controllers/comprehensiveSignalController.js';
import cryptoController from '../controllers/cryptoController.js';
import tradingJournalController from '../controllers/tradingJournalController.js';
import Backtester from '../services/backtester.js';
import WalkForwardEngine from '../services/walkForwardEngine.js';

const router = express.Router();

// Signal endpoints (order matters - more specific routes first!)
router.get('/health', signalController.healthCheck);
router.get('/signals', signalController.getSignals);
router.get('/signals/supported-symbols', (req, res) => {
  res.json({
    success: true,
    note: "These are pre-configured coins. Signals can be generated for any valid Binance coin (XXXUSDT format)",
    data: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "LINKUSDT", "BNBUSDT", "ADAUSDT", "MATICUSDT", "UNIUSDT", "ARBUSDT", "OPUSDT", "FLOKIUSDT", "PEPEUSDT", "MEMEUSDT", "BOMEUSDT", "BONKUSDT", "FILUSDT", "ATOMUSDT", "DOTUSDT", "LTCUSDT", "AVAXUSDT", "VETUSDT", "FTMUSDT", "HBARUSDT", "NEARUSDT"]
  });
});
router.get('/signals/:symbol', signalController.getSignal);
router.get('/signals/quote/:symbol', signalController.getQuote);

// Statistics endpoints
router.get('/stats', statsController.getStats);
router.get('/history', statsController.getHistory);
router.post('/outcome', statsController.recordOutcome);

// Option Chain endpoints - Enhanced with Greeks, Max Pain, and PCR
router.get('/option-chain/:symbol', (req, res) =>
  optionChainController.getEnhancedOptionChain(req, res)
);

router.get('/option-chain/:symbol/strikes', (req, res) =>
  optionChainController.getStrikesData(req, res)
);

router.get('/option-chain/:symbol/max-pain', (req, res) =>
  optionChainController.getMaxPainAnalysis(req, res)
);

router.get('/option-chain/:symbol/alerts', (req, res) =>
  optionChainController.getCriticalAlerts(req, res)
);

router.get('/signals/:symbol/pcr-analysis', (req, res) =>
  optionChainController.getPCRAnalysis(req, res)
);

router.get('/signals/:symbol/comprehensive', (req, res) =>
  comprehensiveSignalController.getComprehensiveSignal(req, res)
);

router.get('/option-chain/multi/:symbols', (req, res) =>
  optionChainController.getMultipleOptionChains(req, res)
);

// Historical Data endpoints
router.get('/history/pcr/:symbol', (req, res) =>
  historicalDataController.getPCRHistory(req, res)
);

router.get('/history/max-pain/:symbol', (req, res) =>
  historicalDataController.getMaxPainHistory(req, res)
);

router.get('/history/iv/:symbol', (req, res) =>
  historicalDataController.getIVHistory(req, res)
);

router.get('/history/alerts/:symbol', (req, res) =>
  historicalDataController.getAlertsHistory(req, res)
);

router.get('/history/daily-stats/:symbol', (req, res) =>
  historicalDataController.getDailyStats(req, res)
);

router.get('/history/snapshots/:symbol', (req, res) =>
  historicalDataController.getSnapshots(req, res)
);

router.get('/history/comparison', (req, res) =>
  historicalDataController.compareSymbols(req, res)
);

router.get('/history/stats', (req, res) =>
  historicalDataController.getStats(req, res)
);

router.post('/history/alerts/:id/acknowledge', (req, res) =>
  historicalDataController.acknowledgeAlert(req, res)
);

router.get('/history/analysis/:symbol', (req, res) =>
  historicalDataController.getAnalysisReport(req, res)
);

// Phase 4: Export & Reporting endpoints
router.get('/export/pcr/:symbol', (req, res) =>
  exportController.exportPCRHistory(req, res)
);

router.get('/export/max-pain/:symbol', (req, res) =>
  exportController.exportMaxPainHistory(req, res)
);

router.get('/export/full/:symbol', (req, res) =>
  exportController.exportFullAnalysis(req, res)
);

router.get('/reports/daily/:symbol', (req, res) =>
  exportController.getDailyReport(req, res)
);

router.get('/reports/weekly/:symbol', (req, res) =>
  exportController.getWeeklyReport(req, res)
);

router.get('/reports/monthly/:symbol', (req, res) =>
  exportController.getMonthlyReport(req, res)
);

router.get('/reports/market', (req, res) =>
  exportController.getMarketReport(req, res)
);

// Phase 4: Analytics endpoints
router.get('/analytics/technical/:symbol', (req, res) =>
  analyticsController.getTechnicalAnalysis(req, res)
);

router.get('/analytics/volatility/:symbol', (req, res) =>
  analyticsController.getVolatilityAnalysis(req, res)
);

router.get('/analytics/correlation', (req, res) =>
  analyticsController.getCorrelationMatrix(req, res)
);

router.get('/analytics/trend/:symbol', (req, res) =>
  analyticsController.getTrendStrength(req, res)
);

router.get('/analytics/support-resistance/:symbol', (req, res) =>
  analyticsController.getSupportResistance(req, res)
);

// Phase 4: Backtesting endpoints
router.post('/backtest/run', (req, res) =>
  backtestController.runBacktest(req, res)
);

router.get('/backtest/results/:id', (req, res) =>
  backtestController.getResults(req, res)
);

router.get('/backtest/list', (req, res) =>
  backtestController.listBacktests(req, res)
);

router.get('/backtest/compare', (req, res) =>
  backtestController.compareRuns(req, res)
);

router.get('/backtest/signal-accuracy/:symbol', (req, res) =>
  backtestController.getSignalAccuracy(req, res)
);

// Phase 4: ML endpoints
router.get('/ml/patterns/:symbol', (req, res) =>
  mlController.getPatterns(req, res)
);

router.get('/ml/predict/:symbol', (req, res) =>
  mlController.predictNextValue(req, res)
);

router.get('/ml/anomalies', (req, res) =>
  mlController.getAnomalies(req, res)
);

router.get('/ml/signal-accuracy/:symbol', (req, res) =>
  mlController.getSignalAccuracy(req, res)
);

router.get('/ml/trend-reversal/:symbol', (req, res) =>
  mlController.getTrendReversal(req, res)
);

// Phase 4: User Preferences endpoints
router.get('/preferences', (req, res) =>
  preferencesController.getAllPreferences(req, res)
);

router.get('/preferences/defaults', (req, res) =>
  preferencesController.getDefaults(req, res)
);

router.get('/preferences/config/trading', (req, res) =>
  preferencesController.getTradingConfig(req, res)
);

router.get('/preferences/:key', (req, res) =>
  preferencesController.getPreference(req, res)
);

router.post('/preferences', (req, res) =>
  preferencesController.setPreference(req, res)
);

router.post('/preferences/batch', (req, res) =>
  preferencesController.batchUpdate(req, res)
);

router.post('/preferences/reset', (req, res) =>
  preferencesController.resetToDefaults(req, res)
);

router.put('/preferences/:key', (req, res) =>
  preferencesController.updatePreference(req, res)
);

router.delete('/preferences/:key', (req, res) =>
  preferencesController.deletePreference(req, res)
);

// Signal monitoring preferences endpoints
router.post('/signal-preferences/:userId', (req, res) =>
  preferencesController.setSignalPreferences(req, res)
);

router.get('/signal-preferences/:userId', (req, res) =>
  preferencesController.getSignalPreferences(req, res)
);

router.get('/signal-preferences/available/symbols', (req, res) =>
  preferencesController.getAvailableSymbols(req, res)
);

// Crypto endpoints
router.get('/crypto/signals', (req, res) =>
  cryptoController.getAllSignals(req, res)
);

router.get('/crypto/signals/:symbol', (req, res) =>
  cryptoController.getSignal(req, res)
);

router.get('/crypto/accuracy/:symbol', (req, res) =>
  cryptoController.getAccuracyMetrics(req, res)
);

// Exit tracking and accuracy metrics endpoints
router.get('/accuracy/dashboard', (req, res) => {
  if (!global.exitManager) {
    return res.status(503).json({ error: 'Exit manager not initialized' });
  }
  res.json(global.exitManager.getDashboard());
});

router.get('/accuracy/metrics/:symbol', (req, res) => {
  const { symbol } = req.params;
  if (!global.exitManager) {
    return res.status(503).json({ error: 'Exit manager not initialized' });
  }
  const metrics = global.exitManager.getMetrics(symbol);
  if (!metrics) {
    return res.status(404).json({ error: `No metrics for ${symbol}` });
  }
  res.json(metrics);
});

router.get('/accuracy/metrics', (req, res) => {
  if (!global.exitManager) {
    return res.status(503).json({ error: 'Exit manager not initialized' });
  }
  res.json(global.exitManager.getMetrics());
});

router.get('/accuracy/recent-exits/:symbol', (req, res) => {
  const { symbol } = req.params;
  const { limit = 20 } = req.query;
  if (!global.exitManager) {
    return res.status(503).json({ error: 'Exit manager not initialized' });
  }
  const exits = global.exitManager.getRecentExits(symbol, parseInt(limit));
  res.json({ symbol, count: exits.length, exits });
});

router.get('/accuracy/active-signals', (req, res) => {
  if (!global.exitManager) {
    return res.status(503).json({ error: 'Exit manager not initialized' });
  }
  const active = Array.from(global.exitManager.activeSignals.values());
  res.json({ activeCount: active.length, signals: active });
});

// Backtesting endpoints
router.post('/backtest/run/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { days = 30 } = req.query;

  try {
    const backtester = new Backtester();
    const result = await backtester.backtestSymbol(symbol, parseInt(days));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backtest/run-all', async (req, res) => {
  const { days = 30 } = req.query;

  try {
    const backtester = new Backtester();
    const results = await backtester.backtestAll(parseInt(days));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/backtest/status', (req, res) => {
  res.json({
    status: 'ready',
    message: 'Backtester ready for validation',
    endpoints: {
      'POST /api/backtest/run/:symbol': 'Backtest single symbol',
      'POST /api/backtest/run-all': 'Backtest all symbols',
      'POST /api/backtest/walk-forward/:symbol': 'Walk-forward validation (180d train, 30d test)',
      'GET /api/accuracy/dashboard': 'View accuracy dashboard',
      'GET /api/accuracy/metrics': 'View aggregate accuracy metrics'
    }
  });
});

// Walk-forward backtesting endpoints (Week 2)
router.post('/backtest/walk-forward/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { days = 720 } = req.query; // Default 2 years of history

  try {
    const backtester = new Backtester();
    const wfEngine = new WalkForwardEngine(backtester);
    const result = await wfEngine.runWalkForward(symbol, parseInt(days));
    const report = wfEngine.generateReport(result);

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

router.post('/backtest/walk-forward-all', async (req, res) => {
  const { days = 720 } = req.query;
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

  try {
    const backtester = new Backtester();
    const wfEngine = new WalkForwardEngine(backtester);

    console.log(`🔬 Starting walk-forward validation suite (all symbols, ${days} days)...`);

    const allResults = {};
    for (const symbol of symbols) {
      const result = await wfEngine.runWalkForward(symbol, parseInt(days));
      allResults[symbol] = wfEngine.generateReport(result);
    }

    // Aggregate verdict
    const allReady = Object.values(allResults).every(r => r.status === 'ACCEPTED');
    const avgConfidence = (
      Object.values(allResults).reduce((sum, r) => sum + r.confidence, 0) /
      Object.keys(allResults).length
    );

    res.json({
      overallStatus: allReady ? 'READY_FOR_PHASE_1' : 'VALIDATION_INCOMPLETE',
      averageConfidence: avgConfidence.toFixed(1),
      results: allResults,
      deploymentRecommendation: allReady
        ? '✅ All symbols validated. Safe to proceed with Phase 1 deployment.'
        : '⚠️ Some symbols failed acceptance gates. Review critical failures before deployment.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Week 3: Divergence Analysis & Incident Management

// Divergence analysis endpoints
router.post('/divergence/set-baseline', (req, res) => {
  const { backtestMetrics } = req.body;

  if (!backtestMetrics) {
    return res.status(400).json({ error: 'backtestMetrics required' });
  }

  if (!global.divergenceAnalyzer) {
    return res.status(503).json({ error: 'Divergence analyzer not initialized' });
  }

  global.divergenceAnalyzer.setBaseline(backtestMetrics);
  res.json({
    status: 'baseline_set',
    expectedWinRate: `${backtestMetrics.avgWinRate.toFixed(1)}%`,
    expectedProfitFactor: backtestMetrics.avgProfitFactor.toFixed(2),
    message: 'Baseline metrics set for divergence monitoring'
  });
});

router.get('/divergence/check', (req, res) => {
  if (!global.divergenceAnalyzer) {
    return res.status(503).json({ error: 'Divergence analyzer not initialized' });
  }

  const analysis = global.divergenceAnalyzer.checkDivergence();
  res.json(analysis);
});

router.get('/divergence/report', (req, res) => {
  if (!global.divergenceAnalyzer) {
    return res.status(503).json({ error: 'Divergence analyzer not initialized' });
  }

  const report = global.divergenceAnalyzer.generateReport();
  res.json(report);
});

// Incident management endpoints
router.get('/incidents/open', (req, res) => {
  if (!global.incidentManager) {
    return res.status(503).json({ error: 'Incident manager not initialized' });
  }

  const openIncidents = global.incidentManager.getOpenIncidents();
  res.json({ count: openIncidents.length, incidents: openIncidents });
});

router.get('/incidents/stats', (req, res) => {
  if (!global.incidentManager) {
    return res.status(503).json({ error: 'Incident manager not initialized' });
  }

  const stats = global.incidentManager.getStats();
  res.json(stats);
});

router.get('/incidents/report', (req, res) => {
  if (!global.incidentManager) {
    return res.status(503).json({ error: 'Incident manager not initialized' });
  }

  const report = global.incidentManager.generateReport();
  res.json(report);
});

router.get('/incidents/:id', (req, res) => {
  const { id } = req.params;

  if (!global.incidentManager) {
    return res.status(503).json({ error: 'Incident manager not initialized' });
  }

  const incident = global.incidentManager.getIncident(id);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  res.json(incident);
});

router.post('/incidents/:id/acknowledge', (req, res) => {
  const { id } = req.params;
  const { acknowledgedBy } = req.body;

  if (!global.incidentManager) {
    return res.status(503).json({ error: 'Incident manager not initialized' });
  }

  const success = global.incidentManager.acknowledge(id, acknowledgedBy || 'unknown');
  res.json({ success, message: success ? 'Incident acknowledged' : 'Incident not found' });
});

router.post('/incidents/:id/resolve', (req, res) => {
  const { id } = req.params;
  const { resolvedBy, notes } = req.body;

  if (!global.incidentManager) {
    return res.status(503).json({ error: 'Incident manager not initialized' });
  }

  const success = global.incidentManager.resolve(id, resolvedBy || 'unknown', notes || '');
  res.json({ success, message: success ? 'Incident resolved' : 'Incident not found' });
});

router.post('/incidents/test', (req, res) => {
  if (!global.incidentManager) {
    return res.status(503).json({ error: 'Incident manager not initialized' });
  }

  const { type = 'NETWORK_FAILURE', severity = 'WARNING' } = req.body;

  const incident = global.incidentManager.detectIncident(
    type,
    severity,
    `Test incident: ${type}`,
    { test: true }
  );

  res.json({ message: 'Test incident created', incident });
});

// Week 5: Real-time and Push Notification endpoints

// Real-time connection stats
router.get('/realtime/stats', (req, res) => {
  if (!global.realtimeManager) {
    return res.status(503).json({ error: 'Realtime manager not initialized' });
  }

  res.json(global.realtimeManager.getStats());
});

// Register device for push notifications
router.post('/push/register', (req, res) => {
  const { userId, deviceToken, platform } = req.body;

  if (!userId || !deviceToken) {
    return res.status(400).json({ error: 'userId and deviceToken required' });
  }

  if (!global.pushNotificationManager) {
    return res.status(503).json({ error: 'Push manager not initialized' });
  }

  global.pushNotificationManager.registerDeviceToken(userId, deviceToken, platform || 'ios');

  res.json({
    status: 'registered',
    userId,
    platform: platform || 'ios',
    timestamp: new Date().toISOString()
  });
});

// Unregister device for push notifications
router.post('/push/unregister', (req, res) => {
  const { userId, deviceToken } = req.body;

  if (!userId || !deviceToken) {
    return res.status(400).json({ error: 'userId and deviceToken required' });
  }

  if (!global.pushNotificationManager) {
    return res.status(503).json({ error: 'Push manager not initialized' });
  }

  global.pushNotificationManager.unregisterDeviceToken(userId, deviceToken);

  res.json({
    status: 'unregistered',
    userId,
    timestamp: new Date().toISOString()
  });
});

// Get push notification stats
router.get('/push/stats', (req, res) => {
  if (!global.pushNotificationManager) {
    return res.status(503).json({ error: 'Push manager not initialized' });
  }

  res.json(global.pushNotificationManager.getStats());
});

// Get notification history
router.get('/push/history', (req, res) => {
  const { type = null, limit = 50 } = req.query;

  if (!global.pushNotificationManager) {
    return res.status(503).json({ error: 'Push manager not initialized' });
  }

  const history = global.pushNotificationManager.getHistory(type, parseInt(limit));
  res.json({ count: history.length, notifications: history });
});

// Send test push notification
router.post('/push/test', async (req, res) => {
  const { userId, type = 'TRADE_EXIT' } = req.body;

  if (!global.pushNotificationManager) {
    return res.status(503).json({ error: 'Push manager not initialized' });
  }

  try {
    let notification;

    if (type === 'TRADE_EXIT') {
      notification = await global.pushNotificationManager.notifyTradeExit(
        {
          id: 'TEST-001',
          symbol: 'BTCUSDT',
          exitType: 'TARGET_HIT',
          pnl: 290,
          pnlPercent: 1.45,
          isWin: true,
          exitTime: new Date().toISOString()
        },
        userId ? [userId] : []
      );
    } else if (type === 'DIVERGENCE_ALERT') {
      notification = await global.pushNotificationManager.notifyDivergence(
        {
          recommendation: { message: 'Win rate deviation detected' },
          actualMetrics: { winRate: '42%' },
          baselineExpectations: { winRate: '68%' }
        },
        'WARNING'
      );
    } else if (type === 'AUTO_HALT') {
      notification = await global.pushNotificationManager.notifyAutoHalt('Win rate <40%');
    }

    res.json({ message: 'Test notification sent', notification });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trading Journal endpoints - Track your trades and P&L
router.post('/trades/record', (req, res) =>
  tradingJournalController.recordTrade(req, res)
);

router.post('/trades/:tradeId/close', (req, res) =>
  tradingJournalController.closeTrade(req, res)
);

router.get('/trades/:userId', (req, res) =>
  tradingJournalController.getUserTrades(req, res)
);

router.get('/trades/:userId/stats', (req, res) =>
  tradingJournalController.getStats(req, res)
);

router.get('/trades/:userId/daily/:date', (req, res) =>
  tradingJournalController.getDailyPnl(req, res)
);

router.get('/trades/:userId/weekly', (req, res) =>
  tradingJournalController.getWeeklyStats(req, res)
);

router.get('/trades/:userId/monthly', (req, res) =>
  tradingJournalController.getMonthlyStats(req, res)
);

router.get('/trades/:userId/symbol/:symbol', (req, res) =>
  tradingJournalController.getTradesBySymbol(req, res)
);

router.delete('/trades/:tradeId', (req, res) =>
  tradingJournalController.cancelTrade(req, res)
);

export default router;
