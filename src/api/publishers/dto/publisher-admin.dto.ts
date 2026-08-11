import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  PublisherCredibilityLevel,
  PublisherReviewStatus,
} from '../enums/publisher.enum';

export class PublisherAdminQueryDto {
  @IsOptional() @IsString() @Length(2, 100) search?: string;
  @IsOptional() @IsEnum(PublisherReviewStatus) status?: PublisherReviewStatus;
  @IsOptional()
  @IsEnum(PublisherCredibilityLevel)
  credibility?: PublisherCredibilityLevel;
  @IsOptional() @IsMongoId() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class PublisherOverrideDto {
  @IsString() @Length(10, 1000) reason!: string;
  @IsEnum(PublisherReviewStatus) reviewStatus!: PublisherReviewStatus;
  @IsEnum(PublisherCredibilityLevel)
  credibilityLevel!: PublisherCredibilityLevel;
  @IsOptional() @IsString() @Length(2, 200) name?: string;
  @IsOptional() @IsString() @Length(2, 2000) description?: string;
  @IsOptional() @IsString() @Length(2, 100) country?: string;
  @IsOptional() @IsBoolean() ownershipTransparency?: boolean;
  @IsOptional() @IsBoolean() editorialPolicyAvailable?: boolean;
  @IsOptional() @IsBoolean() correctionsPolicyAvailable?: boolean;
  @IsOptional() @IsBoolean() authorTransparency?: boolean;
  @IsOptional() @IsBoolean() contactTransparency?: boolean;
  @IsOptional() @IsBoolean() primarySourceUsage?: boolean;
  @IsOptional() @IsArray() @IsUrl({}, { each: true }) references?: string[];
}
