import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { RecordAnalyticsEventDto } from '../dto/analytics-event.dto';
import { AnalyticsService } from '../services/analytics.service';

@ApiTags('Product analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class ProductAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Record a privacy-safe product interaction' })
  record(@CurrentUser() user: AuthUser, @Body() dto: RecordAnalyticsEventDto) {
    return this.analytics.recordEvent(user.userId, dto);
  }
}
