#!/usr/bin/env node

/**
 * Database Initialization Script
 * Initialize PostgreSQL tables and indices
 *
 * Usage: node scripts/initDatabase.js
 */

import dotenv from 'dotenv';
import database from '../services/database.js';

dotenv.config();

async function initializeDatabase() {
  console.log('🗄️ Initializing PostgreSQL database...\n');

  if (!database.isConnected) {
    console.error('❌ Database not configured. Set DATABASE_URL in .env');
    process.exit(1);
  }

  try {
    await database.initializeTables();

    console.log('\n✅ Database initialization complete!');
    console.log('\n📊 Table Summary:');
    console.log('  - signals: Store trading signals');
    console.log('  - signal_outcomes: Track signal results');
    console.log('  - pcr_history: PCR ratio snapshots');
    console.log('  - max_pain_history: Max pain evolution');
    console.log('  - iv_history: Implied volatility tracking');
    console.log('  - user_preferences: User settings');
    console.log('  - Indices created for performance\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error initializing database:', err.message);
    process.exit(1);
  }
}

initializeDatabase();
