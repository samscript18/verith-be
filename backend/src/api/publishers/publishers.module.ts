import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Publisher, PublisherSchema } from './schemas/publisher.schema';
import { PublishersService } from './services/publishers.service';
import { AdminModule } from '../admin/admin.module';
import { PublishersAdminController } from './controllers/publishers-admin.controller';

@Module({
  imports: [
    AdminModule,
    MongooseModule.forFeature([
      { name: Publisher.name, schema: PublisherSchema },
    ]),
  ],
  controllers: [PublishersAdminController],
  providers: [PublishersService],
  exports: [PublishersService, MongooseModule],
})
export class PublishersModule {}
