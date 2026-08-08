import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Session, SessionSchema } from '../auth/schemas/session.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  Verification,
  VerificationSchema,
} from '../verifications/schemas/verification.schema';
import { VerificationQueueModule } from '../verifications/verification-queue.module';
import { AdminController } from './controllers/admin.controller';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { AdminService } from './services/admin.service';
import { AuditService } from './services/audit.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Verification.name, schema: VerificationSchema },
    ]),
    VerificationQueueModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AuditService],
  exports: [AuditService],
})
export class AdminModule {}
