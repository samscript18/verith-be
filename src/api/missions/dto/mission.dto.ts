import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AssessmentPhase } from '../enums/mission.enum';

export class JoinMissionDto {
  @IsBoolean() consent!: boolean;
}
class MissionAnswerDto {
  @IsString() questionId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  selectedOptionIds!: string[];
}
export class SubmitMissionAssessmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MissionAnswerDto)
  answers!: MissionAnswerDto[];
}
export class MissionAssessmentPhaseDto {
  @IsEnum(AssessmentPhase) phase!: AssessmentPhase;
}
export class CompleteMissionScenarioDto {
  @IsString() scenarioId!: string;
  @IsString() @MaxLength(2000) reflection!: string;
}
