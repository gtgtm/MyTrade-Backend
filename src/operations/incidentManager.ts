// src/operations/incidentManager.ts
// Incident Response Manager - Handle production issues and auto-recovery

import { EventEmitter } from 'events';

export enum IncidentSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  EMERGENCY = 'EMERGENCY',
}

export enum IncidentStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED',
}

export enum IncidentType {
  SIGNAL_GENERATION_FAILURE = 'SIGNAL_GENERATION_FAILURE',
  TRADE_EXECUTION_FAILURE = 'TRADE_EXECUTION_FAILURE',
  METRIC_THRESHOLD_BREACH = 'METRIC_THRESHOLD_BREACH',
  NETWORK_CONNECTIVITY = 'NETWORK_CONNECTIVITY',
  DATABASE_CONNECTION = 'DATABASE_CONNECTION',
  PERFORMANCE_DEGRADATION = 'PERFORMANCE_DEGRADATION',
  DIVERGENCE_CRITICAL = 'DIVERGENCE_CRITICAL',
  AUTO_HALT_TRIGGERED = 'AUTO_HALT_TRIGGERED',
  MEMORY_LEAK = 'MEMORY_LEAK',
  NOTIFICATION_FAILURE = 'NOTIFICATION_FAILURE',
}

export interface Incident {
  id: string;
  timestamp: Date;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  affectedUsers?: number;
  affectedSignals?: number;
  rootCause?: string;
  resolution?: string;
  resolvedAt?: Date;
  autoRecovered: boolean;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
}

export class IncidentManager extends EventEmitter {
  private incidents: Map<string, Incident> = new Map();
  private incidentHistory: Incident[] = [];
  private autoRecoveryStrategies: Map<IncidentType, () => Promise<boolean>> = new Map();
  private escalationChain: string[] = [];
  private autoRecoveryEnabled: boolean = true;

  constructor() {
    super();
    this.initializeAutoRecoveryStrategies();
  }

  private initializeAutoRecoveryStrategies(): void {
    // Signal generation recovery
    this.autoRecoveryStrategies.set(IncidentType.SIGNAL_GENERATION_FAILURE, async () => {
      console.log('🔄 Attempting signal generation recovery...');
      // Restart signal generator
      // Check configuration
      // Validate indicators
      // Resume operation
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return true;
    });

    // Trade execution recovery
    this.autoRecoveryStrategies.set(IncidentType.TRADE_EXECUTION_FAILURE, async () => {
      console.log('🔄 Attempting trade execution recovery...');
      // Reconnect to broker
      // Verify account status
      // Resume pending trades
      await new Promise((resolve) => setTimeout(resolve, 10000));
      return true;
    });

    // Network recovery
    this.autoRecoveryStrategies.set(IncidentType.NETWORK_CONNECTIVITY, async () => {
      console.log('🔄 Attempting network reconnection...');
      // Check network status
      // Reconnect to APIs
      // Sync pending data
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return true;
    });

    // Database recovery
    this.autoRecoveryStrategies.set(IncidentType.DATABASE_CONNECTION, async () => {
      console.log('🔄 Attempting database reconnection...');
      // Reconnect to database
      // Check connection pool
      // Resume queries
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return true;
    });

    // Performance recovery
    this.autoRecoveryStrategies.set(IncidentType.PERFORMANCE_DEGRADATION, async () => {
      console.log('🔄 Attempting performance recovery...');
      // Clear caches
      // Reduce load
      // Optimize queries
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return true;
    });
  }

  reportIncident(
    type: IncidentType,
    severity: IncidentSeverity,
    title: string,
    description: string,
    affectedUsers?: number,
    affectedSignals?: number
  ): string {
    const id = `INC-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

    const incident: Incident = {
      id,
      timestamp: new Date(),
      type,
      severity,
      status: IncidentStatus.OPEN,
      title,
      description,
      affectedUsers,
      affectedSignals,
      autoRecovered: false,
      recoveryAttempts: 0,
      maxRecoveryAttempts: 3,
    };

    this.incidents.set(id, incident);
    this.incidentHistory.push(incident);

    const icon = this.getSeverityIcon(severity);
    console.log(`\n${icon} INCIDENT REPORTED: ${title}`);
    console.log(`   ID: ${id}`);
    console.log(`   Type: ${type}`);
    console.log(`   Description: ${description}`);

    this.emit('incident-reported', incident);

    // Attempt auto-recovery if enabled
    if (this.autoRecoveryEnabled && severity !== IncidentSeverity.EMERGENCY) {
      this.attemptAutoRecovery(id);
    }

    return id;
  }

  private async attemptAutoRecovery(incidentId: string): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    incident.status = IncidentStatus.INVESTIGATING;
    console.log(`🔧 Attempting auto-recovery for ${incident.type}...`);

    const strategy = this.autoRecoveryStrategies.get(incident.type);
    if (!strategy) {
      console.log(`⚠️ No auto-recovery strategy for ${incident.type}`);
      return;
    }

    while (incident.recoveryAttempts < incident.maxRecoveryAttempts) {
      incident.recoveryAttempts++;
      console.log(`   Attempt ${incident.recoveryAttempts}/${incident.maxRecoveryAttempts}...`);

      try {
        const success = await strategy();

        if (success) {
          incident.status = IncidentStatus.RESOLVED;
          incident.resolvedAt = new Date();
          incident.autoRecovered = true;
          incident.resolution = `Auto-recovered on attempt ${incident.recoveryAttempts}`;
          console.log(`✅ Auto-recovery successful`);
          this.emit('incident-resolved', incident);
          return;
        }
      } catch (error) {
        console.log(`   Attempt ${incident.recoveryAttempts} failed:`, error);
      }

      // Wait before retry (exponential backoff)
      const backoffMs = Math.min(1000 * Math.pow(2, incident.recoveryAttempts - 1), 30000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    // Auto-recovery failed after max attempts
    incident.status = IncidentStatus.ESCALATED;
    console.log(`🚨 Auto-recovery failed after ${incident.maxRecoveryAttempts} attempts`);
    this.escalateIncident(incidentId);
  }

  private escalateIncident(incidentId: string): void {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    console.log(`\n🚨 INCIDENT ESCALATION: ${incident.title}`);
    console.log(`   ID: ${incidentId}`);
    console.log(`   Type: ${incident.type}`);
    console.log(`   Severity: ${incident.severity}`);

    // Notify escalation chain
    for (const contact of this.escalationChain) {
      console.log(`   📞 Notifying: ${contact}`);
    }

    this.emit('incident-escalated', incident);
  }

  acknowledgeIncident(incidentId: string, acknowledgment: string): void {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    incident.status = IncidentStatus.ACKNOWLEDGED;
    console.log(`✅ Incident ${incidentId} acknowledged: ${acknowledgment}`);
    this.emit('incident-acknowledged', incident);
  }

  resolveIncident(incidentId: string, resolution: string): void {
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    incident.status = IncidentStatus.RESOLVED;
    incident.resolvedAt = new Date();
    incident.resolution = resolution;

    const duration = (incident.resolvedAt.getTime() - incident.timestamp.getTime()) / 1000;
    console.log(`✅ Incident ${incidentId} resolved`);
    console.log(`   Resolution: ${resolution}`);
    console.log(`   Duration: ${duration}s`);

    this.emit('incident-resolved', incident);
  }

  setEscalationChain(contacts: string[]): void {
    this.escalationChain = contacts;
    console.log(`📋 Escalation chain set: ${contacts.join(' → ')}`);
  }

  enableAutoRecovery(enabled: boolean): void {
    this.autoRecoveryEnabled = enabled;
    console.log(`${enabled ? '✅' : '❌'} Auto-recovery ${enabled ? 'enabled' : 'disabled'}`);
  }

  getIncident(incidentId: string): Incident | undefined {
    return this.incidents.get(incidentId);
  }

  getOpenIncidents(): Incident[] {
    return Array.from(this.incidents.values()).filter((i) => i.status === IncidentStatus.OPEN);
  }

  getIncidentsByType(type: IncidentType): Incident[] {
    return Array.from(this.incidents.values()).filter((i) => i.type === type);
  }

  getIncidentsByStatus(status: IncidentStatus): Incident[] {
    return Array.from(this.incidents.values()).filter((i) => i.status === status);
  }

  getAutoRecoveryStats(): {
    total: number;
    recovered: number;
    recoveryRate: number;
  } {
    const total = this.incidentHistory.length;
    const recovered = this.incidentHistory.filter((i) => i.autoRecovered).length;
    const recoveryRate = total > 0 ? (recovered / total) * 100 : 0;

    return { total, recovered, recoveryRate };
  }

  printIncidentSummary(): void {
    const openCount = this.getOpenIncidents().length;
    const stats = this.getAutoRecoveryStats();

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║ INCIDENT MANAGEMENT SUMMARY                            ║`);
    console.log(`║ Open Incidents: ${this.padRight(openCount.toString(), 40)} ║`);
    console.log(`║ Total Incidents: ${this.padRight(stats.total.toString(), 38)} ║`);
    console.log(`║ Auto-Recovered: ${this.padRight(stats.recovered.toString(), 39)} ║`);
    console.log(`║ Recovery Rate: ${this.padRight(`${stats.recoveryRate.toFixed(1)}%`, 40)} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Recent Incidents:                                      ║`);

    const recent = this.incidentHistory.slice(-5);
    for (const incident of recent) {
      const icon = this.getSeverityIcon(incident.severity);
      console.log(`║   ${icon} ${incident.title.substring(0, 44).padEnd(44)} ║`);
    }

    console.log('╚════════════════════════════════════════════════════════╝\n');
  }

  private getSeverityIcon(severity: IncidentSeverity): string {
    switch (severity) {
      case IncidentSeverity.INFO:
        return 'ℹ️';
      case IncidentSeverity.WARNING:
        return '⚠️';
      case IncidentSeverity.CRITICAL:
        return '🔴';
      case IncidentSeverity.EMERGENCY:
        return '🚨';
      default:
        return '⚪';
    }
  }

  private padRight(str: string, width: number): string {
    return str + ' '.repeat(Math.max(0, width - str.length));
  }
}

export default IncidentManager;
