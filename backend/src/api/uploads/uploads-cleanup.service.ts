import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { UploadsService } from './uploads.service';

@Injectable()
export class UploadsCleanupService {
  private readonly logger = new Logger(UploadsCleanupService.name);

  constructor(private readonly uploadsService: UploadsService) {}

  @Interval('upload-orphan-cleanup', 60 * 60 * 1000)
  async cleanup(): Promise<void> {
    const deleted = await this.uploadsService.cleanupExpiredPending();
    if (deleted > 0) {
      this.logger.log({ event: 'expired_uploads_deleted', count: deleted });
    }
  }
}
