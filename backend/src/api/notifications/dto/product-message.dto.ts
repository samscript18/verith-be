import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ProductMessageDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  message!: string;

  @ApiPropertyOptional({ example: '/app/learning' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^\/(?!\/)/, {
    message: 'actionUrl must be an internal Verith path',
  })
  actionUrl?: string;

  @ApiProperty({
    description: 'Stable reference used to prevent duplicate broadcasts',
    example: 'learning-catalog-august-2026',
  })
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9:_-]+$/)
  reference!: string;
}
