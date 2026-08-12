import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  theme?: string;
}

export class NotificationPreferencesDto {
  @IsOptional() @IsBoolean() verificationComplete?: boolean;
  @IsOptional() @IsBoolean() verificationFailed?: boolean;
  @IsOptional() @IsBoolean() learningRecommendations?: boolean;
  @IsOptional() @IsBoolean() dailyChallenges?: boolean;
  @IsOptional() @IsBoolean() streakReminders?: boolean;
  @IsOptional() @IsBoolean() gamification?: boolean;
  @IsOptional() @IsBoolean() marketing?: boolean;
  @IsOptional() @IsBoolean() security?: boolean;
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ type: Object })
  @IsDefined()
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  preferences!: NotificationPreferencesDto;
}

export class UpdatePrivacyDto {
  @ApiPropertyOptional()
  @IsBoolean()
  publicProfile!: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  leaderboard!: boolean;
}
