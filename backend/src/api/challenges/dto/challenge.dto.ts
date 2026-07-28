import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
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
import { QuizQuestionType } from '../../quizzes/enums/quiz.enum';
import { ChallengeDifficulty, ChallengeStatus } from '../enums/challenge.enum';

class ChallengeOptionDto {
  @IsString() @MinLength(1) @MaxLength(100) id!: string;
  @IsString() @MinLength(1) @MaxLength(500) text!: string;
}
class ChallengeQuestionDto {
  @IsString() @MinLength(1) @MaxLength(100) id!: string;
  @IsEnum(QuizQuestionType) type!: QuizQuestionType;
  @IsString() @MinLength(3) @MaxLength(2000) prompt!: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ChallengeOptionDto)
  options!: ChallengeOptionDto[];
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  correctOptionIds!: string[];
  @IsString() @MinLength(3) @MaxLength(2000) explanation!: string;
}
export class CreateChallengeDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(3) @MaxLength(100) slug!: string;
  @IsString() @MinLength(3) @MaxLength(3000) scenario!: string;
  @IsString() @MinLength(3) @MaxLength(10000) content!: string;
  @IsOptional() @IsMongoId() mediaAssetId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChallengeQuestionDto)
  questions!: ChallengeQuestionDto[];
  @IsEnum(ChallengeDifficulty) difficulty!: ChallengeDifficulty;
  @IsObject() rewardPolicy!: { xp: number; truthPoints: number };
  @IsInt() @Min(1) @Max(100) maxAttempts!: number;
  @IsInt() @Min(0) @Max(100) passingScore!: number;
  @IsDateString() publishAt!: string;
  @IsDateString() expiresAt!: string;
}
export class UpdateChallengeStatusDto {
  @IsEnum(ChallengeStatus) status!: ChallengeStatus;
}
class ChallengeAnswerDto {
  @IsString() questionId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  selectedOptionIds!: string[];
}
export class SubmitChallengeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChallengeAnswerDto)
  answers!: ChallengeAnswerDto[];
}
