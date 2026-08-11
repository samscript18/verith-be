import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
import { VerificationStatus } from '../../verifications/enums/verification-status.enum';

export class AdminReasonDto {
  @IsString()
  @Length(10, 1000)
  reason!: string;
}

export class AdminUserStatusDto extends AdminReasonDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}

export class AdminUserRoleDto extends AdminReasonDto {
  @IsEnum(UserRole)
  role!: UserRole;
}

export class AdminUserQueryDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  search?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class AdminVerificationQueryDto {
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;

  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class AuditQueryDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  action?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  resourceType?: string;

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
