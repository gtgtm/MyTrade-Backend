/**
 * Preferences Controller
 * Handles user preferences configuration API endpoints
 */

import userPreferencesService from '../services/userPreferencesService.js';
import signalMonitorService from '../services/signalMonitorService.js';

class PreferencesController {
  /**
   * GET /api/preferences
   * Get all user preferences
   */
  async getAllPreferences(req, res) {
    try {
      const preferences = await userPreferencesService.getAllPreferences();

      return res.status(200).json({
        success: true,
        data: preferences,
        metadata: {
          count: Object.keys(preferences).length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting preferences:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get preferences'
      });
    }
  }

  /**
   * GET /api/preferences/:key
   * Get specific preference
   */
  async getPreference(req, res) {
    try {
      const { key } = req.params;

      if (!key) {
        return res.status(400).json({
          success: false,
          error: 'Key parameter required'
        });
      }

      const preference = await userPreferencesService.getPreference(key);

      if (!preference) {
        return res.status(404).json({
          success: false,
          error: `Preference '${key}' not found`
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          key: preference.key,
          value: preference.value,
          type: preference.data_type
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting preference:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get preference'
      });
    }
  }

  /**
   * POST /api/preferences
   * Set/create a preference
   */
  async setPreference(req, res) {
    try {
      const { key, value, type = 'string' } = req.body;

      if (!key) {
        return res.status(400).json({
          success: false,
          error: 'Key is required'
        });
      }

      if (value === undefined || value === null) {
        return res.status(400).json({
          success: false,
          error: 'Value is required'
        });
      }

      const result = await userPreferencesService.setPreference(key, value, type);

      return res.status(200).json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error setting preference:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to set preference'
      });
    }
  }

  /**
   * PUT /api/preferences/:key
   * Update a preference
   */
  async updatePreference(req, res) {
    try {
      const { key } = req.params;
      const { value, type = 'string' } = req.body;

      if (!key) {
        return res.status(400).json({
          success: false,
          error: 'Key parameter required'
        });
      }

      if (value === undefined || value === null) {
        return res.status(400).json({
          success: false,
          error: 'Value is required'
        });
      }

      const result = await userPreferencesService.setPreference(key, value, type);

      return res.status(200).json({
        success: true,
        data: result,
        metadata: {
          action: 'updated',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error updating preference:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to update preference'
      });
    }
  }

  /**
   * DELETE /api/preferences/:key
   * Delete a preference
   */
  async deletePreference(req, res) {
    try {
      const { key } = req.params;

      if (!key) {
        return res.status(400).json({
          success: false,
          error: 'Key parameter required'
        });
      }

      const result = await userPreferencesService.deletePreference(key);

      if (!result.deleted) {
        return res.status(404).json({
          success: false,
          error: `Preference '${key}' not found`
        });
      }

      return res.status(200).json({
        success: true,
        data: { deleted: true, key },
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error deleting preference:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete preference'
      });
    }
  }

  /**
   * POST /api/preferences/batch
   * Update multiple preferences at once
   */
  async batchUpdate(req, res) {
    try {
      const updates = req.body;

      if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Updates object is required'
        });
      }

      const result = await userPreferencesService.updateBatch(updates);

      return res.status(200).json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error updating batch preferences:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to update batch preferences'
      });
    }
  }

  /**
   * GET /api/preferences/config/trading
   * Get trading configuration
   */
  async getTradingConfig(req, res) {
    try {
      const config = await userPreferencesService.getTradingConfig();

      return res.status(200).json({
        success: true,
        data: config,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting trading config:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get trading config'
      });
    }
  }

  /**
   * POST /api/preferences/reset
   * Reset all preferences to defaults
   */
  async resetToDefaults(req, res) {
    try {
      const result = await userPreferencesService.resetToDefaults();

      return res.status(200).json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error resetting preferences:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to reset preferences'
      });
    }
  }

  /**
   * GET /api/preferences/defaults
   * Get default preferences
   */
  async getDefaults(req, res) {
    try {
      const defaults = userPreferencesService.getDefaults();

      return res.status(200).json({
        success: true,
        data: defaults,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting defaults:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get defaults'
      });
    }
  }

  /**
   * POST /api/signal-preferences/:userId
   * Set user signal monitoring preferences
   */
  async setSignalPreferences(req, res) {
    try {
      const { userId } = req.params;
      const { minScore, symbols, enableNotifications, cooldownMinutes } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId is required'
        });
      }

      if (minScore !== undefined && (minScore < 0 || minScore > 100)) {
        return res.status(400).json({
          success: false,
          error: 'minScore must be between 0 and 100'
        });
      }

      if (cooldownMinutes !== undefined && cooldownMinutes < 1) {
        return res.status(400).json({
          success: false,
          error: 'cooldownMinutes must be at least 1'
        });
      }

      const preferences = {
        minScore: minScore ?? 60,
        symbols: symbols ?? ['NIFTY', 'BANKNIFTY', 'SENSEX', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
        enableNotifications: enableNotifications ?? true,
        cooldownMinutes: cooldownMinutes ?? 60
      };

      signalMonitorService.setUserPreferences(userId, preferences);

      return res.status(200).json({
        success: true,
        message: 'Signal preferences updated',
        data: {
          userId,
          preferences
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error setting signal preferences:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to set signal preferences'
      });
    }
  }

  /**
   * GET /api/signal-preferences/:userId
   * Get user signal monitoring preferences
   */
  async getSignalPreferences(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId is required'
        });
      }

      const preferences = signalMonitorService.getUserPreferences(userId);

      return res.status(200).json({
        success: true,
        data: {
          userId,
          preferences
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting signal preferences:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get signal preferences'
      });
    }
  }

  /**
   * GET /api/signal-preferences/available-symbols
   * Get all available symbols for signal monitoring
   */
  async getAvailableSymbols(req, res) {
    try {
      const availableSymbols = {
        nse: ['NIFTY', 'BANKNIFTY', 'SENSEX'],
        crypto: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT']
      };

      return res.status(200).json({
        success: true,
        data: availableSymbols,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting available symbols:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get available symbols'
      });
    }
  }
}

export default new PreferencesController();
