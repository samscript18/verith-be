import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { LeaderboardQueryDto } from '../dto/gamification.dto';
import { GamificationService } from '../services/gamification.service';

@ApiTags('Gamification')
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.gamification.getProfile(user.userId);
  }

  @Get('transactions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  transactions(@CurrentUser() user: AuthUser) {
    return this.gamification.listTransactions(user.userId);
  }

  @Get('badges')
  badges() {
    return this.gamification.listBadges();
  }

  @Get('leaderboards')
  leaderboard(@Query() query: LeaderboardQueryDto) {
    return this.gamification.leaderboard(query);
  }
}
