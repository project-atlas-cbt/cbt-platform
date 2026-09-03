import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { NOTIFICATION_TYPES, type NotificationType } from '@atlas/domain';

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class NotificationResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, enum: NOTIFICATION_TYPES })
  type!: NotificationType;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  content!: string;

  @ApiProperty({ type: String, enum: ['UNREAD', 'READ'] })
  status!: 'UNREAD' | 'READ';

  @ApiPropertyOptional({ type: String, nullable: true })
  relatedEntityType!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  relatedEntityId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  readAt!: string | null;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items!: NotificationResponseDto[];

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;

  /** Shown on the bell trigger regardless of which page is open. */
  @ApiProperty({ type: Number })
  unreadCount!: number;
}

export class MarkReadResponseDto {
  @ApiProperty({ type: String, enum: ['ok'] })
  status!: 'ok';
}
