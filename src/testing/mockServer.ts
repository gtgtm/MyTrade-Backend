// src/testing/mockServer.ts
// Mock Backend Server for iOS Testing

import * as http from 'http';
import * as WebSocket from 'ws';
import { SignalV2 } from '../types/signal';
import { SignalGenerator } from '../strategy/signalGenerator';

/**
 * Mock server provides:
 * - REST API endpoints for signal fetching
 * - WebSocket connection for price streams
 * - Configurable price movements
 * - Simulated signal generation
 */

export interface MockServerConfig {
  port: number;
  enablePriceStream: boolean;
  priceUpdateInterval: number; // ms
  simulatedPrices?: Record<string, number>;
}

export class MockServer {
  private server: http.Server;
  private wss: WebSocket.Server;
  private signalGenerator: SignalGenerator;
  private mockSignals: Map<string, SignalV2> = new Map();
  private priceStreams: Map<string, NodeJS.Timer> = new Map();
  private simulatedPrices: Record<string, number> = {};

  constructor(private config: MockServerConfig) {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.wss = new WebSocket.Server({ server: this.server });
    this.signalGenerator = new SignalGenerator();
    this.simulatedPrices = config.simulatedPrices || {};

    this.wss.on('connection', (ws) => this.handleWebSocket(ws));
  }

  // MARK: - Server Lifecycle

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, () => {
        console.log(`Mock server listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Stop all price streams
      for (const timer of this.priceStreams.values()) {
        clearInterval(timer);
      }
      this.priceStreams.clear();

      // Close WebSocket server
      this.wss.close(() => {
        // Close HTTP server
        this.server.close(() => {
          console.log('Mock server stopped');
          resolve();
        });
      });
    });
  }

  // MARK: - HTTP Request Handling

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = req.url || '';

    // GET /api/signals/active
    if (req.method === 'GET' && url === '/api/signals/active') {
      this.handleGetActiveSignals(res);
      return;
    }

    // GET /api/signals/:id
    if (req.method === 'GET' && url.startsWith('/api/signals/')) {
      const signalId = url.split('/').pop();
      this.handleGetSignal(signalId!, res);
      return;
    }

    // PATCH /api/signals/:id/status
    if (req.method === 'PATCH' && url.includes('/status')) {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => this.handleUpdateSignalStatus(body, res));
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private handleGetActiveSignals(res: http.ServerResponse): void {
    // Return mock signals from cache
    const signals = Array.from(this.mockSignals.values());
    const response = {
      success: true,
      data: signals,
      error: null,
    };
    res.writeHead(200);
    res.end(JSON.stringify(response));
  }

  private handleGetSignal(signalId: string, res: http.ServerResponse): void {
    const signal = this.mockSignals.get(signalId);

    if (!signal) {
      // Generate new mock signal
      const mockOHLCV = {
        timestamp: new Date(),
        open: 50000,
        high: 50100,
        low: 49900,
        close: 50050,
        volume: 1000000,
      };

      const generated = this.signalGenerator.generateSignal(mockOHLCV, 'BTCUSDT', 'CRYPTO');

      if (!generated) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Signal not found' }));
        return;
      }

      this.mockSignals.set(signalId, generated);
      res.writeHead(200);
      res.end(JSON.stringify(generated));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify(signal));
  }

  private handleUpdateSignalStatus(body: string, res: http.ServerResponse): void {
    try {
      const data = JSON.parse(body);
      // Just acknowledge the update
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid request' }));
    }
  }

  // MARK: - WebSocket Handling

  private handleWebSocket(ws: WebSocket.WebSocket): void {
    const symbol = 'BTCUSDT'; // Default symbol
    console.log(`Client connected, starting price stream for ${symbol}`);

    if (!this.config.enablePriceStream) {
      ws.close(1000, 'Price streaming disabled');
      return;
    }

    // Start sending price updates
    const timer = setInterval(() => {
      this.sendPriceUpdate(ws, symbol);
    }, this.config.priceUpdateInterval);

    ws.on('close', () => {
      clearInterval(timer);
      this.priceStreams.delete(symbol);
      console.log(`Client disconnected from ${symbol}`);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clearInterval(timer);
    });
  }

  private sendPriceUpdate(ws: WebSocket.WebSocket, symbol: string): void {
    // Simulate price movement (±0.5% random walk)
    const basePrice = this.simulatedPrices[symbol] || 50000;
    const change = (Math.random() - 0.5) * 250; // ±250
    const newPrice = basePrice + change;
    this.simulatedPrices[symbol] = newPrice;

    const priceUpdate = {
      symbol,
      timestamp: new Date().toISOString(),
      open: newPrice - 25,
      high: newPrice + 50,
      low: newPrice - 50,
      close: newPrice,
      volume: Math.floor(Math.random() * 1000000) + 500000,
    };

    try {
      ws.send(JSON.stringify(priceUpdate));
    } catch (error) {
      console.error('Failed to send price update:', error);
    }
  }

  // MARK: - Mock Data Generation

  generateMockSignal(symbol: string = 'BTCUSDT'): SignalV2 | null {
    const mockOHLCV = {
      timestamp: new Date(),
      open: 50000 + Math.random() * 1000 - 500,
      high: 50100 + Math.random() * 1000 - 500,
      low: 49900 + Math.random() * 1000 - 500,
      close: 50050 + Math.random() * 1000 - 500,
      volume: Math.floor(Math.random() * 2000000) + 500000,
    };

    const signal = this.signalGenerator.generateSignal(mockOHLCV, symbol, 'CRYPTO');

    if (signal) {
      this.mockSignals.set(signal.id, signal);
    }

    return signal;
  }

  addMockSignal(signal: SignalV2): void {
    this.mockSignals.set(signal.id, signal);
  }

  getStoredSignals(): SignalV2[] {
    return Array.from(this.mockSignals.values());
  }

  simulatePrice(symbol: string, price: number): void {
    this.simulatedPrices[symbol] = price;
  }
}

// MARK: - Helper Functions

export async function createMockServer(port: number = 3001): Promise<MockServer> {
  const server = new MockServer({
    port,
    enablePriceStream: true,
    priceUpdateInterval: 1000,
    simulatedPrices: {
      BTCUSDT: 50000,
      ETHUSDT: 3000,
    },
  });

  await server.start();
  return server;
}

export async function testMockServer(): Promise<void> {
  const server = await createMockServer(3001);

  console.log('Mock server started. Testing endpoints...');

  // Test REST API
  try {
    const response = await fetch('http://localhost:3001/api/signals/active');
    const data = await response.json();
    console.log('✅ REST API working:', data.success);
  } catch (error) {
    console.error('❌ REST API failed:', error);
  }

  // Test WebSocket
  try {
    const ws = new WebSocket('ws://localhost:3001');

    ws.onopen = () => {
      console.log('✅ WebSocket connected');
    };

    ws.onmessage = (event) => {
      const priceUpdate = JSON.parse(event.data);
      console.log('✅ Price update received:', priceUpdate.symbol, priceUpdate.close);
      ws.close();
      setTimeout(() => server.stop(), 100);
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket failed:', error);
      server.stop();
    };
  } catch (error) {
    console.error('❌ WebSocket test failed:', error);
    await server.stop();
  }
}
