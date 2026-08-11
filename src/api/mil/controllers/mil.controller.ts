import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { MediaLiteracyCompetency } from '../../verifications/enums/guided-investigation.enum';
import { CompetencyService } from '../services/competency.service';

class CompetencyEvidenceQueryDto {
  @IsOptional()
  @IsEnum(MediaLiteracyCompetency)
  competency?: MediaLiteracyCompetency;
}

@ApiTags('Media Literacy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mil')
export class MilController {
  constructor(private readonly competencies: CompetencyService) {}
  @Get('profile') profile(@CurrentUser() user: AuthUser) {
    return this.competencies.profile(user.userId);
  }
  @Get('profile/evidence') evidence(
    @CurrentUser() user: AuthUser,
    @Query() query: CompetencyEvidenceQueryDto,
  ) {
    return this.competencies.evidenceFor(user.userId, query.competency);
  }
}
