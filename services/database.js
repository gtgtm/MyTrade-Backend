/**
 * PostgreSQL Database Service
 * Handles all database connections and operations
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

class DatabaseService {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.initializePool();
  }

  initializePool() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      console.warn('⚠️  DATABASE_URL not configured. Using in-memory mode.');
      this.isConnected = false;
      return;
    }

    try {
      this.pool = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pool.on('error', (err) => {
        console.error('❌ Unexpected error on idle client', err);
      });

      console.log('✅ PostgreSQL connection pool initialized');
      this.isConnected = true;
    } catch (err) {
      console.error('❌ Failed to initialize database pool:', err.message);
      this.isConnected = false;
    }
  }

  async query(text, params = []) {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (err) {
      console.error('❌ Database query error:', err.message);
      throw err;
    }
  }

  async getOne(text, params = []) {
    const result = await this.query(text, params);
    return result.rows[0] || null;
  }

  async getMany(text, params = []) {
    const result = await this.query(text, params);
    return result.rows;
  }

  async run(text, params = []) {
    const result = await this.query(text, params);
    return result.rowCount;
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async initializeTables() {
    if (!this.pool) {
      console.log('⏭️  Skipping table initialization (database not configured)');
      return;
    }

    try {
      // Create signals table
      await this.query(`
        CREATE TABLE IF NOT EXISTS signals (
          id SERIAL PRIMARY KEY,
          signal_id UUID UNIQUE,
          symbol VARCHAR(50) NOT NULL,
          entry_price DECIMAL(12, 2),
          stop_loss DECIMAL(12, 2),
          target DECIMAL(12, 2),
          signal_type VARCHAR(20),
          confidence DECIMAL(5, 2),
          confluences TEXT,
          regime VARCHAR(50),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create signal outcomes table
      await this.query(`
        CREATE TABLE IF NOT EXISTS signal_outcomes (
          id SERIAL PRIMARY KEY,
          signal_id UUID,
          outcome VARCHAR(50),
          exit_price DECIMAL(12, 2),
          pnl DECIMAL(12, 2),
          pnl_percentage DECIMAL(8, 2),
          recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (signal_id) REFERENCES signals(signal_id) ON DELETE CASCADE
        );
      `);

      // Create PCR history table
      await this.query(`
        CREATE TABLE IF NOT EXISTS pcr_history (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(50) NOT NULL,
          pcr_ratio DECIMAL(8, 4),
          sentiment VARCHAR(20),
          confidence DECIMAL(5, 2),
          change_percent DECIMAL(8, 2),
          total_call_oi BIGINT,
          total_put_oi BIGINT,
          recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create max pain history table
      await this.query(`
        CREATE TABLE IF NOT EXISTS max_pain_history (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(50) NOT NULL,
          max_pain DECIMAL(12, 2),
          expiry DATE,
          confidence DECIMAL(5, 2),
          change_amount DECIMAL(12, 2),
          recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create IV history table
      await this.query(`
        CREATE TABLE IF NOT EXISTS iv_history (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(50) NOT NULL,
          strike DECIMAL(12, 2),
          iv DECIMAL(8, 4),
          option_type VARCHAR(10),
          expiry DATE,
          recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create user preferences table
      await this.query(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          id SERIAL PRIMARY KEY,
          key VARCHAR(255) UNIQUE NOT NULL,
          value TEXT,
          data_type VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create indices for performance
      await this.query(`CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);`);
      await this.query(`CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);`);
      await this.query(`CREATE INDEX IF NOT EXISTS idx_outcomes_signal_id ON signal_outcomes(signal_id);`);
      await this.query(`CREATE INDEX IF NOT EXISTS idx_pcr_symbol ON pcr_history(symbol);`);
      await this.query(`CREATE INDEX IF NOT EXISTS idx_max_pain_symbol ON max_pain_history(symbol);`);

      console.log('✅ Database tables initialized successfully');
    } catch (err) {
      console.error('❌ Error initializing tables:', err.message);
      throw err;
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('✅ Database connection closed');
    }
  }
}

export default new DatabaseService();
