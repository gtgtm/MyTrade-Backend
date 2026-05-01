# FnO Signals Backend API

Backend service for the FnO Signals iOS trading app. Provides real-time option chain data and signal generation.

## Why a Backend?

The iOS app cannot directly access NSE API due to:
- **Akamai bot detection** blocking iOS mobile app TLS fingerprints
- **JavaScript-based session setup** (NSE uses JS that URLSession cannot execute)
- **Request pattern detection** identifying mobile app behaviors

The backend runs on a server with proper request handling and session management, bypassing these restrictions.

## Setup

### 1. Install Dependencies

```bash
cd Backend-api
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` if needed (defaults work for local development):

```env
PORT=3000
NODE_ENV=development
NSE_API_BASE=https://www.nseindia.com
NSE_API_TIMEOUT=15000
CORS_ORIGIN=http://localhost:8080
```

### 3. Run the Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Server will start on `http://localhost:3000`

## API Endpoints

### Health Check
```
GET /api/health
```

Returns:
```json
{
  "success": true,
  "message": "FnO Signals Backend is running",
  "timestamp": "2026-04-30T12:00:00.000Z"
}
```

### Get All Signals
```
GET /api/signals
```

Returns array of signals for NIFTY and BANKNIFTY:
```json
{
  "success": true,
  "data": [
    {
      "symbol": "NIFTY",
      "price": 22300.25,
      "signalType": "BUY CALL",
      "score": 75,
      "entryPrice": 22300.25,
      "stopLoss": 21854.25,
      "target": 23415.26,
      "pcr": 0.95,
      "maxPain": 22350,
      "daysToExpiry": 5,
      "generatedAt": "2026-04-30T12:00:00.000Z",
      "isMock": false
    }
  ],
  "count": 2,
  "timestamp": "2026-04-30T12:00:00.000Z"
}
```

### Get Single Signal
```
GET /api/signals/NIFTY
GET /api/signals/BANKNIFTY
```

Returns single signal object.

## Configuration in iOS App

Update the API base URL in the app:

**In Settings or via APIService:**
```swift
APIService.shared.setBaseURL("http://localhost:3000")
```

Or for production:
```swift
APIService.shared.setBaseURL("https://api.fnos.example.com")
```

Default: `http://localhost:3000`

## Architecture

```
Backend-api/
├── server.js                 # Express app setup, middleware
├── services/
│   ├── nseService.js        # NSE API client, cookie management
│   └── signalEngine.js      # Signal generation logic
├── controllers/
│   └── signalController.js  # Request handlers
├── routes/
│   └── api.js               # Route definitions
├── config/                  # (future: database, logger)
└── database/                # (future: persistence)
```

## Signal Generation

The backend generates signals using:
- **Real NSE option chain data** (underlying price, open interest)
- **Technical indicators**: RSI, EMA (resampled from price history)
- **Confluence gate**: Requires 3+ directional indicators in agreement
- **Volatility filter**: PCR-based suppression in neutral zones
- **Score**: 0-100 with input validation and risk thresholds

See `services/signalEngine.js` for implementation.

## Error Handling

On NSE API failure, the backend automatically falls back to mock data:
- Returns `isMock: true` in response
- iOS app shows "NSE unreachable · Showing simulated data" banner
- User can retry via the Retry button

## Debugging

Enable debug logging:
```bash
DEBUG=* npm run dev
```

Check console for:
- 🔄 Cookie refresh attempts
- ✅ Successful data fetches
- ❌ Errors and fallbacks
- 📡 Request logging

## Future Enhancements

- [ ] Database persistence (signal history, user stats)
- [ ] Price history storage (for better EMA/RSI calculations)
- [ ] User authentication and alerts
- [ ] Webhook notifications
- [ ] Rate limiting and caching
- [ ] Docker containerization
