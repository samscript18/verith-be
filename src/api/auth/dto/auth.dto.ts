import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum GoogleAuthIntent {
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
}

export class RegisterDto {
  @ApiProperty({ example: 'person@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'truthseeker' })
  @Matches(/^[a-zA-Z0-9_]{3,30}$/)
  username!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}

export class LoginDto {
  @ApiProperty()
  @IsString()
  identifier!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;
}

export class GoogleAuthDto {
  @ApiProperty({
    description: 'Google Identity Services ID-token credential',
  })
  @IsString()
  @Length(100, 10000)
  credential!: string;

  @ApiProperty({ enum: GoogleAuthIntent })
  @IsEnum(GoogleAuthIntent)
  intent!: GoogleAuthIntent;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;
}

export class GoogleAuthConfigDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ nullable: true })
  clientId!: string | null;
}

export class TokenDto {
  @ApiProperty()
  @IsString()
  @Length(32, 512)
  token!: string;
}

export class RefreshDto {
  @ApiPropertyOptional({
    description: 'Used by non-browser clients; browsers use the secure cookie',
  })
  @IsOptional()
  @IsString()
  token?: string;
}

export class EmailDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ minLength: 12 })
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 12 })
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
