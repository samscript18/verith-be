import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../core/pipes/parse-object-id.pipe';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ConfirmUploadDto, CreateUploadSignatureDto } from './dto/upload.dto';
import { UploadsService } from './uploads.service';

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('signature')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Create an owner-bound signed upload request' })
  signature(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUploadSignatureDto,
  ) {
    return this.uploadsService.createSignature(user.userId, dto.assetType);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Verify and persist a Cloudinary upload' })
  confirm(@CurrentUser() user: AuthUser, @Body() dto: ConfirmUploadDto) {
    return this.uploadsService.confirm(user.userId, dto);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.uploadsService.get(user.userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.uploadsService.delete(user.userId, id);
  }
}
