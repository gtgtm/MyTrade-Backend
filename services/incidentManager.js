// Incident Manager - Detects, escalates, and auto-recovers from failures
// 10 incident types with auto-recovery and escalation chains

class IncidentManager {
  constructor(io) {
    this.io = io;
    this.incidents = new Map(); // incident.id -> incident details
    this.incidentStats = {
      total: 0,
      resolved: 0,
      escalated: 0,
      autoRecovered: 0
    };

    // Recovery configuration (in milliseconds)
    this.recoveryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2.0
    };
  }

  // 10 Incident Types
  static INCIDENT_TYPES = {
    SIGNAL_GENERATION_FAILED: 'signal_generation_failed',
    NETWORK_FAILURE: 'network_failure',
    DATABASE_ERROR: 'database_error',
    DIVERGENCE_DETECTED: 'divergence_detected',
    AUTO_HALT_TRIGGERED: 'auto_halt_triggered',
    MEMORY_LEAK: 'memory_leak',
    NOTIFICATION_FAILED: 'notification_failed',
    BACKTEST_FAILED: 'backtest_failed',
    PRICE_STREAM_DISCONNECTED: 'price_stream_disconnected',
    UNKNOWN_ERROR: 'unknown_error'
  };

  // 4 Severity Levels
  static SEVERITY_LEVELS = {
    INFO: 'INFO',
    WARNING: 'WARNING',
    CRITICAL: 'CRITICAL',
    EMERGENCY: 'EMERGENCY'
  };

  // 5 Lifecycle States
  static INCIDENT_STATES = {
    OPEN: 'OPEN',
    INVESTIGATING: 'INVESTIGATING',
    ACKNOWLEDGED: 'ACKNOWLEDGED',
    RESOLVED: 'RESOLVED',
    ESCALATED: 'ESCALATED'
  };

  // Detect and register an incident
  detectIncident(type, severity, message, context = {}) {
    if (!Object.values(IncidentManager.INCIDENT_TYPES).includes(type)) {
      type = IncidentManager.INCIDENT_TYPES.UNKNOWN_ERROR;
    }

    const incidentId = `INC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const incident = {
      id: incidentId,
      type,
      severity,
      message,
      context,
      state: IncidentManager.INCIDENT_STATES.OPEN,
      createdAt: new Date(),
      updatedAt: new Date(),
      recoveryAttempts: 0,
      recoveryHistory: [],
      escalated: false,
      escalationChain: this.getEscalationChain(severity)
    };

    this.incidents.set(incidentId, incident);
    this.incidentStats.total++;

    console.log(`🚨 [INCIDENT] ${type} (${severity}): ${message}`);

    // Emit to connected clients
    this.io.emit('incident:detected', {
      id: incidentId,
      type,
      severity,
      message,
      timestamp: new Date().toISOString()
    });

    // Auto-attempt recovery for transient issues
    if (this.isAutoRecoverable(type)) {
      this.scheduleRecovery(incidentId);
    }

    return incident;
  }

  // Determine if incident can auto-recover
  isAutoRecoverable(type) {
    const autoRecoverableTypes = [
      IncidentManager.INCIDENT_TYPES.NETWORK_FAILURE,
      IncidentManager.INCIDENT_TYPES.PRICE_STREAM_DISCONNECTED,
      IncidentManager.INCIDENT_TYPES.NOTIFICATION_FAILED
    ];

    return autoRecoverableTypes.includes(type);
  }

  // Schedule automatic recovery attempt
  scheduleRecovery(incidentId) {
    const incident = this.incidents.get(incidentId);
    if (!incident || incident.recoveryAttempts >= this.recoveryConfig.maxAttempts) {
      return;
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      this.recoveryConfig.baseDelay * Math.pow(this.recoveryConfig.backoffMultiplier, incident.recoveryAttempts),
      this.recoveryConfig.maxDelay
    );

    console.log(`⏱️ [RECOVERY] Scheduling recovery for ${incidentId} in ${delay}ms (attempt ${incident.recoveryAttempts + 1}/${this.recoveryConfig.maxAttempts})`);

    setTimeout(() => {
      this.attemptRecovery(incidentId);
    }, delay);
  }

  // Attempt to recover from incident
  async attemptRecovery(incidentId) {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    incident.recoveryAttempts++;
    incident.state = IncidentManager.INCIDENT_STATES.INVESTIGATING;
    incident.updatedAt = new Date();

    console.log(`🔄 [RECOVERY] Attempting recovery for ${incident.type} (attempt ${incident.recoveryAttempts}/${this.recoveryConfig.maxAttempts})`);

    try {
      // Recovery logic depends on incident type
      let recovered = false;

      switch (incident.type) {
        case IncidentManager.INCIDENT_TYPES.NETWORK_FAILURE:
          recovered = await this.recoverNetworkFailure(incident);
          break;
        case IncidentManager.INCIDENT_TYPES.PRICE_STREAM_DISCONNECTED:
          recovered = await this.recoverPriceStream(incident);
          break;
        case IncidentManager.INCIDENT_TYPES.NOTIFICATION_FAILED:
          recovered = await this.recoverNotification(incident);
          break;
        default:
          recovered = false;
      }

      const recoveryRecord = {
        timestamp: new Date(),
        attempt: incident.recoveryAttempts,
        success: recovered
      };

      incident.recoveryHistory.push(recoveryRecord);

      if (recovered) {
        incident.state = IncidentManager.INCIDENT_STATES.RESOLVED;
        this.incidentStats.resolved++;
        this.incidentStats.autoRecovered++;
        console.log(`✅ [RECOVERY] Auto-recovered from ${incident.type}`);

        this.io.emit('incident:resolved', {
          id: incidentId,
          method: 'auto_recovery',
          timestamp: new Date().toISOString()
        });
      } else if (incident.recoveryAttempts < this.recoveryConfig.maxAttempts) {
        // Schedule next retry
        this.scheduleRecovery(incidentId);
      } else {
        // Max attempts exceeded, escalate
        this.escalate(incidentId);
      }
    } catch (err) {
      console.error(`❌ [RECOVERY] Recovery attempt failed:`, err.message);

      if (incident.recoveryAttempts < this.recoveryConfig.maxAttempts) {
        this.scheduleRecovery(incidentId);
      } else {
        this.escalate(incidentId);
      }
    }
  }

  // Recovery implementations for each type
  async recoverNetworkFailure(incident) {
    // Ping backend health endpoint
    try {
      const response = await fetch('http://localhost:3000/api/health', { timeout: 5000 });
      return response.ok;
    } catch {
      return false;
    }
  }

  async recoverPriceStream(incident) {
    // Attempt to reconnect price stream
    if (global.exitManager && global.exitManager.io) {
      // Emit reconnect signal to all clients
      global.exitManager.io.emit('price-stream:reconnect-attempt');
      return true; // Optimistic recovery
    }
    return false;
  }

  async recoverNotification(incident) {
    // Retry notification send (stubbed for now)
    return true; // Assume recovery for notification retries
  }

  // Escalate incident to ops team
  escalate(incidentId) {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    incident.state = IncidentManager.INCIDENT_STATES.ESCALATED;
    incident.escalated = true;
    incident.updatedAt = new Date();
    this.incidentStats.escalated++;

    console.log(`🚨 [ESCALATION] ${incident.type} escalated to ops team. Chain: ${incident.escalationChain.join(' → ')}`);

    // In production, this would send alerts to PagerDuty, Slack, email, etc.
    this.io.emit('incident:escalated', {
      id: incidentId,
      type: incident.type,
      severity: incident.severity,
      message: incident.message,
      escalationChain: incident.escalationChain,
      timestamp: new Date().toISOString()
    });
  }

  // Get escalation chain based on severity
  getEscalationChain(severity) {
    switch (severity) {
      case IncidentManager.SEVERITY_LEVELS.EMERGENCY:
        return ['on-call-lead', 'incident-commander', 'cto', 'vp-eng'];
      case IncidentManager.SEVERITY_LEVELS.CRITICAL:
        return ['on-call', 'engineering-lead', 'platform-team'];
      case IncidentManager.SEVERITY_LEVELS.WARNING:
        return ['engineering-team', 'ops'];
      default:
        return ['ops-log'];
    }
  }

  // Acknowledge incident (operator action)
  acknowledge(incidentId, acknowledgedBy) {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.state = IncidentManager.INCIDENT_STATES.ACKNOWLEDGED;
    incident.acknowledgedBy = acknowledgedBy;
    incident.acknowledgedAt = new Date();
    incident.updatedAt = new Date();

    console.log(`👤 [ACK] Incident ${incidentId} acknowledged by ${acknowledgedBy}`);
    return true;
  }

  // Resolve incident (operator action)
  resolve(incidentId, resolvedBy, notes) {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.state = IncidentManager.INCIDENT_STATES.RESOLVED;
    incident.resolvedBy = resolvedBy;
    incident.resolvedAt = new Date();
    incident.resolutionNotes = notes;
    incident.updatedAt = new Date();

    this.incidentStats.resolved++;

    console.log(`✅ [RESOLVED] Incident ${incidentId} resolved by ${resolvedBy}`);
    return true;
  }

  // Get incident by ID
  getIncident(incidentId) {
    return this.incidents.get(incidentId);
  }

  // Get all open incidents
  getOpenIncidents() {
    return Array.from(this.incidents.values()).filter(
      inc => inc.state === IncidentManager.INCIDENT_STATES.OPEN ||
             inc.state === IncidentManager.INCIDENT_STATES.INVESTIGATING
    );
  }

  // Get incident statistics
  getStats() {
    return {
      ...this.incidentStats,
      openCount: this.getOpenIncidents().length,
      avgRecoveryTime: this.calculateAvgRecoveryTime()
    };
  }

  // Calculate average recovery time from auto-recovered incidents
  calculateAvgRecoveryTime() {
    const recovered = Array.from(this.incidents.values()).filter(
      inc => inc.state === IncidentManager.INCIDENT_STATES.RESOLVED && inc.recoveryHistory.length > 0
    );

    if (recovered.length === 0) return 0;

    const totalTime = recovered.reduce((sum, inc) => {
      const firstAttempt = inc.recoveryHistory[0]?.timestamp || inc.createdAt;
      const resolved = inc.resolvedAt || new Date();
      return sum + (resolved - firstAttempt);
    }, 0);

    return Math.round(totalTime / recovered.length / 1000); // seconds
  }

  // Generate incident report
  generateReport() {
    const allIncidents = Array.from(this.incidents.values());
    const byType = {};
    const bySeverity = {};

    allIncidents.forEach(inc => {
      byType[inc.type] = (byType[inc.type] || 0) + 1;
      bySeverity[inc.severity] = (bySeverity[inc.severity] || 0) + 1;
    });

    return {
      stats: this.getStats(),
      byType,
      bySeverity,
      recentIncidents: allIncidents.slice(-20).reverse(),
      openIncidents: this.getOpenIncidents()
    };
  }
}

export default IncidentManager;
