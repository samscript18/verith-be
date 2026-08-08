import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EntitlementPlan } from '../enums/entitlement-plan.enum';

export class EntitlementOverridesDto {
  @IsOptional() @IsInt() @Min(1) @Max(100) dailyInvestigationLimit?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10) videoInvestigationCost?: number;
  @IsOptional() @IsInt() @Min(1_000_000) maximumMediaSizeBytes?: number;
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(600)
  maximumVideoDurationSeconds?: number;
  @IsOptional() @IsBoolean() collections?: boolean;
  @IsOptional() @IsBoolean() organizationFeatures?: boolean;
}

export class GrantEntitlementDto {
  @IsEnum(EntitlementPlan) plan!: EntitlementPlan;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EntitlementOverridesDto)
  overrides?: EntitlementOverridesDto;
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}
