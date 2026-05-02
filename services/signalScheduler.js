import cron from 'node-cron';
import { randomUUID } from 'crypto';
import CryptoService from './cryptoService.js';
import CryptoSignalEngine from './cryptoSignalEngine.js';
import ConfluenceScorer from './confluenceScorer.js';
import QualityFilter from './qualityFilter.js';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];
const TIMEFRAMES = {
  '5m': '*/5 * * * *',    // Every 5 minutes
  '15m': '*/15 * * * *',  // Every 15 minutes
  '1h': '0 * * * *',      // Every hour
  '4h': '0 */4 * * *'     // Every 4 hours
};

class SignalScheduler {
  constructor(io, cryptoService, exitManager = null) {
    this.io = io;
    this.cryptoService = cryptoService;
    this.exitManager = exitManager;
    this.jobs = [];
    this.isRunning = false;
    // Signals organized by symbol, then by timeframe for confluence scoring
    this.signalsBySymbol = new Map(); // symbol -> { '5m': signal, '15m': signal, ... }
    this.confluencedSignals = new Map(); // symbol -> confluenced signal (MTF)
    // Track recent signals for quality filter (e.g., prevent overtrading same symbol)
    this.recentSignals = []; // Keep last 100 signals for context
  }

  async startScheduler() {
    if (this.isRunning) {
      console.warn('⚠️ Scheduler already running');
      return;
    }

    console.log('🚀 Starting signal scheduler...');
    this.isRunning = true;

    for (const [timeframe, cronExpression] of Object.entries(TIMEFRAMES)) {
      const job = cron.schedule(cronExpression, async () => {
        await this.generateSignalsForTimeframe(timeframe);
      });
      this.jobs.push(job);
      console.log(`✅ Scheduled ${timeframe} signals: ${cronExpression}`);
    }
  }

  stopScheduler() {
    if (!this.isRunning) {
      console.warn('⚠️ Scheduler not running');
      return;
    }

    this.jobs.forEach(job => job.stop());
    this.isRunning = false;
    console.log('🛑 Signal scheduler stopped');
  }

  async generateSignalsForTimeframe(timeframe) {
    console.log(`📊 [${timeframe}] Generating signals for ${SYMBOLS.length} coins...`);

    const signals = [];
    const confluencedSignals = [];

    for (const symbol of SYMBOLS) {
      try {
        const { klines, ticker } = await this.cryptoService.fetchAll(symbol);

        if (!klines || !ticker) {
          console.warn(`⚠️ [${timeframe}] ${symbol}: No data`);
          continue;
        }

        // Generate signal using CryptoSignalEngine
        const signal = CryptoSignalEngine.generate(symbol, klines, ticker);

        // Enrich with timeframe
        signal.timeframe = timeframe;
        signal.id = randomUUID();

        // Store signal by symbol and timeframe
        if (!this.signalsBySymbol.has(symbol)) {
          this.signalsBySymbol.set(symbol, {});
        }
        this.signalsBySymbol.get(symbol)[timeframe] = signal;

        // Persist to storage
        await this.persistSignal(signal);
        signals.push(signal);

        // Evaluate confluence for this symbol
        const symbolSignals = this.signalsBySymbol.get(symbol);
        const confluence = ConfluenceScorer.scoreConfluence(symbolSignals);

        if (confluence.hasConfluence) {
          const confluencedSignal = ConfluenceScorer.mergeSignals(symbol, confluence);
          if (confluencedSignal) {
            confluencedSignal.id = randomUUID();
            this.confluencedSignals.set(symbol, confluencedSignal);
            confluencedSignals.push(confluencedSignal);
            console.log(
              `✨ [${timeframe}] ${symbol} CONFLUENCE: ${confluencedSignal.signalType} (${confluence.agreementCount}/${confluence.totalTimeframes} agree)`
            );
          }
        }

        console.log(`✅ [${timeframe}] ${symbol}: ${signal.signalType} (score: ${signal.score})`);
      } catch (err) {
        console.error(`❌ [${timeframe}] ${symbol}:`, err.message);
      }
    }

    // Emit timeframe-specific signals (after quality filtering)
    const qualityFiltered = signals.filter(signal => {
      const quality = QualityFilter.filterSignal(signal, {
        recentSignals: this.recentSignals
      });

      if (!quality.isValid) {
        console.log(`⚠️  [${timeframe}] ${signal.symbol} blocked: ${quality.blockReason}`);
      }

      return quality.isValid;
    });

    if (qualityFiltered.length > 0) {
      this.io.emit('signal:batch', {
        timeframe,
        count: qualityFiltered.length,
        signals: qualityFiltered,
        filtered: signals.length - qualityFiltered.length,
        timestamp: new Date().toISOString()
      });

      qualityFiltered.forEach(signal => {
        this.io.emit('signal:new', signal);
        this.recentSignals.push(signal);
        // Register with exit manager for tracking
        if (this.exitManager) {
          this.exitManager.registerSignal(signal);
        }
      });
    }

    // Trim recent signals to keep last 100
    if (this.recentSignals.length > 100) {
      this.recentSignals = this.recentSignals.slice(-100);
    }

    // Emit confluenced signals (higher confidence, cross-timeframe agreement)
    const confluenceFiltered = confluencedSignals.filter(signal => {
      const quality = QualityFilter.filterSignal(signal, {
        recentSignals: this.recentSignals
      });

      if (!quality.isValid) {
        console.log(`⚠️  [MTF] ${signal.symbol} confluence blocked: ${quality.blockReason}`);
      }

      return quality.isValid;
    });

    if (confluenceFiltered.length > 0) {
      this.io.emit('signal:confluence', {
        count: confluenceFiltered.length,
        signals: confluenceFiltered,
        timestamp: new Date().toISOString()
      });

      confluenceFiltered.forEach(signal => {
        this.io.emit('signal:high-confidence', signal);
        this.recentSignals.push(signal);
        // Register with exit manager for tracking
        if (this.exitManager) {
          this.exitManager.registerSignal(signal);
        }
      });
    }

    return { timeframeSignals: signals, confluencedSignals };
  }

  timeframeToInterval(timeframe) {
    const map = {
      '5m': '5m',
      '15m': '15m',
      '1h': '1h',
      '4h': '4h'
    };
    return map[timeframe] || '15m';
  }

  persistSignal(signal) {
    return Promise.resolve(signal.id);
  }

  getSignals(symbol = null, timeframe = null, limit = 100) {
    const results = [];

    for (const [sym, timeframeSignals] of this.signalsBySymbol) {
      if (symbol && sym !== symbol) continue;

      for (const [tf, signal] of Object.entries(timeframeSignals)) {
        if (timeframe && tf !== timeframe) continue;
        results.push(signal);
      }
    }

    return Promise.resolve(
      results
        .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt))
        .slice(0, limit)
    );
  }

  getConfluencedSignals(symbol = null, limit = 50) {
    const results = [];

    if (symbol) {
      const sig = this.confluencedSignals.get(symbol);
      if (sig) results.push(sig);
    } else {
      for (const signal of this.confluencedSignals.values()) {
        results.push(signal);
      }
    }

    return Promise.resolve(
      results
        .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt))
        .slice(0, limit)
    );
  }

  close() {
    this.stopScheduler();
    return Promise.resolve();
  }
}

export default SignalScheduler;
