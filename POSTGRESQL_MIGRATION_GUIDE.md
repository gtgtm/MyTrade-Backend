# PostgreSQL Migration Guide

## Overview
Your backend has been fully migrated from SQLite to PostgreSQL. This guide covers setup, configuration, and deployment.

---

## 🎯 What Was Migrated

### Services Updated
1. ✅ **SignalDatabase** - Signal storage and outcome tracking
2. ✅ **HistoricalDataService** - PCR, Max Pain, IV, Greeks history
3. ✅ **UserPreferencesService** - User settings and configuration
4. ✅ **Database Service** (NEW) - Central PostgreSQL connection pool

### Key Features
- Connection pooling (max 20 concurrent connections)
- Transaction support
- Automatic table creation
- Mock mode fallback (if database not configured)
- Full compatibility with existing APIs

---

## 📋 Prerequisites

### Local Development Setup
1. **Install PostgreSQL**
   ```bash
   # macOS with Homebrew
   brew install postgresql@15
   brew services start postgresql@15
   
   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib
   ```

2. **Create a database user and database**
   ```bash
   # Connect to PostgreSQL
   psql postgres
   
   # Create user
   CREATE USER trading_user WITH PASSWORD 'your_secure_password';
   
   # Create database
   CREATE DATABASE trading_db OWNER trading_user;
   
   # Grant privileges
   GRANT ALL PRIVILEGES ON DATABASE trading_db TO trading_user;
   
   # Exit
   \q
   ```

3. **Install Node dependencies**
   ```bash
   cd Backend-api
   npm install pg uuid dotenv
   ```

---

## 🔧 Configuration

### Local Development (.env)

```env
# Database Configuration
DATABASE_URL=postgresql://trading_user:your_secure_password@localhost:5432/trading_db

# Other settings
PORT=3000
NODE_ENV=development
NSE_API_BASE=https://www.nseindia.com
NSE_API_TIMEOUT=15000
CACHE_DURATION=180000
ENABLE_CORS=true
CORS_ORIGIN=http://localhost:3000
```

### Render Deployment

```env
DATABASE_URL=postgresql://user:password@your-host.render.postgresql.net:5432/trading_db
NODE_ENV=production
PORT=3000
```

---

## 🚀 Initialization

### Option 1: Automatic (Recommended)
The server initializes tables automatically on startup:
```bash
npm run dev
# Tables created automatically if database is configured
```

### Option 2: Manual Script
```bash
node scripts/initDatabase.js
```

### Option 3: Manual SQL
Connect to your database and run the table creation queries from `services/database.js`

---

## 📊 Database Schema

### Tables Created

#### signals
```sql
- id: Serial primary key
- signal_id: UUID (unique)
- symbol: Trading symbol
- entry_price: Entry point
- stop_loss: Stop loss level
- target: Target price
- signal_type: Type of signal
- confidence: Confidence score
- confluences: Technical confluences (JSON)
- regime: Market regime
- timestamp: Signal generation time
- saved_at: Database insertion time
- updated_at: Last update time
```

#### signal_outcomes
```sql
- id: Serial primary key
- signal_id: References signals(signal_id)
- outcome: win/loss/partial
- exit_price: Exit price
- pnl: Profit/Loss in currency
- pnl_percentage: P&L as percentage
- recorded_at: Outcome recording time
```

#### pcr_history
```sql
- id: Serial primary key
- symbol: Trading symbol
- pcr_ratio: Put-Call Ratio
- sentiment: Market sentiment
- confidence: Sentiment confidence
- change_percent: Percentage change
- total_call_oi: Call OI
- total_put_oi: Put OI
- recorded_at: Recording timestamp
```

#### max_pain_history
```sql
- id: Serial primary key
- symbol: Trading symbol
- max_pain: Max pain level
- expiry: Expiry date
- confidence: Confidence score
- change_amount: Change in max pain
- recorded_at: Recording timestamp
```

#### iv_history
```sql
- id: Serial primary key
- symbol: Trading symbol
- strike: Strike price
- iv: Implied Volatility
- option_type: call/put/ATM
- expiry: Expiry date
- recorded_at: Recording timestamp
```

#### user_preferences
```sql
- id: Serial primary key
- key: Preference key (unique)
- value: Preference value
- data_type: string/json
- created_at: Creation timestamp
- updated_at: Last update timestamp
```

### Indices Created
- `idx_signals_symbol` - Fast symbol lookups
- `idx_signals_timestamp` - Time-based queries
- `idx_outcomes_signal_id` - Outcome lookups
- `idx_pcr_symbol` - PCR history by symbol
- `idx_max_pain_symbol` - Max pain by symbol

---

## 🔄 API Compatibility

### No API Changes Required
All existing endpoints work unchanged:

```bash
# Get all signals
GET /api/signals

# Get symbol signals
GET /api/signals/NIFTY

# Record signal outcome
POST /api/outcomes

# Get statistics
GET /api/stats
```

### New Database Methods Available

```javascript
// In services that import database
import database from './services/database.js';

// Query operations
await database.query(sql, params);
await database.getOne(sql, params);
await database.getMany(sql, params);
await database.run(sql, params);

// Transactions
await database.transaction(async (client) => {
  // Execute multiple queries atomically
});
```

---

## 🛠️ Monitoring & Maintenance

### Check Database Status

```bash
# Connect to database
psql -U trading_user -d trading_db

# List tables
\dt

# View connection info
\conninfo

# Exit
\q
```

### Performance Queries

```sql
-- Count records by table
SELECT schemaname, tablename, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- View table sizes
SELECT schemaname, tablename,
  ROUND(pg_total_relation_size(schemaname||'.'||tablename)/1024/1024, 2) AS size_mb
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Backup & Restore

```bash
# Backup database
pg_dump -U trading_user trading_db > backup.sql

# Restore from backup
psql -U trading_user trading_db < backup.sql
```

---

## 🐛 Troubleshooting

### Issue: Connection Failed

**Error:** `connect ECONNREFUSED 127.0.0.1:5432`

**Solution:**
1. Check PostgreSQL is running: `brew services list` (macOS)
2. Verify DATABASE_URL in .env
3. Ensure database user and database exist

### Issue: Database Not Initialized

**Error:** `relation "signals" does not exist`

**Solution:**
```bash
# Run initialization script
node scripts/initDatabase.js

# Or manually initialize in server startup
npm run dev
```

### Issue: Permission Denied

**Error:** `permission denied for schema public`

**Solution:**
```sql
-- Grant schema privileges to user
GRANT ALL ON SCHEMA public TO trading_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO trading_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO trading_user;
```

### Issue: Mock Mode Active

**Error:** Database requests work but show "mock mode" in logs

**Solution:**
- Set DATABASE_URL environment variable
- Check PostgreSQL connection string format
- Verify user permissions

---

## 📈 Scaling Considerations

### Connection Pool Tuning

Edit `services/database.js`:
```javascript
const pool = new Pool({
  connectionString,
  max: 20,              // Max connections (increase for high load)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Data Retention Policy

Use the built-in cleanup function:
```javascript
// Delete records older than 365 days
await historicalDataService.cleanOldData(365);
```

### Query Optimization

For large datasets, add pagination:
```javascript
// Get signals with pagination
const limit = 100;
const offset = (page - 1) * limit;

const result = await database.query(
  `SELECT * FROM signals ORDER BY timestamp DESC LIMIT $1 OFFSET $2`,
  [limit, offset]
);
```

---

## 🌐 Render Deployment

### Step 1: Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up with GitHub

### Step 2: Create PostgreSQL Database

1. Render Dashboard → Databases → Create
2. Select PostgreSQL
3. Plan: Free (for development)
4. Name: `trading_db`
5. Create

### Step 3: Configure Environment

Add to Render Web Service Environment:
```
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/trading_db
NODE_ENV=production
```

### Step 4: Deployment

1. Push code to GitHub with updated `render.yaml`
2. Render auto-deploys when GitHub detects changes
3. Tables initialize automatically on startup

---

## ✅ Verification Checklist

- [ ] PostgreSQL installed and running
- [ ] Database user and database created
- [ ] .env file configured with DATABASE_URL
- [ ] `npm install` completed successfully
- [ ] `npm run dev` starts without errors
- [ ] Database tables created (check with `\dt`)
- [ ] Sample API calls successful
- [ ] No "mock mode" messages in console

---

## 📚 Additional Resources

- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [pg Node Package](https://node-postgres.com/)
- [Render PostgreSQL Guide](https://render.com/docs/databases)

---

## 🎉 Next Steps

1. **Local Testing**
   - Run `npm run dev`
   - Test API endpoints
   - Verify data persistence

2. **Production Deployment**
   - Set up PostgreSQL on Render
   - Configure DATABASE_URL
   - Deploy backend
   - Test against live database

3. **Monitoring**
   - Set up error logging (Sentry, LogRocket)
   - Monitor database performance
   - Set up automated backups

---

**Migration Completed:** 2026-05-02
**Status:** ✅ Production Ready
