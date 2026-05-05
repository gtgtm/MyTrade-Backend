// v2.1.2 - Final redeploy - Entry/SL/Target fixes live
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import { createServer } from 'http';
import { Server } from 'socket.io';
import apiRoutes from './routes/api.js';
import PriceStreamer from './services/priceStreamer.js';
import SignalScheduler from './services/signalScheduler.js';
import ExitManager from './services/exitManager.js';
import DivergenceAnalyzer from './services/divergenceAnalyzer.js';
import IncidentManager from './services/incidentManager.js';
import RealtimeManager from './services/realtimeManager.js';
import PushNotificationManager from './services/pushNotificationManager.js';
import cronService from './services/cronService.js';
import cryptoService from './services/cryptoService.js';
import database from './services/database.js';
import signalMonitor from './services/signalMonitor.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const priceStreamer = new PriceStreamer(io);
const exitManager = new ExitManager(io);
const divergenceAnalyzer = new DivergenceAnalyzer(exitManager);
const incidentManager = new IncidentManager(io);
const realtimeManager = new RealtimeManager(io);
const pushNotificationManager = new PushNotificationManager();
const signalScheduler = new SignalScheduler(io, cryptoService, exitManager);

// Expose services globally for API access
global.exitManager = exitManager;
global.divergenceAnalyzer = divergenceAnalyzer;
global.incidentManager = incidentManager;
global.realtimeManager = realtimeManager;
global.pushNotificationManager = pushNotificationManager;

// Signal caching: 2 minutes TTL
const CACHE_TTL = parseInt(process.env.CACHE_DURATION) || 120000;
const signalCache = new Map();

const getFromCache = (key) => {
  const cached = signalCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    signalCache.delete(key);
    return null;
  }
  return cached.data;
};

const setCache = (key, data) => {
  signalCache.set(key, { data, timestamp: Date.now() });
};

global.cache = { getFromCache, setCache };

// Exit manager will be attached after instantiation
let exitManagerGlobal = null;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'FnO Signals Backend API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      allSignals: 'GET /api/signals',
      singleSignal: 'GET /api/signals/:symbol'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// WebSocket connection handlers with real-time + notification features
io.on('connection', (socket) => {
  const clientId = socket.id.substring(0, 8);
  console.log(`🔌 WebSocket client connected: ${clientId}`);
  priceStreamer.registerClient(clientId);

  // Send connection confirmation with enhanced data info
  socket.emit('connected', {
    message: 'Connected to real-time trading system',
    clientId,
    version: '3.0',
    features: {
      realTimePrices: true,
      liveTradeExits: true,
      divergenceAlerts: true,
      systemNotifications: true,
      pushNotifications: true,
      deepLinking: true
    },
    updateFrequency: {
      prices: '<100ms',
      tradeExits: 'instant',
      alerts: 'instant',
      latency: '<100ms'
    },
    timestamp: new Date().toISOString()
  });

  // Real-time subscription (Week 5)
  socket.on('subscribe:realtime', (data) => {
    const { symbols, userId } = data;
    if (Array.isArray(symbols)) {
      symbols.forEach(symbol => realtimeManager.subscribe(socket, symbol));
      console.log(`📊 Client ${clientId} subscribed to real-time: ${symbols.join(', ')}`);
      socket.emit('realtime:subscribed', {
        symbols,
        status: 'active',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Register device for push notifications
  socket.on('register:push', (data) => {
    const { userId, deviceToken, platform } = data;
    if (userId && deviceToken) {
      pushNotificationManager.registerDeviceToken(userId, deviceToken, platform);
      socket.emit('push:registered', {
        status: 'ok',
        platform,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle subscription to specific symbols (legacy)
  socket.on('subscribe', (data) => {
    const { symbols } = data;
    if (Array.isArray(symbols)) {
      console.log(`📊 Client ${clientId} subscribed to: ${symbols.join(', ')}`);
      socket.emit('subscribed', {
        symbols,
        status: 'active',
        timestamp: new Date().toISOString()
      });

      // Send initial data for subscribed symbols
      const initialData = {
        type: 'initial_data',
        symbols: symbols.map(symbol => priceStreamer.getSymbolData(symbol)),
        timestamp: new Date().toISOString()
      };
      socket.emit('symbol_data', initialData);
    }
  });

  // Handle request for specific symbol data
  socket.on('getSymbolData', (data) => {
    const { symbol } = data;
    if (symbol) {
      const symbolData = priceStreamer.getSymbolData(symbol);
      socket.emit('symbol_data', {
        type: 'single_symbol',
        data: symbolData,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle stats request
  socket.on('getStats', () => {
    socket.emit('stats', priceStreamer.getStats());
  });

  // Request real-time stats
  socket.on('realtime:stats', () => {
    socket.emit('realtime:stats', realtimeManager.getStats());
  });

  // Handle alert threshold configuration
  socket.on('configureAlerts', (data) => {
    const { symbol, config } = data;
    socket.emit('alert_config', {
      symbol,
      config,
      status: 'configured',
      timestamp: new Date().toISOString()
    });
  });

  // Handle client disconnect
  socket.on('disconnect', () => {
    priceStreamer.unregisterClient(clientId);
    realtimeManager.handleDisconnect(socket.id);
    console.log(`🔌 Client disconnected: ${clientId}`);
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error(`❌ WebSocket error for ${clientId}:`, error);
  });
});

// Initialize database tables on startup
if (database.isConnected) {
  try {
    await database.initializeTables();
    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('⚠️  Database initialization warning:', err.message);
    // Continue anyway - might already be initialized
  }
}

// Start price streaming
priceStreamer.startStreaming();

// Start signal scheduler (generates signals every 5/15/60/240 minutes)
signalScheduler.startScheduler();

// Start exit tracking updates (check prices every 10 seconds)
setInterval(async () => {
  if (exitManager.activeSignals.size > 0) {
    // Get symbols from active signals
    const symbols = new Set();
    for (const signal of exitManager.activeSignals.values()) {
      symbols.add(signal.symbol);
    }

    // Fetch current prices
    for (const symbol of symbols) {
      try {
        const ticker = await cryptoService.fetchTicker(symbol);
        if (ticker) {
          // Update all active signals for this symbol
          for (const [signalId, activeSignal] of exitManager.activeSignals) {
            if (activeSignal.symbol === symbol) {
              exitManager.updateSignalPrice(signalId, ticker.price, ticker);
            }
          }
        }
      } catch (err) {
        // Silently fail on individual symbol updates
      }
    }
  }
}, 10000); // Check every 10 seconds

// Start scheduled background jobs (historical data cleanup, daily stats, etc.)
cronService.startAll();

// Start background signal monitoring (check every 5 minutes for high-score signals)
signalMonitor.startMonitoring();

// Start server - listen on all network interfaces
httpServer.listen(PORT, '0.0.0.0', () => {
  const localIP = os.networkInterfaces();
  let ipAddress = 'localhost';

  for (const name of Object.keys(localIP)) {
    for (const iface of localIP[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipAddress = iface.address;
        break;
      }
    }
  }

  console.log(`✅ FnO Signals Backend running on http://${ipAddress}:${PORT}`);
  console.log(`📚 API Docs: http://${ipAddress}:${PORT}/`);
  console.log(`🌐 Network accessible at: http://${ipAddress}:${PORT}`);
  console.log(`🔌 WebSocket available at ws://${ipAddress}:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📛 SIGTERM received, shutting down gracefully...');
  await signalScheduler.close();
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('📛 SIGINT received, shutting down gracefully...');
  await signalScheduler.close();
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
