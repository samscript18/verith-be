import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { VerificationSourceType } from '../enums/verification-source-type.enum';
import { VerificationStatus } from '../enums/verification-status.enum';
import { VerificationVisibility } from '../enums/verification-visibility.enum';
import { InvestigationMode } from '../enums/investigation-mode.enum';

export class CreateVerificationDto {
  @ApiPropertyOptional({
    enum: InvestigationMode,
    default: InvestigationMode.STANDARD,
  })
  @IsOptional()
  @IsEnum(InvestigationMode)
  mode?: InvestigationMode;

  @ApiProperty({ enum: VerificationSourceType })
  @IsEnum(VerificationSourceType)
  sourceType!: VerificationSourceType;

  @ApiPropertyOptional({ maxLength: 50000 })
  @IsOptional()
  @IsString()
  @Length(1, 50000)
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  mediaAssetId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  question?: string;

  @ApiPropertyOptional({ default: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  requestedLanguage?: string;

  @ApiPropertyOptional({
    enum: VerificationVisibility,
    default: VerificationVisibility.PRIVATE,
  })
  @IsOptional()
  @IsEnum(VerificationVisibility)
  visibility?: VerificationVisibility;
}

export class VerificationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;
}

export class VerificationEventsQueryDto {
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  after = 0;
}

export class UpdateVerificationVisibilityDto {
  @ApiProperty({ enum: VerificationVisibility })
  @IsEnum(VerificationVisibility)
  visibility!: VerificationVisibility;
}

export const normalizeIdempotencyKey = (value: string | undefined): string => {
  const normalized = value?.trim();
  if (!normalized || normalized.length < 8 || normalized.length > 128) {
    return '';
  }
  return normalized;
};
