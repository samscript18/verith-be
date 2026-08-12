import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length, Matches } from 'class-validator';
import { ReportService } from '../services/report.service';
import { ReportLanguageQueryDto } from '../dto/report.dto';

class PublicSlugDto {
  @IsString()
  @Length(32, 64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  slug!: string;
}

@ApiTags('Public Reports')
@Controller('public/reports')
export class PublicReportsController {
  constructor(private readonly reports: ReportService) {}

  @Get(':slug')
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  @ApiOperation({ summary: 'Retrieve a sanitized shared report' })
  get(@Param() params: PublicSlugDto, @Query() query: ReportLanguageQueryDto) {
    return this.reports.publicBySlug(params.slug, query.language);
  }
}
