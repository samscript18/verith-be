import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Publisher, PublisherSchema } from './schemas/publisher.schema';
import { PublishersService } from './services/publishers.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Publisher.name, schema: PublisherSchema },
    ]),
  ],
  providers: [PublishersService],
  exports: [PublishersService, MongooseModule],
})
export class PublishersModule {}
