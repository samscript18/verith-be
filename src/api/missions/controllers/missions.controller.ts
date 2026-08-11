import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import {
  CompleteMissionScenarioDto,
  JoinMissionDto,
  SubmitMissionAssessmentDto,
} from '../dto/mission.dto';
import { AssessmentPhase } from '../enums/mission.enum';
import { MissionsService } from '../services/missions.service';

@ApiTags('Community Missions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('missions')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}
  @Get() list(@CurrentUser() user: AuthUser) {
    return this.missions.list(user.userId);
  }
  @Get(':slug') get(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
  ) {
    return this.missions.get(user.userId, slug);
  }
  @Post(':slug/join') join(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: JoinMissionDto,
  ) {
    return this.missions.join(user.userId, slug, dto.consent);
  }
  @Get(':slug/assessments/:phase') assessment(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Param('phase', new ParseEnumPipe(AssessmentPhase)) phase: AssessmentPhase,
  ) {
    return this.missions.assessment(user.userId, slug, phase);
  }
  @Post(':slug/assessments/:phase/attempts') submit(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Param('phase', new ParseEnumPipe(AssessmentPhase)) phase: AssessmentPhase,
    @Body() dto: SubmitMissionAssessmentDto,
  ) {
    return this.missions.submit(user.userId, slug, phase, dto);
  }
  @Post(':slug/scenarios/complete') scenario(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: CompleteMissionScenarioDto,
  ) {
    return this.missions.completeScenario(user.userId, slug, dto);
  }
  @Get(':slug/impact') impact(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
  ) {
    return this.missions.impact(user.userId, slug);
  }
}
