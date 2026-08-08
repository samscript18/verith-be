import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MilController } from './controllers/mil.controller';
import {
  CompetencyEvidence,
  CompetencyEvidenceSchema,
} from './schemas/competency-evidence.schema';
import {
  MilGrowthProfile,
  MilGrowthProfileSchema,
} from './schemas/mil-growth-profile.schema';
import { CompetencyService } from './services/competency.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CompetencyEvidence.name, schema: CompetencyEvidenceSchema },
      { name: MilGrowthProfile.name, schema: MilGrowthProfileSchema },
    ]),
  ],
  controllers: [MilController],
  providers: [CompetencyService],
  exports: [CompetencyService],
})
export class MilModule {}
