import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import { PromptStatus } from '../enums/prompt-status.enum';

export class PromptAdminQueryDto {
  @IsOptional() @IsString() @Length(2, 120) key?: string;
  @IsOptional() @IsEnum(PromptStatus) status?: PromptStatus;
  @IsOptional() @IsMongoId() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class CreatePromptVersionDto {
  @IsString() @Length(2, 120) key!: string;
  @IsString() @Length(2, 120) task!: string;
  @IsString() @Length(10, 50000) systemPrompt!: string;
  @IsString() @Length(3, 50000) userPromptTemplate!: string;
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(AiProviderName, { each: true })
  supportedProviders!: AiProviderName[];
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  supportedModels!: string[];
  @IsString() @Length(2, 120) outputSchemaVersion!: string;
  @IsString() @Length(10, 1000) changeSummary!: string;
  @IsString() @Length(10, 1000) reason!: string;
}

export class PromptActionDto {
  @IsString() @Length(10, 1000) reason!: string;
}
