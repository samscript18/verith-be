import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsMongoId,
  IsOptional,
  IsString,
  IsUUID,
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

export class AchievementBackfillDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @ApiPropertyOptional({ default: 25, maximum: 100, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export enum BadgeEarnedFilter {
  ALL = 'ALL',
  EARNED = 'EARNED',
  LOCKED = 'LOCKED',
}

export class BadgeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  cursor?: string;
  @ApiPropertyOptional({ default: 20, maximum: 100, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  rarity?: string;
}

export class BadgeCatalogQueryDto extends BadgeQueryDto {
  @ApiPropertyOptional({
    default: BadgeEarnedFilter.ALL,
    enum: BadgeEarnedFilter,
  })
  @IsOptional()
  @IsEnum(BadgeEarnedFilter)
  earned = BadgeEarnedFilter.ALL;
}

export class BadgeAdminQueryDto extends BadgeQueryDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;
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

export class AcknowledgeCelebrationDto {
  @IsUUID()
  claimToken!: string;
}
