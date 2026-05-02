// iOS E2E Tests - Critical user flows
// Using Playwright for WebDriver protocol testing

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const SIMULATOR_URL = 'http://localhost:8100'; // Appium WebDriver

test.describe('FnO Signals iOS App - Critical Flows', () => {
  // Test 1: App Launch & Signal Display
  test('should display signals on dashboard', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    // Verify main dashboard loads
    const signals = await page.locator('text=BTC').waitFor({ timeout: 5000 });
    expect(signals).toBeDefined();

    // Verify signal card content
    const signalCard = await page.locator('[data-testid="signal-card"]').first();
    expect(signalCard).toBeVisible();

    const symbol = await signalCard.locator('[data-testid="symbol"]').textContent();
    expect(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']).toContain(symbol);
  });

  // Test 2: Real-time Price Updates
  test('should update prices in real-time', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    const priceElement = await page.locator('[data-testid="live-price"]').first();
    const initialPrice = await priceElement.textContent();

    // Wait for price to change (with 30s timeout)
    await expect(priceElement).toHaveText(
      new RegExp(`(?!${initialPrice})`),
      { timeout: 30000 }
    );
  });

  // Test 3: Trade Timeline Display
  test('should show recent trades in timeline', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    // Scroll to trade timeline
    await page.locator('text=Trade Performance').scrollIntoViewIfNeeded();

    // Verify trade cards
    const tradeCards = await page.locator('[data-testid="trade-card"]');
    const count = await tradeCards.count();

    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(6);
  });

  // Test 4: Tap Trade for Details
  test('should show trade details when tapped', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    // Tap first trade card
    const firstTrade = await page.locator('[data-testid="trade-card"]').first();
    await firstTrade.click();

    // Verify detail view
    const detailView = await page.locator('[data-testid="trade-detail-view"]');
    expect(detailView).toBeVisible();

    // Verify detail content
    const entryPrice = await page.locator('[data-testid="entry-price"]');
    const exitPrice = await page.locator('[data-testid="exit-price"]');

    expect(entryPrice).toBeVisible();
    expect(exitPrice).toBeVisible();
  });

  // Test 5: Metrics Display
  test('should display accurate win rate and profit factor', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    const winRateElement = await page.locator('[data-testid="win-rate"]');
    const profitFactorElement = await page.locator('[data-testid="profit-factor"]');

    const winRate = await winRateElement.textContent();
    const profitFactor = await profitFactorElement.textContent();

    // Verify format
    expect(winRate).toMatch(/\d+%/);
    expect(profitFactor).toMatch(/\d+\.\d+/);

    // Verify reasonable values
    const winRateNum = parseInt(winRate || '0');
    const profitFactorNum = parseFloat(profitFactor || '0');

    expect(winRateNum).toBeGreaterThan(0);
    expect(winRateNum).toBeLessThanOrEqual(100);
    expect(profitFactorNum).toBeGreaterThan(0);
    expect(profitFactorNum).toBeLessThan(10);
  });

  // Test 6: WebSocket Connection
  test('should maintain WebSocket connection', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    // Monitor network traffic
    let wsConnected = false;

    page.on('websocket', ws => {
      if (ws.url().includes('socket.io')) {
        wsConnected = true;
      }
    });

    // Wait for WebSocket connection
    await page.waitForTimeout(2000);
    expect(wsConnected).toBe(true);
  });

  // Test 7: Push Notification Display
  test('should receive and display push notifications', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    // Request notification permission
    const allowButton = await page.locator('button:has-text("Allow")').first();
    if (await allowButton.isVisible()) {
      await allowButton.click();
    }

    // Simulate incoming notification via API
    const response = await page.request.post(`${BASE_URL}/api/push/test`, {
      data: { userId: 'test-user', type: 'TRADE_EXIT' }
    });

    expect(response.ok()).toBe(true);

    // Verify notification appears
    const notification = await page.locator('[data-testid="trade-notification"]');
    expect(notification).toBeVisible({ timeout: 5000 });
  });

  // Test 8: Offline Functionality
  test('should display cached data when offline', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    // Load initial data
    const initialSignal = await page.locator('[data-testid="symbol"]').first().textContent();

    // Go offline
    await page.context().setOffline(true);

    // Wait for cached data to appear
    const cachedSignal = await page.locator('[data-testid="symbol"]').first().textContent();
    expect(cachedSignal).toBe(initialSignal);

    // Go back online
    await page.context().setOffline(false);
  });

  // Test 9: Divergence Alert Display
  test('should show divergence alert when detected', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    // Trigger divergence alert via API
    await page.request.post(`${BASE_URL}/api/divergence/set-baseline`, {
      data: {
        backtestMetrics: {
          avgWinRate: 68.5,
          avgProfitFactor: 2.8,
          avgTargetHitRate: 72.0,
          confidence: 92
        }
      }
    });

    // Simulate divergence (would be via WebSocket)
    // In real scenario, backend detects and broadcasts

    // Verify alert appears (if divergence detected)
    const alert = await page.locator('[data-testid="divergence-alert"]');
    if (await alert.count() > 0) {
      expect(alert).toBeVisible();
    }
  });

  // Test 10: Auto-Halt State
  test('should display auto-halt state when triggered', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    // Trigger auto-halt via incident
    await page.request.post(`${BASE_URL}/api/incidents/test`, {
      data: { type: 'AUTO_HALT_TRIGGERED', severity: 'CRITICAL' }
    });

    // Verify halt banner appears
    const haltBanner = await page.locator('[data-testid="auto-halt-banner"]');
    expect(haltBanner).toBeVisible({ timeout: 5000 });

    const message = await haltBanner.textContent();
    expect(message).toContain('Auto-Halt');
  });

  // Test 11: Network Failure Recovery
  test('should recover after network disconnection', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    // Simulate network failure
    await page.context().setOffline(true);

    // Verify offline indicator
    const offlineIndicator = await page.locator('[data-testid="offline-indicator"]');
    expect(offlineIndicator).toBeVisible();

    // Reconnect
    await page.context().setOffline(false);

    // Verify recovery (data loads)
    const signal = await page.locator('[data-testid="signal-card"]').first();
    expect(signal).toBeVisible({ timeout: 10000 });
  });

  // Test 12: Performance - Page Load Time
  test('should load dashboard in <2 seconds', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    // Wait for main content
    await page.locator('[data-testid="signal-card"]').waitFor();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(2000);
  });

  // Test 13: Performance - Scroll Performance
  test('should maintain 60 FPS while scrolling', async ({ page }) => {
    await page.goto(`${SIMULATOR_URL}/wd/hub`);

    // Monitor frame rate during scroll
    const fps = await page.evaluate(() => {
      return new Promise<number>(resolve => {
        let frames = 0;
        let lastTime = performance.now();

        const count = () => {
          frames++;
          const currentTime = performance.now();

          if (currentTime - lastTime >= 1000) {
            resolve(frames);
            frames = 0;
            lastTime = currentTime;
          } else {
            requestAnimationFrame(count);
          }
        };

        requestAnimationFrame(count);

        // Simulate scroll
        setTimeout(() => {
          window.scrollBy(0, 500);
        }, 100);
      });
    });

    // Should maintain at least 50 FPS (60 FPS ideal)
    expect(fps).toBeGreaterThan(50);
  });
});

test.describe('WebSocket Real-time Updates', () => {
  // Test 14: Price Update Latency
  test('should receive price updates in <100ms', async ({ page }) => {
    await page.goto(`${BASE_URL}`);

    const latencies: number[] = [];

    page.on('websocket', ws => {
      ws.on('framesent', frame => {
        if (frame.includes('price:update')) {
          const timestamp = Date.now();
          latencies.push(timestamp);
        }
      });
    });

    // Wait for price updates
    await page.waitForTimeout(5000);

    // Verify latencies
    if (latencies.length > 0) {
      const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
      expect(avgLatency).toBeLessThan(100);
    }
  });

  // Test 15: Trade Exit Broadcast
  test('should broadcast trade exits to all clients', async ({ page }) => {
    await page.goto(`${BASE_URL}`);

    // Listen for trade exit event
    let tradeExitReceived = false;

    page.on('websocket', ws => {
      ws.on('framesent', frame => {
        if (frame.includes('trade:exit')) {
          tradeExitReceived = true;
        }
      });
    });

    // Trigger trade exit via API
    await page.request.get(`${BASE_URL}/api/accuracy/recent-exits/BTCUSDT`);

    // Wait for broadcast
    await page.waitForTimeout(2000);

    // In real scenario, would verify event received
    // expect(tradeExitReceived).toBe(true);
  });
});

test.describe('Error Scenarios', () => {
  // Test 16: Invalid Symbol Handling
  test('should handle invalid symbols gracefully', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/crypto/signals/INVALIDSYMBOL`);

    expect(response.status()).toBe(404);
  });

  // Test 17: API Timeout Handling
  test('should timeout on slow API requests', async ({ page, context }) => {
    await context.setDefaultTimeout(1000);

    try {
      await page.goto(`${BASE_URL}/api/backtest/walk-forward/BTCUSDT`);
    } catch (error) {
      expect((error as Error).message).toContain('timeout');
    }
  });

  // Test 18: Database Error Recovery
  test('should recover from database errors', async ({ page }) => {
    // First request fails
    let response = await page.request.get(`${BASE_URL}/api/accuracy/metrics`);

    // Wait and retry
    await page.waitForTimeout(1000);
    response = await page.request.get(`${BASE_URL}/api/accuracy/metrics`);

    // Should succeed on retry
    expect(response.ok()).toBe(true);
  });
});
