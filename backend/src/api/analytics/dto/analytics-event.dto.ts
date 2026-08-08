import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AnalyticsEventType } from '../enums/analytics-event.enum';

export class RecordAnalyticsEventDto {
  @IsEnum(AnalyticsEventType) event!: AnalyticsEventType;
  @IsOptional() @IsMongoId() verificationId?: string;
  @IsOptional() @IsMongoId() reportId?: string;
  @IsOptional() @IsMongoId() missionId?: string;
  @IsOptional() @IsString() @MaxLength(64) sourceType?: string;
  @IsOptional() @IsString() @MaxLength(64) mode?: string;
  @IsOptional() @IsString() @MaxLength(64) feature?: string;
}
