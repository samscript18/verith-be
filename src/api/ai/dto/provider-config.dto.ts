import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  Length,
} from 'class-validator';
import { AiProviderName } from '../enums/ai-provider-name.enum';

export class UpdateProviderConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(AiProviderName, { each: true })
  enabledProviders!: AiProviderName[];

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(AiProviderName, { each: true })
  defaultOrder!: AiProviderName[];

  @IsString() @Length(10, 1000) reason!: string;
}
