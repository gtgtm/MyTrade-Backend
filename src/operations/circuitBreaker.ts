// src/operations/circuitBreaker.ts
// Circuit Breaker Pattern - Prevent cascading failures with automatic fallback

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing recovery
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes before closing (in half-open)
  timeout: number; // Timeout in ms before retrying (half-open -> closed)
  monitoringWindow: number; // Window for counting failures (ms)
}

export interface BreakEvent {
  timestamp: Date;
  state: CircuitState;
  failureCount?: number;
  successCount?: number;
  reason?: string;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: Date | null = null;
  private stateChangedAt: Date = new Date();
  private events: BreakEvent[] = [];
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 3,
      timeout: config.timeout || 60000, // 60 seconds
      monitoringWindow: config.monitoringWindow || 300000, // 5 minutes
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.setState(CircuitState.HALF_OPEN);
      } else {
        throw new Error(`Circuit breaker is OPEN. Failing fast to prevent cascading failures.`);
      }
    }

    try {
      const result = await fn();

      if (this.state === CircuitState.HALF_OPEN) {
        this.onSuccess();
      } else if (this.state === CircuitState.CLOSED) {
        this.resetFailureCount();
      }

      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.failureCount = 0;

    if (this.successCount >= this.config.successThreshold) {
      this.setState(CircuitState.CLOSED);
      this.successCount = 0;
    }
  }

  private onFailure(): void {
    this.lastFailureTime = new Date();
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.config.failureThreshold) {
      this.setState(CircuitState.OPEN);
    }
  }

  private resetFailureCount(): void {
    this.failureCount = 0;
    this.successCount = 0;
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;

    const elapsed = Date.now() - this.lastFailureTime.getTime();
    return elapsed >= this.config.timeout;
  }

  private setState(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangedAt = new Date();

    const event: BreakEvent = {
      timestamp: new Date(),
      state: newState,
      failureCount: this.failureCount,
      successCount: this.successCount,
      reason: `Transitioned from ${oldState} to ${newState}`,
    };

    this.events.push(event);
    if (this.events.length > 100) {
      this.events.shift();
    }

    const icon = this.getStateIcon(newState);
    console.log(`${icon} Circuit Breaker: ${oldState} → ${newState}`);
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    stateChangedAt: Date;
    uptime: number;
  } {
    const uptime = Date.now() - this.stateChangedAt.getTime();

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      stateChangedAt: this.stateChangedAt,
      uptime,
    };
  }

  getEvents(limit: number = 50): BreakEvent[] {
    return this.events.slice(-limit);
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.stateChangedAt = new Date();

    console.log('🔄 Circuit breaker reset');
  }

  private getStateIcon(state: CircuitState): string {
    switch (state) {
      case CircuitState.CLOSED:
        return '✅';
      case CircuitState.OPEN:
        return '🔴';
      case CircuitState.HALF_OPEN:
        return '🟡';
    }
  }
}

export class CircuitBreakerPool {
  private breakers: Map<string, CircuitBreaker> = new Map();

  createBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(config));
    }
    return this.breakers.get(name)!;
  }

  getBreaker(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  async execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const breaker = this.createBreaker(name);
    return breaker.execute(fn);
  }

  getHealthStatus(): { [key: string]: CircuitState } {
    const status: { [key: string]: CircuitState } = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getState();
    }
    return status;
  }

  getAllStats(): {
    [key: string]: {
      state: CircuitState;
      failureCount: number;
      successCount: number;
    };
  } {
    const stats: {
      [key: string]: {
        state: CircuitState;
        failureCount: number;
        successCount: number;
      };
    } = {};

    for (const [name, breaker] of this.breakers) {
      const breakerStats = breaker.getStats();
      stats[name] = {
        state: breakerStats.state,
        failureCount: breakerStats.failureCount,
        successCount: breakerStats.successCount,
      };
    }

    return stats;
  }

  resetBreaker(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    }
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  printStatus(): void {
    const health = this.getHealthStatus();

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║ CIRCUIT BREAKER STATUS                                 ║`);
    console.log(`║                                                        ║`);

    for (const [name, state] of Object.entries(health)) {
      const icon = state === CircuitState.CLOSED ? '✅' : state === CircuitState.OPEN ? '🔴' : '🟡';
      console.log(`║   ${icon} ${name.padEnd(44)} ${state.padEnd(7)} ║`);
    }

    console.log('╚════════════════════════════════════════════════════════╝\n');
  }
}

export default CircuitBreaker;
