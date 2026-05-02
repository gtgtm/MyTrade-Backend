// src/testing/e2eTests.ts
// End-to-End Testing Suite - Signal generation through notification

import { SignalGenerator } from '../strategy/signalGenerator';
import { ExitManager } from '../services/exitManager';
import { PriceStreamManager } from '../services/priceStreamManager';
import { NotificationService } from '../services/notificationService';

/**
 * E2E Test Flow:
 * 1. Generate signal from OHLCV data
 * 2. Register signal in exit manager
 * 3. Process price updates (price stream)
 * 4. Detect target hits
 * 5. Verify notifications fired
 * 6. Check SL progression
 * 7. Validate final outcome
 */

export interface E2ETestScenario {
  name: string;
  description: string;
  setup: () => void;
  execute: () => Promise<void>;
  verify: () => void;
}

export class E2ETestSuite {
  private signalGenerator: SignalGenerator;
  private exitManager: ExitManager;
  private priceStreamManager: PriceStreamManager;
  private notificationService: NotificationService;
  private firedNotifications: Array<{ type: string; data: any }> = [];

  constructor() {
    this.signalGenerator = new SignalGenerator();
    this.exitManager = new ExitManager();
    this.priceStreamManager = new PriceStreamManager();
    this.notificationService = new NotificationService();

    // Intercept notifications for verification
    this.priceStreamManager.on('target:hit', (event) => {
      this.firedNotifications.push({ type: 'target:hit', data: event });
    });

    this.priceStreamManager.on('stopLoss:hit', (event) => {
      this.firedNotifications.push({ type: 'stopLoss:hit', data: event });
    });

    this.priceStreamManager.on('signal:completed', (event) => {
      this.firedNotifications.push({ type: 'signal:completed', data: event });
    });
  }

  // MARK: - Test Scenarios

  async runAllTests(): Promise<E2ETestResult[]> {
    const scenarios = this.createScenarios();
    const results: E2ETestResult[] = [];

    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario);
      results.push(result);
      console.log(`${result.passed ? '✅' : '❌'} ${scenario.name}`);
    }

    return results;
  }

  private createScenarios(): E2ETestScenario[] {
    return [
      this.scenarioT1Hit(),
      this.scenarioT2Hit(),
      this.scenarioStopLossHit(),
      this.scenarioMultipleTargets(),
      this.scenarioSLProgression(),
      this.scenarioExpiredSignal(),
    ];
  }

  private scenarioT1Hit(): E2ETestScenario {
    return {
      name: 'Signal Generation → T1 Hit → Notification',
      description: 'Generate signal, process price tick hitting T1, verify notification',
      setup: () => {
        this.firedNotifications = [];
      },
      execute: async () => {
        // Generate signal
        const ohlcv = {
          timestamp: new Date(),
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50050,
          volume: 1000000,
        };

        const signal = this.signalGenerator.generateSignal(ohlcv, 'BTCUSDT', 'CRYPTO');
        if (!signal) throw new Error('Signal generation failed');

        // Register in exit manager
        this.exitManager.registerSignal(signal);

        // Process price tick that hits T1
        const t1Price = signal.targets[0].price;
        const priceTick = {
          symbol: 'BTCUSDT',
          timestamp: new Date(),
          open: t1Price,
          high: t1Price + 10,
          low: t1Price - 10,
          close: t1Price,
          volume: 500000,
        };

        const outcome = this.exitManager.processPriceTick(signal.id, priceTick);
        if (!outcome) throw new Error('Price tick processing failed');

        // Send notifications
        if (outcome.targetHits.t1) {
          this.notificationService.notifyTargetHit(signal, 1, outcome.targetHits.t1Price!);
        }
      },
      verify: () => {
        const targetHitNotif = this.firedNotifications.find((n) => n.type === 'target:hit');
        if (!targetHitNotif) throw new Error('T1 hit notification not fired');
        if (targetHitNotif.data.level !== 1) throw new Error('Wrong target level');
      },
    };
  }

  private scenarioT2Hit(): E2ETestScenario {
    return {
      name: 'T1 Hit → SL Update → T2 Hit',
      description: 'Verify SL moves to breakeven on T1, then detect T2',
      setup: () => {
        this.firedNotifications = [];
      },
      execute: async () => {
        const ohlcv = {
          timestamp: new Date(),
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50050,
          volume: 1000000,
        };

        const signal = this.signalGenerator.generateSignal(ohlcv, 'BTCUSDT', 'CRYPTO');
        if (!signal) throw new Error('Signal generation failed');

        const initialSL = signal.stopLoss.current;

        // Hit T1
        this.exitManager.registerSignal(signal);
        let priceTick = {
          symbol: 'BTCUSDT',
          timestamp: new Date(),
          open: signal.targets[0].price,
          high: signal.targets[0].price + 10,
          low: signal.targets[0].price - 10,
          close: signal.targets[0].price,
          volume: 500000,
        };

        let outcome = this.exitManager.processPriceTick(signal.id, priceTick);
        if (!outcome || !outcome.targetHits.t1) throw new Error('T1 hit failed');

        // Verify SL moved to breakeven
        const updatedSignal = this.exitManager.getSignalOutcome(signal.id);
        if (!updatedSignal) throw new Error('Signal not found after T1');

        const slAfterT1 = updatedSignal.signalSnapshot.stopLoss.current;
        if (Math.abs(slAfterT1 - signal.entry.price) > 0.01) {
          throw new Error(`SL not at breakeven. Expected ${signal.entry.price}, got ${slAfterT1}`);
        }

        // Hit T2
        priceTick = {
          symbol: 'BTCUSDT',
          timestamp: new Date(),
          open: signal.targets[1].price,
          high: signal.targets[1].price + 10,
          low: signal.targets[1].price - 10,
          close: signal.targets[1].price,
          volume: 500000,
        };

        outcome = this.exitManager.processPriceTick(signal.id, priceTick);
        if (!outcome || !outcome.targetHits.t2) throw new Error('T2 hit failed');
      },
      verify: () => {
        const t1Notif = this.firedNotifications.find((n) => n.type === 'target:hit' && n.data.level === 1);
        const t2Notif = this.firedNotifications.find((n) => n.type === 'target:hit' && n.data.level === 2);

        if (!t1Notif) throw new Error('T1 notification missing');
        if (!t2Notif) throw new Error('T2 notification missing');
      },
    };
  }

  private scenarioStopLossHit(): E2ETestScenario {
    return {
      name: 'Price Hit SL → Signal Exited',
      description: 'Process price that hits stop loss, verify signal completion',
      setup: () => {
        this.firedNotifications = [];
      },
      execute: async () => {
        const ohlcv = {
          timestamp: new Date(),
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50050,
          volume: 1000000,
        };

        const signal = this.signalGenerator.generateSignal(ohlcv, 'BTCUSDT', 'CRYPTO');
        if (!signal) throw new Error('Signal generation failed');

        this.exitManager.registerSignal(signal);

        // Hit SL
        const priceTick = {
          symbol: 'BTCUSDT',
          timestamp: new Date(),
          open: signal.stopLoss.initial,
          high: signal.stopLoss.initial,
          low: signal.stopLoss.initial - 10,
          close: signal.stopLoss.initial - 5,
          volume: 500000,
        };

        const outcome = this.exitManager.processPriceTick(signal.id, priceTick);
        if (!outcome || !outcome.slHit) throw new Error('SL hit not detected');
      },
      verify: () => {
        const slHitNotif = this.firedNotifications.find((n) => n.type === 'stopLoss:hit');
        if (!slHitNotif) throw new Error('SL hit notification not fired');
      },
    };
  }

  private scenarioMultipleTargets(): E2ETestScenario {
    return {
      name: 'Hit All 4 Targets → Signal Complete',
      description: 'Process price through all 4 targets in sequence',
      setup: () => {
        this.firedNotifications = [];
      },
      execute: async () => {
        const ohlcv = {
          timestamp: new Date(),
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50050,
          volume: 1000000,
        };

        const signal = this.signalGenerator.generateSignal(ohlcv, 'BTCUSDT', 'CRYPTO');
        if (!signal) throw new Error('Signal generation failed');

        this.exitManager.registerSignal(signal);

        // Hit each target in sequence
        for (let level = 1; level <= 4; level++) {
          const targetPrice = signal.targets[level - 1].price;
          const priceTick = {
            symbol: 'BTCUSDT',
            timestamp: new Date(),
            open: targetPrice,
            high: targetPrice + 10,
            low: targetPrice - 10,
            close: targetPrice,
            volume: 500000,
          };

          const outcome = this.exitManager.processPriceTick(signal.id, priceTick);
          if (!outcome) throw new Error(`Failed to process target ${level}`);
        }
      },
      verify: () => {
        const targetNotifs = this.firedNotifications.filter((n) => n.type === 'target:hit');
        if (targetNotifs.length !== 4) throw new Error(`Expected 4 target hits, got ${targetNotifs.length}`);

        for (let i = 0; i < 4; i++) {
          if (targetNotifs[i].data.level !== i + 1) {
            throw new Error(`Target ${i + 1} missing from notifications`);
          }
        }
      },
    };
  }

  private scenarioSLProgression(): E2ETestScenario {
    return {
      name: 'SL Progression: BE → T1 → T2',
      description: 'Verify SL updates correctly with each target hit',
      setup: () => {
        this.firedNotifications = [];
      },
      execute: async () => {
        const ohlcv = {
          timestamp: new Date(),
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50050,
          volume: 1000000,
        };

        const signal = this.signalGenerator.generateSignal(ohlcv, 'BTCUSDT', 'CRYPTO');
        if (!signal) throw new Error('Signal generation failed');

        const t1Price = signal.targets[0].price;
        const t2Price = signal.targets[1].price;
        const entryPrice = signal.entry.price;

        this.exitManager.registerSignal(signal);

        // Hit T1 → SL should move to breakeven
        let priceTick = {
          symbol: 'BTCUSDT',
          timestamp: new Date(),
          open: t1Price,
          high: t1Price + 10,
          low: t1Price - 10,
          close: t1Price,
          volume: 500000,
        };

        this.exitManager.processPriceTick(signal.id, priceTick);
        let outcome = this.exitManager.getSignalOutcome(signal.id);
        const slAfterT1 = outcome?.signalSnapshot.stopLoss.current;
        if (Math.abs(slAfterT1! - entryPrice) > 0.01) {
          throw new Error('SL not at breakeven after T1');
        }

        // Hit T2 → SL should move to T1 price
        priceTick = {
          symbol: 'BTCUSDT',
          timestamp: new Date(),
          open: t2Price,
          high: t2Price + 10,
          low: t2Price - 10,
          close: t2Price,
          volume: 500000,
        };

        this.exitManager.processPriceTick(signal.id, priceTick);
        outcome = this.exitManager.getSignalOutcome(signal.id);
        const slAfterT2 = outcome?.signalSnapshot.stopLoss.current;
        if (Math.abs(slAfterT2! - t1Price) > 0.01) {
          throw new Error(`SL not at T1 price after T2. Expected ${t1Price}, got ${slAfterT2}`);
        }
      },
      verify: () => {
        // Verify SL history recorded
        const outcome = Array.from(this.exitManager.getCompletedSignals())[0];
        if (!outcome) throw new Error('No completed signal found');
        if (outcome.slHistory.length < 2) throw new Error('SL history not recorded');
      },
    };
  }

  private scenarioExpiredSignal(): E2ETestScenario {
    return {
      name: 'Signal Expires → Automatic Exit',
      description: 'Verify expired signal is closed automatically',
      setup: () => {
        this.firedNotifications = [];
      },
      execute: async () => {
        const ohlcv = {
          timestamp: new Date(),
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50050,
          volume: 1000000,
        };

        let signal = this.signalGenerator.generateSignal(ohlcv, 'BTCUSDT', 'CRYPTO');
        if (!signal) throw new Error('Signal generation failed');

        // Force expiration by setting expiresAt to past
        signal.expiresAt = new Date(Date.now() - 1000);

        this.exitManager.registerSignal(signal);

        // Check if signal is still active (should be auto-exited)
        const outcome = this.exitManager.getSignalOutcome(signal.id);
        if (outcome && outcome.exitReason !== 'EXPIRED') {
          throw new Error('Expired signal not automatically exited');
        }
      },
      verify: () => {
        // Verify signal moved to completed
        const completed = this.exitManager.getCompletedSignals();
        if (completed.length === 0) throw new Error('No completed signals found');
      },
    };
  }

  // MARK: - Test Execution

  private async runScenario(scenario: E2ETestScenario): Promise<E2ETestResult> {
    try {
      scenario.setup();
      await scenario.execute();
      scenario.verify();

      return {
        name: scenario.name,
        passed: true,
        error: null,
        duration: 0,
      };
    } catch (error) {
      return {
        name: scenario.name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }
}

export interface E2ETestResult {
  name: string;
  passed: boolean;
  error: string | null;
  duration: number;
}
