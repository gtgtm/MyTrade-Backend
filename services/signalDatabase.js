// Stub database service - will be implemented with better-sqlite3 later
// For now, we use memory caching in server.js

class SignalDatabase {
  constructor() {
    this.signals = [];
    this.outcomes = [];
    console.log('📦 Database initialized (stub mode)');
  }

  saveSignal(signal) {
    this.signals.push({ ...signal, savedAt: new Date() });
    return signal;
  }

  recordOutcome(signalId, outcome) {
    this.outcomes.push({ signalId, outcome, recordedAt: new Date() });
    return { success: true };
  }

  getStats(symbol) {
    const relevantSignals = symbol
      ? this.signals.filter(s => s.symbol === symbol)
      : this.signals;

    if (relevantSignals.length === 0) {
      return { signal: symbol || 'ALL', count: 0, accuracy: 0 };
    }

    return {
      signal: symbol || 'ALL',
      count: relevantSignals.length,
      accuracy: 0,
      message: 'Database stub - accuracy tracking coming soon'
    };
  }

  getSignalHistory(symbol, limit = 100) {
    const relevant = symbol
      ? this.signals.filter(s => s.symbol === symbol)
      : this.signals;
    return relevant.slice(-limit);
  }
}

export default new SignalDatabase();
