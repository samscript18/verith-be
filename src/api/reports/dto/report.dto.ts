import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  ReportFeedbackType,
  ReportProblemCategory,
  ReportVisibility,
} from '../enums/report.enum';

export class UpdateReportVisibilityDto {
  @ApiProperty({ enum: ReportVisibility })
  @IsEnum(ReportVisibility)
  visibility!: ReportVisibility;
}

export class ReportFeedbackDto {
  @ApiProperty({ enum: ReportFeedbackType })
  @IsEnum(ReportFeedbackType)
  type!: ReportFeedbackType;

  @ApiPropertyOptional({ enum: ReportProblemCategory })
  @ValidateIf(
    (value: ReportFeedbackDto) =>
      value.type === ReportFeedbackType.PROBLEM_REPORTED,
  )
  @IsEnum(ReportProblemCategory)
  category?: ReportProblemCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
