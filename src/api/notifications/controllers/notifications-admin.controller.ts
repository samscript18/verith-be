import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import type { RequestWithId } from '../../../core/types/request-with-id.type';
import { AuditService } from '../../admin/services/audit.service';
import { UserRole } from '../../users/enums/user-role.enum';
import { ProductMessageDto } from '../dto/product-message.dto';
import { NotificationType } from '../enums/notification.enum';
import { NotificationsService } from '../services/notifications.service';

@ApiTags('Notifications Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/notifications')
export class NotificationsAdminController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  @Post('product-messages')
  async broadcastProductMessage(
    @CurrentUser() actor: AuthUser,
    @Body() dto: ProductMessageDto,
    @Req() request: RequestWithId,
  ) {
    const result = await this.notifications.broadcast({
      type: NotificationType.SYSTEM_MESSAGE,
      title: dto.title,
      message: dto.message,
      idempotencyReference: `product-message:${dto.reference}`,
      ...(dto.actionUrl ? { actionUrl: dto.actionUrl } : {}),
      metadata: { reference: dto.reference },
    });
    await this.audit.record({
      actor,
      action: 'PRODUCT_MESSAGE_BROADCAST',
      resourceType: 'NOTIFICATION_BROADCAST',
      resourceId: dto.reference,
      requestId: request.requestId,
      reason: 'Sent a product message to active users who enabled the category',
      safeAfter: {
        title: dto.title,
        actionUrl: dto.actionUrl ?? null,
        ...result,
      },
    });
    return result;
  }
}
