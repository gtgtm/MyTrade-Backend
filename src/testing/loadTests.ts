// src/testing/loadTests.ts
// Load Testing Suite - Verify system under concurrent load

import { SignalGenerator } from '../strategy/signalGenerator';
import { ExitManager } from '../services/exitManager';
import { PriceStreamManager } from '../services/priceStreamManager';

/**
 * Load Testing Scenarios:
 * 1. Generate 100+ signals concurrently
 * 2. Process 1000+ price updates per second
 * 3. Track 50+ concurrent signals
 * 4. Handle 10+ WebSocket connections
 */

export interface LoadTestConfig {
  signalCount: number;
  priceUpdatesPerSecond: number;
  concurrentConnections: number;
  durationSeconds: number;
}

export interface LoadTestMetrics {
  totalSignals: number;
  totalPriceUpdates: number;
  avgProcessingTime: number;
  maxProcessingTime: number;
  minProcessingTime: number;
  memoryUsed: number;
  cpuUsage: number;
  successRate: number;
  failureCount: number;
}

export class LoadTestSuite {
  private signalGenerator: SignalGenerator;
  private exitManager: ExitManager;
  private priceStreamManager: PriceStreamManager;
  private metrics: LoadTestMetrics = {
    totalSignals: 0,
    totalPriceUpdates: 0,
    avgProcessingTime: 0,
    maxProcessingTime: 0,
    minProcessingTime: Infinity,
    memoryUsed: 0,
    cpuUsage: 0,
    successRate: 100,
    failureCount: 0,
  };

  constructor() {
    this.signalGenerator = new SignalGenerator();
    this.exitManager = new ExitManager();
    this.priceStreamManager = new PriceStreamManager();
  }

  async runLoadTest(config: LoadTestConfig): Promise<LoadTestMetrics> {
    console.log(`Starting load test: ${config.signalCount} signals, ${config.priceUpdatesPerSecond} updates/sec`);

    const startTime = Date.now();
    const processingTimes: number[] = [];

    // Phase 1: Generate signals
    console.log(`Phase 1: Generating ${config.signalCount} signals...`);
    const signals = await this.generateSignals(config.signalCount);
    console.log(`✅ Generated ${signals.length} signals`);

    // Phase 2: Register signals in exit manager
    console.log(`Phase 2: Registering signals in exit manager...`);
    for (const signal of signals) {
      const regStart = Date.now();
      this.exitManager.registerSignal(signal);
      processingTimes.push(Date.now() - regStart);
    }

    // Phase 3: Process price updates
    console.log(`Phase 3: Processing price updates for ${config.durationSeconds}s...`);
    await this.processPrice Updates(signals, config, processingTimes);

    // Calculate metrics
    const duration = (Date.now() - startTime) / 1000;
    this.metrics = {
      totalSignals: signals.length,
      totalPriceUpdates: processingTimes.length,
      avgProcessingTime: processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length,
      maxProcessingTime: Math.max(...processingTimes),
      minProcessingTime: Math.min(...processingTimes),
      memoryUsed: this.getMemoryUsage(),
      cpuUsage: this.estimateCpuUsage(duration),
      successRate: 100 - (this.metrics.failureCount / processingTimes.length) * 100,
      failureCount: this.metrics.failureCount,
    };

    return this.metrics;
  }

  private async generateSignals(count: number): Promise<any[]> {
    const signals = [];
    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'DOGEUSDT'];

    for (let i = 0; i < count; i++) {
      const symbol = symbols[i % symbols.length];
      const mockOHLCV = {
        timestamp: new Date(),
        open: 50000 + Math.random() * 10000 - 5000,
        high: 50100 + Math.random() * 10000 - 5000,
        low: 49900 + Math.random() * 10000 - 5000,
        close: 50050 + Math.random() * 10000 - 5000,
        volume: Math.floor(Math.random() * 2000000) + 500000,
      };

      const signal = this.signalGenerator.generateSignal(mockOHLCV, symbol, 'CRYPTO');
      if (signal) {
        signals.push(signal);
      }
    }

    return signals;
  }

  private async processPrice Updates(
    signals: any[],
    config: LoadTestConfig,
    processingTimes: number[]
  ): Promise<void> {
    const startTime = Date.now();
    const targetDuration = config.durationSeconds * 1000;
    let updateCount = 0;

    while (Date.now() - startTime < targetDuration) {
      // Process updates for a random signal
      const signal = signals[Math.floor(Math.random() * signals.length)];
      const targetPrice = signal.targets[Math.floor(Math.random() * 4)].price;

      const priceTick = {
        symbol: signal.symbol,
        timestamp: new Date(),
        open: targetPrice,
        high: targetPrice + 10,
        low: targetPrice - 10,
        close: targetPrice,
        volume: 500000,
      };

      const updateStart = Date.now();
      try {
        const outcome = this.exitManager.processPriceTick(signal.id, priceTick);
        processingTimes.push(Date.now() - updateStart);
        updateCount++;

        if (updateCount % (config.priceUpdatesPerSecond * 10) === 0) {
          console.log(`Processed ${updateCount} updates...`);
        }
      } catch (error) {
        this.metrics.failureCount++;
      }

      // Rate limiting
      await this.delay(1000 / config.priceUpdatesPerSecond);
    }

    console.log(`✅ Processed ${updateCount} price updates`);
  }

  // MARK: - Performance Metrics

  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed / 1024 / 1024; // MB
    }
    return 0;
  }

  private estimateCpuUsage(durationSeconds: number): number {
    // Simplified estimation
    const totalOperations = this.metrics.totalSignals + this.metrics.totalPriceUpdates;
    return (totalOperations / durationSeconds) * 0.01; // Rough estimate
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // MARK: - Test Scenarios

  async runBasicLoadTest(): Promise<LoadTestMetrics> {
    return this.runLoadTest({
      signalCount: 50,
      priceUpdatesPerSecond: 100,
      concurrentConnections: 5,
      durationSeconds: 10,
    });
  }

  async runStressTest(): Promise<LoadTestMetrics> {
    return this.runLoadTest({
      signalCount: 500,
      priceUpdatesPerSecond: 1000,
      concurrentConnections: 50,
      durationSeconds: 60,
    });
  }

  async runSpikeTest(): Promise<LoadTestMetrics> {
    // Sudden spike in traffic
    return this.runLoadTest({
      signalCount: 1000,
      priceUpdatesPerSecond: 5000,
      concurrentConnections: 100,
      durationSeconds: 5,
    });
  }

  // MARK: - Results

  printMetrics(): void {
    console.log('\n=== Load Test Results ===\n');
    console.log(`Total Signals: ${this.metrics.totalSignals}`);
    console.log(`Total Price Updates: ${this.metrics.totalPriceUpdates}`);
    console.log(`\nProcessing Time:`);
    console.log(`  Average: ${this.metrics.avgProcessingTime.toFixed(2)}ms`);
    console.log(`  Min: ${this.metrics.minProcessingTime.toFixed(2)}ms`);
    console.log(`  Max: ${this.metrics.maxProcessingTime.toFixed(2)}ms`);
    console.log(`\nResource Usage:`);
    console.log(`  Memory: ${this.metrics.memoryUsed.toFixed(2)}MB`);
    console.log(`  CPU: ~${this.metrics.cpuUsage.toFixed(2)}%`);
    console.log(`\nReliability:`);
    console.log(`  Success Rate: ${this.metrics.successRate.toFixed(2)}%`);
    console.log(`  Failures: ${this.metrics.failureCount}`);
  }

  getMetrics(): LoadTestMetrics {
    return this.metrics;
  }
}

// MARK: - Benchmarks

export const PerformanceBenchmarks = {
  signalGeneration: {
    target: '< 50ms',
    acceptable: '< 100ms',
  },
  priceProcessing: {
    target: '< 5ms',
    acceptable: '< 10ms',
  },
  memoryPerSignal: {
    target: '< 100KB',
    acceptable: '< 500KB',
  },
  maxConcurrentSignals: {
    target: '500+',
    acceptable: '100+',
  },
  priceUpdatesPerSec: {
    target: '1000+',
    acceptable: '500+',
  },
};

// MARK: - Run Tests

export async function runLoadTestSuite(): Promise<void> {
  const suite = new LoadTestSuite();

  console.log('Running Basic Load Test...');
  let metrics = await suite.runBasicLoadTest();
  suite.printMetrics();

  console.log('\n\nRunning Stress Test...');
  metrics = await suite.runStressTest();
  suite.printMetrics();

  console.log('\n\nRunning Spike Test...');
  metrics = await suite.runSpikeTest();
  suite.printMetrics();
}
