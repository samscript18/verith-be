import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export class NotificationQueryDto {
  @ApiPropertyOptional({ default: 20, maximum: 100, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsMongoId()
  cursor?: string;
}

export class NotificationUnreadCountDto {
  @ApiProperty({
    description: 'Number of persisted notifications not yet marked as read',
    example: 3,
    minimum: 0,
    type: Number,
  })
  unreadCount!: number;
}
