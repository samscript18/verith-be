import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import {
  AcknowledgeCelebrationDto,
  BadgeCatalogQueryDto,
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
  badges(@Query() query: BadgeCatalogQueryDto) {
    return this.gamification.listBadges(query);
  }

  @Get('badges/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  myBadges(
    @CurrentUser() user: AuthUser,
    @Query() query: BadgeCatalogQueryDto,
  ) {
    return this.gamification.listBadges(query, user.userId);
  }

  @Get('leaderboards')
  leaderboard(@Query() query: LeaderboardQueryDto) {
    return this.gamification.leaderboard(query);
  }

  @Post('celebrations/claim')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  claimCelebrations(@CurrentUser() user: AuthUser) {
    return this.gamification.claimCelebrations(user.userId);
  }

  @Patch('celebrations/:id/seen')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  acknowledgeCelebration(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AcknowledgeCelebrationDto,
  ) {
    return this.gamification.acknowledgeCelebration(
      user.userId,
      id,
      dto.claimToken,
    );
  }
}
