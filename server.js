import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import { createServer } from 'http';
import { Server } from 'socket.io';
import apiRoutes from './routes/api.js';
import PriceStreamer from './services/priceStreamer.js';
import cronService from './services/cronService.js';

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

// WebSocket connection handlers with enhanced data
io.on('connection', (socket) => {
  const clientId = socket.id.substring(0, 8);
  console.log(`🔌 WebSocket client connected: ${clientId}`);
  priceStreamer.registerClient(clientId);

  // Send connection confirmation with enhanced data info
  socket.emit('connected', {
    message: 'Connected to enhanced price stream',
    clientId,
    version: '2.0',
    features: {
      realTimePrices: true,
      greeksCalculation: true,
      maxPainAnalysis: true,
      pcrAlerts: true,
      volatilitySkew: true
    },
    updateFrequency: {
      dataFetch: '5 seconds',
      clientBroadcast: '1 second',
      latency: '<100ms'
    },
    timestamp: new Date().toISOString()
  });

  // Handle subscription to specific symbols
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

  // Handle alert threshold configuration
  socket.on('configureAlerts', (data) => {
    const { symbol, config } = data;
    // In production, this would store user-specific alert preferences
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
    console.log(`🔌 Client disconnected: ${clientId}`);
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error(`❌ WebSocket error for ${clientId}:`, error);
  });
});

// Start price streaming
priceStreamer.startStreaming();

// Start scheduled background jobs (historical data cleanup, daily stats, etc.)
cronService.startAll();

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
