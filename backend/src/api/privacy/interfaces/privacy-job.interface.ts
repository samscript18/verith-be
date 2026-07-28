import { PrivacyJobType } from '../enums/privacy-job.enum';

export interface PrivacyQueueJob {
  jobId: string;
  privacyJobId: string;
  userId: string;
  type: PrivacyJobType;
  requestId: string;
  schemaVersion: number;
  createdAt: string;
}
