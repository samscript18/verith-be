import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../../core/pipes/parse-object-id.pipe';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import {
  ChallengeCatalogQueryDto,
  SubmitChallengeDto,
} from '../dto/challenge.dto';
import { ChallengesService } from '../services/challenges.service';

@ApiTags('Challenges')
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}
  @Get() list(@Query() query: ChallengeCatalogQueryDto) {
    return this.challenges.listAvailable(query);
  }
  @Get('today') today() {
    return this.challenges.today();
  }
  @Get(':slug') get(@Param('slug') slug: string) {
    return this.challenges.getBySlug(slug);
  }
  @Post(':id/attempts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  attempt(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SubmitChallengeDto,
  ) {
    return this.challenges.submit(user.userId, id, dto);
  }
  @Get(':id/attempts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  attempts(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.challenges.myAttempts(user.userId, id);
  }
}
