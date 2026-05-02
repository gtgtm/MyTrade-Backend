/**
 * User Preferences Service
 * Manage user configuration and settings in PostgreSQL database
 */

import database from './database.js';

class UserPreferencesService {
  constructor() {
    this.db = database;
    this.mockMode = !database.isConnected;
    this.mockPreferences = {};

    if (this.mockMode) {
      console.log('⚙️ UserPreferencesService initialized (mock mode)');
    } else {
      console.log('⚙️ UserPreferencesService initialized (PostgreSQL mode)');
    }
  }

  async getPreference(key) {
    if (this.mockMode) {
      return this.mockPreferences[key] || null;
    }

    try {
      const result = await this.db.getOne(
        'SELECT * FROM user_preferences WHERE key = $1',
        [key]
      );

      if (result && result.data_type === 'json') {
        try {
          result.value = JSON.parse(result.value);
        } catch (e) {
          console.warn(`Failed to parse JSON for key ${key}`);
        }
      }

      return result;
    } catch (err) {
      console.error('❌ Error getting preference:', err.message);
      throw err;
    }
  }

  async setPreference(key, value, dataType = 'string') {
    if (this.mockMode) {
      this.mockPreferences[key] = value;
      return { key, value, data_type: dataType };
    }

    try {
      const valueToStore = dataType === 'json' ? JSON.stringify(value) : value;

      const result = await this.db.query(
        `INSERT INTO user_preferences (key, value, data_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET
           value = $2,
           data_type = $3,
           updated_at = NOW()
         RETURNING *`,
        [key, valueToStore, dataType]
      );

      return result.rows[0];
    } catch (err) {
      console.error('❌ Error setting preference:', err.message);
      throw err;
    }
  }

  async getPreferences(filter = null) {
    if (this.mockMode) {
      if (!filter) {
        return Object.entries(this.mockPreferences).map(([key, value]) => ({
          key,
          value
        }));
      }
      return Object.entries(this.mockPreferences)
        .filter(([key]) => key.includes(filter))
        .map(([key, value]) => ({ key, value }));
    }

    try {
      let query = 'SELECT * FROM user_preferences';
      const params = [];

      if (filter) {
        query += ' WHERE key ILIKE $1';
        params.push(`%${filter}%`);
      }

      query += ' ORDER BY created_at DESC';

      const result = await this.db.query(query, params);
      return result.rows;
    } catch (err) {
      console.error('❌ Error getting preferences:', err.message);
      throw err;
    }
  }

  async deletePreference(key) {
    if (this.mockMode) {
      delete this.mockPreferences[key];
      return { deleted: true };
    }

    try {
      const result = await this.db.query(
        'DELETE FROM user_preferences WHERE key = $1',
        [key]
      );
      return { deleted: result.rowCount > 0 };
    } catch (err) {
      console.error('❌ Error deleting preference:', err.message);
      throw err;
    }
  }

  async clearPreferences() {
    if (this.mockMode) {
      this.mockPreferences = {};
      return { cleared: true };
    }

    try {
      await this.db.query('DELETE FROM user_preferences');
      return { cleared: true };
    } catch (err) {
      console.error('❌ Error clearing preferences:', err.message);
      throw err;
    }
  }

  async getStatistics() {
    if (this.mockMode) {
      return {
        totalPreferences: Object.keys(this.mockPreferences).length,
        jsonPreferences: 0,
        stringPreferences: Object.keys(this.mockPreferences).length
      };
    }

    try {
      const result = await this.db.query(
        `SELECT
           COUNT(*) as total,
           COUNT(CASE WHEN data_type = 'json' THEN 1 END) as json_count,
           COUNT(CASE WHEN data_type = 'string' THEN 1 END) as string_count
         FROM user_preferences`
      );

      const stats = result.rows[0];
      return {
        totalPreferences: parseInt(stats.total),
        jsonPreferences: parseInt(stats.json_count),
        stringPreferences: parseInt(stats.string_count)
      };
    } catch (err) {
      console.error('❌ Error getting statistics:', err.message);
      throw err;
    }
  }
}

export default new UserPreferencesService();
