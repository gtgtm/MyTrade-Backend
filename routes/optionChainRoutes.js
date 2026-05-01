/**
 * Option Chain API Routes
 * Routes for enhanced option chain data with Greeks, Max Pain, and PCR analysis
 */

const express = require('express');
const router = express.Router();
const optionChainController = require('../controllers/optionChainController');

/**
 * GET /api/option-chain/:symbol
 * Returns enhanced option chain with Greeks, Max Pain, and PCR
 * Query params:
 *   - includeGreeks: boolean (default: true)
 *   - includeMaxPain: boolean (default: true)
 *   - includePCR: boolean (default: true)
 */
router.get('/option-chain/:symbol', (req, res) =>
  optionChainController.getEnhancedOptionChain(req, res)
);

/**
 * GET /api/option-chain/:symbol/strikes
 * Returns strike-by-strike Greeks, IV, and OI data
 * Query params:
 *   - format: 'detailed' | 'compact' (default: detailed)
 */
router.get('/option-chain/:symbol/strikes', (req, res) =>
  optionChainController.getStrikesData(req, res)
);

/**
 * GET /api/option-chain/:symbol/max-pain
 * Returns Max Pain analysis and support/resistance levels
 */
router.get('/option-chain/:symbol/max-pain', (req, res) =>
  optionChainController.getMaxPainAnalysis(req, res)
);

/**
 * GET /api/option-chain/:symbol/alerts
 * Returns critical alerts for immediate action
 */
router.get('/option-chain/:symbol/alerts', (req, res) =>
  optionChainController.getCriticalAlerts(req, res)
);

/**
 * GET /api/signals/:symbol/pcr-analysis
 * Returns PCR analysis with sentiment, alerts, and trading signals
 * Query params:
 *   - includeTradingSignals: boolean (default: true)
 */
router.get('/signals/:symbol/pcr-analysis', (req, res) =>
  optionChainController.getPCRAnalysis(req, res)
);

/**
 * GET /api/option-chain/multi/:symbols
 * Returns enhanced option chain for multiple symbols (comma-separated)
 * Example: /api/option-chain/multi/NIFTY,BANKNIFTY,SENSEX
 */
router.get('/option-chain/multi/:symbols', (req, res) =>
  optionChainController.getMultipleOptionChains(req, res)
);

module.exports = router;
