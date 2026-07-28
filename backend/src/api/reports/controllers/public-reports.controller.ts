import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { ReportService } from '../services/report.service';

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
  @ApiOperation({ summary: 'Retrieve a sanitized shared report' })
  get(@Param() params: PublicSlugDto) {
    return this.reports.publicBySlug(params.slug);
  }
}
