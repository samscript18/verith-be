import { EntitlementPlan } from '../enums/entitlement-plan.enum';

export interface EntitlementPolicy {
  dailyInvestigationLimit: number;
  videoInvestigationCost: number;
  maximumMediaSizeBytes: number;
  maximumVideoDurationSeconds: number;
  exportAllowance: number | null;
  historyRetentionDays: number | null;
  collections: boolean;
  priorityClass: 'STANDARD' | 'SPONSORED';
  organizationFeatures: boolean;
}

const free: EntitlementPolicy = {
  dailyInvestigationLimit: 3,
  videoInvestigationCost: 2,
  maximumMediaSizeBytes: 12 * 1024 * 1024,
  maximumVideoDurationSeconds: 60,
  exportAllowance: null,
  historyRetentionDays: null,
  collections: false,
  priorityClass: 'STANDARD',
  organizationFeatures: false,
};

export const ENTITLEMENT_POLICIES: Record<EntitlementPlan, EntitlementPolicy> =
  {
    [EntitlementPlan.FREE]: free,
    [EntitlementPlan.PLUS]: { ...free },
    [EntitlementPlan.COMMUNITY]: {
      ...free,
      organizationFeatures: true,
    },
    [EntitlementPlan.ADMINISTRATIVE_SPONSORSHIP]: {
      ...free,
      dailyInvestigationLimit: 10,
      priorityClass: 'SPONSORED',
      organizationFeatures: true,
    },
  };
