import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  BadgeCriteriaType,
  LeaderboardPeriod,
} from '../enums/gamification.enum';

export class LeaderboardQueryDto {
  @ApiPropertyOptional({
    default: LeaderboardPeriod.ALL_TIME,
    enum: LeaderboardPeriod,
  })
  @IsEnum(LeaderboardPeriod)
  period: LeaderboardPeriod = LeaderboardPeriod.ALL_TIME;

  @ApiPropertyOptional({ default: 20, maximum: 100, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class RewardTransactionQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: 100, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class CreateBadgeDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsString() @MinLength(2) @MaxLength(100) slug!: string;
  @IsString() @MinLength(3) @MaxLength(1000) description!: string;
  @IsString() @MinLength(2) @MaxLength(100) category!: string;
  @IsEnum(BadgeCriteriaType) criteriaType!: BadgeCriteriaType;
  @IsObject() criteria!: Record<string, unknown>;
  @IsString() @MinLength(2) @MaxLength(50) rarity!: string;
  @IsObject() reward!: { xp?: number; truthPoints?: number };
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateBadgeDto extends PartialType(CreateBadgeDto) {}
