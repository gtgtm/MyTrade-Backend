import nseService from '../services/nseService.js';
import signalEngine from '../services/signalEngine.js';
import db from '../services/signalDatabase.js';
import LocalSignalFilter from '../services/localSignalFilter.js';

class SignalController {
  static async getSignal(req, res) {
    const { symbol } = req.params;

    if (!symbol || !['NIFTY', 'BANKNIFTY', 'SENSEX'].includes(symbol)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid symbol. Use NIFTY, BANKNIFTY, or SENSEX'
      });
    }

    try {
      // Check cache first
      const cacheKey = `signal_${symbol}`;
      const cached = global.cache.getFromCache(cacheKey);
      if (cached) {
        console.log(`📦 Cache hit for ${symbol}`);
        return res.json(cached);
      }

      let chainRows;
      try {
        chainRows = await nseService.fetchOptionChain(symbol);
      } catch (error) {
        console.warn(`Real data unavailable for ${symbol}, using mock`);
        chainRows = nseService.mockData(symbol);
      }

      // Wrap chain data with metadata needed by signalEngine
      const price = chainRows[0]?.underlyingValue || chainRows[0]?.price || 22300;
      const totalCallOI = chainRows.reduce((sum, row) => sum + (row.CE?.openInterest || 0), 0);
      const totalPutOI = chainRows.reduce((sum, row) => sum + (row.PE?.openInterest || 0), 0);
      const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 1.0;
      const maxPain = nseService.computeMaxPain(chainRows);
      const daysToExpiry = chainRows[0]?.expiryDate ? nseService.daysToExpiry(chainRows[0].expiryDate) : null;

      const chain = {
        symbol,
        price,
        pcr,
        callOI: totalCallOI,
        putOI: totalPutOI,
        maxPain,
        daysToExpiry,
        rows: chainRows,
        isMock: false
      };

      const signal = signalEngine.generate(chain, []);

      // [NEW] Filter signal locally using confluence analysis
      const filtered = LocalSignalFilter.filterSignal(signal);

      // Merge original signal with filtered analysis
      const enhancedSignal = {
        ...signal,
        // Add filtered results
        filteredConfidence: filtered.filteredConfidence,
        filterRecommendation: filtered.recommendation,
        filterQuality: filtered.quality,
        confirmations: filtered.confirmations,
        filterRationale: filtered.rationale,
        filterFactors: filtered.factors,
        actionGuidance: filtered.actionGuidance,
        breakdown: filtered.breakdown
      };

      // Save signal to database for tracking
      db.saveSignal(enhancedSignal);

      const response = {
        success: true,
        data: {
          ...enhancedSignal,
          chain: chainRows
        },
        isMock: chain.isMock,
        cached: false,
        timestamp: new Date().toISOString()
      };

      // Cache the response
      global.cache.setCache(cacheKey, response);

      res.json(response);
    } catch (error) {
      console.error(`Error in getSignal for ${symbol}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate signal',
        message: error.message
      });
    }
  }

  static async getSignals(req, res) {
    const symbols = ['NIFTY', 'BANKNIFTY', 'SENSEX'];

    try {
      // Check if all signals are cached
      const cacheKey = 'signals_all';
      const cached = global.cache.getFromCache(cacheKey);
      if (cached) {
        console.log('📦 Cache hit for all signals');
        return res.json(cached);
      }

      const signals = [];

      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            let chainRows;
            try {
              chainRows = await nseService.fetchOptionChain(symbol);
            } catch {
              chainRows = nseService.mockData(symbol);
            }

            // Wrap chain data with metadata needed by signalEngine
            const price = chainRows[0]?.underlyingValue || chainRows[0]?.price || 22300;
            const totalCallOI = chainRows.reduce((sum, row) => sum + (row.CE?.openInterest || 0), 0);
            const totalPutOI = chainRows.reduce((sum, row) => sum + (row.PE?.openInterest || 0), 0);
            const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 1.0;
            const maxPain = nseService.computeMaxPain(chainRows);
            const daysToExpiry = chainRows[0]?.expiryDate ? nseService.daysToExpiry(chainRows[0].expiryDate) : null;

            const chain = {
              symbol,
              price,
              pcr,
              callOI: totalCallOI,
              putOI: totalPutOI,
              maxPain,
              daysToExpiry,
              rows: chainRows,
              isMock: false
            };

            const signal = signalEngine.generate(chain, []);

            // [NEW] Filter signal locally
            const filtered = LocalSignalFilter.filterSignal(signal);

            const enhancedSignal = {
              ...signal,
              filteredConfidence: filtered.filteredConfidence,
              filterRecommendation: filtered.recommendation,
              filterQuality: filtered.quality,
              confirmations: filtered.confirmations
            };

            // Save signal to database
            db.saveSignal(enhancedSignal);

            signals.push({
              symbol,
              ...enhancedSignal,
              chain: chainRows,
              isMock: chain.isMock
            });
          } catch (error) {
            console.error(`Error fetching ${symbol}:`, error);
          }
        })
      );

      const response = {
        success: true,
        data: signals,
        count: signals.length,
        cached: false,
        timestamp: new Date().toISOString()
      };

      // Cache the response
      global.cache.setCache(cacheKey, response);

      res.json(response);
    } catch (error) {
      console.error('Error in getSignals:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch signals'
      });
    }
  }

  static async healthCheck(req, res) {
    res.json({
      success: true,
      message: 'FnO Signals Backend is running',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }

  static async getQuote(req, res) {
    const { symbol } = req.params;

    if (!symbol || !['NIFTY', 'BANKNIFTY', 'SENSEX'].includes(symbol)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid symbol. Use NIFTY, BANKNIFTY, or SENSEX'
      });
    }

    try {
      let chainRows;
      try {
        chainRows = await nseService.fetchOptionChain(symbol);
      } catch (error) {
        console.warn(`Real data unavailable for ${symbol}, using mock`);
        chainRows = nseService.mockData(symbol);
      }

      const price = chainRows[0]?.underlyingValue || chainRows[0]?.price || 22300;

      res.json({
        success: true,
        price,
        symbol,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Error in getQuote for ${symbol}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch quote',
        message: error.message
      });
    }
  }
}

export default SignalController;
