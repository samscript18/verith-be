import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  BadgeCriteriaType,
  LeaderboardPeriod,
} from '../enums/gamification.enum';

export class LeaderboardQueryDto {
  @IsEnum(LeaderboardPeriod)
  period: LeaderboardPeriod = LeaderboardPeriod.ALL_TIME;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20;
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
