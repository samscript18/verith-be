import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CourseStatus,
  LearningDifficulty,
  LessonStatus,
} from '../enums/learning.enum';

export class CreateCourseDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug!: string;
  @IsString() @MinLength(10) @MaxLength(3000) description!: string;
  @IsEnum(LearningDifficulty) difficulty!: LearningDifficulty;
  @IsInt() @Min(1) @Max(10000) estimatedDuration!: number;
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  learningObjectives!: string[];
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) tags!: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsMongoId({ each: true })
  prerequisiteCourseIds?: string[];
}

export class CreateLessonDto {
  @IsMongoId() courseId!: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug!: string;
  @IsString() @MinLength(10) @MaxLength(1000) summary!: string;
  @IsString() @MinLength(1) @MaxLength(100000) contentHtml!: string;
  @IsInt() @Min(1) @Max(1000) estimatedDuration!: number;
  @IsInt() @Min(1) @Max(10000) sequence!: number;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) tags!: string[];
}

export class UpdateCourseStatusDto {
  @ApiProperty({ enum: CourseStatus })
  @IsEnum(CourseStatus)
  status!: CourseStatus;
}

export class UpdateLessonStatusDto {
  @ApiProperty({ enum: LessonStatus })
  @IsEnum(LessonStatus)
  status!: LessonStatus;
}

export class UpdateLessonProgressDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  lastPosition?: number;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

export class UpdateLessonDto extends PartialType(CreateLessonDto) {}

export class LearningAdminQueryDto {
  @IsOptional() @IsMongoId() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
