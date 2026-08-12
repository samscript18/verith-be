import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectConnection } from '@nestjs/mongoose';
import type Redis from 'ioredis';
import { Connection } from 'mongoose';
import type { PrivacyConfig } from '../../../shared/config';
import { REDIS_CLIENT } from '../../integrations/redis/redis.constants';
import { PrivacyService } from './privacy.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private readonly config: PrivacyConfig;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly privacy: PrivacyService,
    config: ConfigService,
  ) {
    this.config = config.getOrThrow<PrivacyConfig>('privacy');
  }

  @Cron('0 20 2 * * *', { name: 'privacy-retention' })
  async run(): Promise<void> {
    const lockKey = 'verith:locks:privacy-retention';
    const locked = await this.redis.set(
      lockKey,
      process.pid.toString(),
      'EX',
      1800,
      'NX',
    );
    if (locked !== 'OK') return;
    try {
      const db = this.db();
      const now = new Date();
      const auditCutoff = new Date(
        Date.now() - this.config.auditRetentionDays * 86400000,
      );
      const [sessions, exports, audits, accounts] = await Promise.all([
        db.collection('sessions').deleteMany({ expiresAt: { $lte: now } }),
        db
          .collection('report_exports')
          .deleteMany({ expiresAt: { $lte: now } }),
        db.collection('audit_logs').deleteMany({
          createdAt: { $lte: auditCutoff },
        }),
        this.privacy.processPendingDeletions(),
      ]);
      this.logger.log({
        event: 'privacy_retention_completed',
        expiredSessions: sessions.deletedCount,
        expiredReportExports: exports.deletedCount,
        expiredAuditLogs: audits.deletedCount,
        erasedAccounts: accounts,
      });
    } finally {
      const owner = await this.redis.get(lockKey);
      if (owner === process.pid.toString()) await this.redis.del(lockKey);
    }
  }

  private db() {
    if (!this.connection.db) throw new Error('MongoDB is unavailable');
    return this.connection.db;
  }
}
