import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminModule } from '../admin/admin.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { EntitlementsController } from './controllers/entitlements.controller';
import {
  UserEntitlement,
  UserEntitlementSchema,
} from './schemas/user-entitlement.schema';
import { EntitlementService } from './services/entitlement.service';

@Module({
  imports: [
    AdminModule,
    MongooseModule.forFeature([
      { name: UserEntitlement.name, schema: UserEntitlementSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [EntitlementsController],
  providers: [EntitlementService],
  exports: [EntitlementService],
})
export class EntitlementsModule {}
