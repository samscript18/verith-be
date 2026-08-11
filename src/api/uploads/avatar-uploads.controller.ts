import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { ConflictException } from '../../core/exceptions';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { UsersService } from '../users/users.service';
import { ConfirmUploadDto } from './dto/upload.dto';
import { AssetType } from './enums/asset-type.enum';
import { UploadsService } from './uploads.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/avatar')
export class AvatarUploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly usersService: UsersService,
  ) {}

  @Post('upload-signature')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a signed avatar upload request' })
  signature(@CurrentUser() user: AuthUser) {
    return this.uploadsService.createSignature(user.userId, AssetType.AVATAR);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm and attach an uploaded avatar' })
  async confirm(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmUploadDto,
  ): Promise<Record<string, unknown>> {
    const asset = await this.uploadsService.confirm(
      user.userId,
      dto,
      AssetType.AVATAR,
    );
    const secureUrl = asset.secureUrl;
    if (typeof secureUrl !== 'string') {
      throw new ConflictException(
        'The confirmed avatar has no usable provider URL',
        'CLOUDINARY_INVALID_RESPONSE',
      );
    }
    const profile = await this.usersService.updateAvatar(
      user.userId,
      secureUrl,
    );
    await this.uploadsService.attachAvatar(user.userId, dto.assetId);
    return { asset, profile };
  }
}
