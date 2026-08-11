export enum DomainEventName {
  VERIFICATION_COMPLETED = 'verification.completed.v1',
  VERIFICATION_FAILED = 'verification.failed.v1',
  SECURITY_ALERT_REQUESTED = 'security.alert-requested.v1',
}

export enum SecurityAlertKind {
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

export interface VerificationCompletedPayload {
  verificationId: string;
  reportId: string;
  userId: string;
}

export interface VerificationFailedPayload {
  verificationId: string;
  userId: string;
  failureCode: string;
}

export interface SecurityAlertRequestedPayload {
  userId: string;
  kind: SecurityAlertKind;
}

export interface DomainEventPayloadMap {
  [DomainEventName.VERIFICATION_COMPLETED]: VerificationCompletedPayload;
  [DomainEventName.VERIFICATION_FAILED]: VerificationFailedPayload;
  [DomainEventName.SECURITY_ALERT_REQUESTED]: SecurityAlertRequestedPayload;
}

export interface DomainEventEnvelope<TName extends DomainEventName> {
  id: string;
  name: TName;
  version: 1;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  occurredAt: Date;
  payload: DomainEventPayloadMap[TName];
}

export interface PublishDomainEventInput<TName extends DomainEventName> {
  name: TName;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  deduplicationKey: string;
  payload: DomainEventPayloadMap[TName];
}
