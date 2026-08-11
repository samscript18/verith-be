import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ReportFeedbackStatus } from '../enums/report.enum';

export class ReportFeedbackAdminQueryDto {
  @IsOptional() @IsEnum(ReportFeedbackStatus) status?: ReportFeedbackStatus;
  @IsOptional() @IsMongoId() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class ResolveReportFeedbackDto {
  @IsEnum(ReportFeedbackStatus) status!: ReportFeedbackStatus;
  @IsString() @Length(10, 2000) resolution!: string;
  @IsString() @Length(10, 1000) reason!: string;
}
