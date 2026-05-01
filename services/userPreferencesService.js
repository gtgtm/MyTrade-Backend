/**
 * User Preferences Service
 * Manage user configuration and settings in database
 */

// sqlite3 is optional in dev mode
let sqlite3 = null;
import path from 'path';

class UserPreferencesService {
  constructor() {
    this.mockMode = !sqlite3;
    this.mockPreferences = {};
    if (!this.mockMode) {
      try {
        const dbPath = path.join(process.cwd(), 'database', 'history.db');
        this.db = new sqlite3.Database(dbPath, (err) => {
          if (err) {
            console.error('❌ Database connection error:', err.message);
            this.mockMode = true;
          }
        });
        if (!this.mockMode) {
          this.db.run('PRAGMA foreign_keys = ON');
        }
      } catch (err) {
        this.mockMode = true;
      }
    }
  }

  /**
   * Get a preference by key
   */
  getPreference(key) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM user_preferences WHERE key = ?';
      this.db.get(sql, [key], (err, row) => {
        if (err) {
          reject(err);
        } else {
          if (row && row.data_type === 'json') {
            try {
              row.value = JSON.parse(row.value);
            } catch (e) {
              console.warn(`Failed to parse JSON for key ${key}`);
            }
          }
          resolve(row);
        }
      });
    });
  }

  /**
   * Get all preferences
   */
  getAllPreferences() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM user_preferences ORDER BY key ASC';
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const preferences = {};
          rows.forEach(row => {
            let value = row.value;
            if (row.data_type === 'json') {
              try {
                value = JSON.parse(value);
              } catch (e) {
                console.warn(`Failed to parse JSON for key ${row.key}`);
              }
            } else if (row.data_type === 'number') {
              value = parseFloat(value);
            } else if (row.data_type === 'boolean') {
              value = value === 'true' || value === '1';
            }
            preferences[row.key] = value;
          });
          resolve(preferences);
        }
      });
    });
  }

  /**
   * Set a preference
   */
  setPreference(key, value, dataType = 'string') {
    return new Promise((resolve, reject) => {
      let valueStr = value;

      if (dataType === 'json') {
        valueStr = JSON.stringify(value);
      } else if (dataType === 'number') {
        valueStr = String(parseFloat(value));
      } else if (dataType === 'boolean') {
        valueStr = value ? 'true' : 'false';
      }

      const sql = `
        INSERT INTO user_preferences (key, value, data_type, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = ?, data_type = ?, updated_at = CURRENT_TIMESTAMP
      `;

      this.db.run(sql, [key, valueStr, dataType, valueStr, dataType], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ key, value, dataType });
        }
      });
    });
  }

  /**
   * Delete a preference
   */
  deletePreference(key) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM user_preferences WHERE key = ?';
      this.db.run(sql, [key], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes > 0, key });
        }
      });
    });
  }

  /**
   * Get default preferences
   */
  getDefaults() {
    return {
      'data_retention_days': 365,
      'pcr_alert_threshold': 1.2,
      'max_pain_alert_threshold': 100,
      'backtest_days': 90,
      'backtest_strategy': 'pcr',
      'export_format': 'csv',
      'report_frequency': 'weekly',
      'email_notifications': false,
      'webhook_url': '',
      'analytics_cache_minutes': 60,
      'volatility_percentile_threshold': 75
    };
  }

  /**
   * Initialize default preferences if not exists
   */
  async initializeDefaults() {
    try {
      const defaults = this.getDefaults();

      for (const [key, value] of Object.entries(defaults)) {
        const existing = await this.getPreference(key);
        if (!existing) {
          const dataType = typeof value === 'number' ? 'number' : 'string';
          await this.setPreference(key, value, dataType);
        }
      }

      return { initialized: true };
    } catch (error) {
      console.error('Error initializing default preferences:', error);
      throw error;
    }
  }

  /**
   * Update multiple preferences at once
   */
  async updateBatch(updates = {}) {
    try {
      const results = [];

      for (const [key, value] of Object.entries(updates)) {
        const dataType = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
        const result = await this.setPreference(key, value, dataType);
        results.push(result);
      }

      return { updated: results.length, preferences: results };
    } catch (error) {
      console.error('Error updating batch preferences:', error);
      throw error;
    }
  }

  /**
   * Get user configuration for trading
   */
  async getTradingConfig() {
    try {
      const prefs = await this.getAllPreferences();

      return {
        pcr: {
          alertThreshold: prefs['pcr_alert_threshold'] || 1.2,
          dataRetentionDays: prefs['data_retention_days'] || 365
        },
        maxPain: {
          alertThreshold: prefs['max_pain_alert_threshold'] || 100
        },
        backtesting: {
          defaultDays: prefs['backtest_days'] || 90,
          defaultStrategy: prefs['backtest_strategy'] || 'pcr'
        },
        analytics: {
          cacheMinutes: prefs['analytics_cache_minutes'] || 60,
          volatilityPercentile: prefs['volatility_percentile_threshold'] || 75
        },
        notifications: {
          emailEnabled: prefs['email_notifications'] || false,
          webhookUrl: prefs['webhook_url'] || ''
        },
        export: {
          defaultFormat: prefs['export_format'] || 'csv',
          reportFrequency: prefs['report_frequency'] || 'weekly'
        }
      };
    } catch (error) {
      console.error('Error getting trading configuration:', error);
      throw error;
    }
  }

  /**
   * Reset preferences to defaults
   */
  async resetToDefaults() {
    try {
      return new Promise((resolve, reject) => {
        const sql = 'DELETE FROM user_preferences';
        this.db.run(sql, async (err) => {
          if (err) {
            reject(err);
          } else {
            await this.initializeDefaults();
            resolve({ reset: true });
          }
        });
      });
    } catch (error) {
      console.error('Error resetting preferences:', error);
      throw error;
    }
  }
}

export default new UserPreferencesService();
