import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import {
  UpdatePreferencesDto,
  UpdatePrivacyDto,
  UpdateProfileDto,
} from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':username/public')
  publicProfile(@Param('username') username: string) {
    return this.usersService.getPublicProfile(username);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  profile(@CurrentUser() user: AuthUser) {
    return this.usersService.getPrivateProfile(user.userId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  @Patch('me/notifications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updateNotifications(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.usersService.updateNotificationPreferences(user.userId, dto);
  }

  @Patch('me/privacy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updatePrivacy(@CurrentUser() user: AuthUser, @Body() dto: UpdatePrivacyDto) {
    return this.usersService.updatePrivacy(user.userId, dto);
  }

  @Post('me/deletion-request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.ACCEPTED)
  requestDeletion(@CurrentUser() user: AuthUser): Promise<void> {
    return this.usersService.requestDeletion(user.userId);
  }

  @Delete('me/deletion-request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelDeletion(@CurrentUser() user: AuthUser): Promise<void> {
    return this.usersService.cancelDeletion(user.userId);
  }
}
