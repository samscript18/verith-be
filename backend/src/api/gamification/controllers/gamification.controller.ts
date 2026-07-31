import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import {
  LeaderboardQueryDto,
  RewardTransactionQueryDto,
} from '../dto/gamification.dto';
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
  transactions(
    @CurrentUser() user: AuthUser,
    @Query() query: RewardTransactionQueryDto,
  ) {
    return this.gamification.listTransactions(user.userId, query);
  }

  @Get('badges')
  badges() {
    return this.gamification.listBadges();
  }

  @Get('badges/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  myBadges(@CurrentUser() user: AuthUser) {
    return this.gamification.listBadges(user.userId);
  }

  @Get('leaderboards')
  leaderboard(@Query() query: LeaderboardQueryDto) {
    return this.gamification.leaderboard(query);
  }
}
