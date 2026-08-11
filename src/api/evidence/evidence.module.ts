import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Evidence, EvidenceSchema } from './schemas/evidence.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Evidence.name, schema: EvidenceSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class EvidenceModule {}
