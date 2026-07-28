import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
export class NotificationQueryDto {
  @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsMongoId() cursor?: string;
}
