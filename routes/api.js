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

const router = express.Router();

// Signal endpoints
router.get('/health', signalController.healthCheck);
router.get('/signals', signalController.getSignals);
router.get('/signals/:symbol', signalController.getSignal);

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

// Crypto endpoints
router.get('/crypto/signals', (req, res) =>
  cryptoController.getAllSignals(req, res)
);

router.get('/crypto/signals/:symbol', (req, res) =>
  cryptoController.getSignal(req, res)
);

export default router;
