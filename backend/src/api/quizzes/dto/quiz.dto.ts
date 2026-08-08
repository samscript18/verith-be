import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { QuizQuestionType, QuizStatus } from '../enums/quiz.enum';

class QuizOptionDto {
  @IsString() @MinLength(1) @MaxLength(100) id!: string;
  @IsString() @MinLength(1) @MaxLength(500) text!: string;
}

class QuizQuestionDto {
  @IsString() @MinLength(1) @MaxLength(100) id!: string;
  @IsEnum(QuizQuestionType) type!: QuizQuestionType;
  @IsString() @MinLength(3) @MaxLength(2000) prompt!: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => QuizOptionDto)
  options!: QuizOptionDto[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  correctOptionIds!: string[];
  @IsString() @MinLength(3) @MaxLength(2000) explanation!: string;
}

export class CreateQuizDto {
  @IsMongoId() courseId!: string;
  @IsMongoId() lessonId!: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(3) @MaxLength(2000) description!: string;
  @IsInt() @Min(0) @Max(100) passingScore!: number;
  @IsInt() @Min(1) @Max(100) maxAttempts!: number;
  @IsObject() rewardPolicy!: Record<string, unknown>;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions!: QuizQuestionDto[];
}

export class UpdateQuizStatusDto {
  @IsEnum(QuizStatus) status!: QuizStatus;
}

export class UpdateQuizDto extends PartialType(CreateQuizDto) {}

export class QuizAdminQueryDto {
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
  @ApiPropertyOptional({ enum: QuizStatus })
  @IsOptional()
  @IsEnum(QuizStatus)
  status?: QuizStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  courseId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  lessonId?: string;
}

class QuizAnswerDto {
  @IsString() questionId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  selectedOptionIds!: string[];
}

export class SubmitQuizDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];
}
