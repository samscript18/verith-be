export interface VerificationJobData {
  jobId: string;
  verificationId: string;
  requestId: string;
  attempt: number;
  schemaVersion: number;
  createdAt: string;
}
