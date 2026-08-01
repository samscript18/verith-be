import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import type { Model, Types } from 'mongoose';
import { ConflictException, NotFoundException } from '../../core/exceptions';
import type {
  UpdatePreferencesDto,
  UpdatePrivacyDto,
  UpdateProfileDto,
} from './dto/update-user.dto';
import { AuthProvider } from './enums/auth-provider.enum';
import { UserStatus } from './enums/user-status.enum';
import { User, type UserDocument } from './schemas/user.schema';

export interface CreateUserInput {
  email: string;
  username: string;
  passwordHash: string;
  displayName?: string;
}

export interface CreateGoogleUserInput {
  email: string;
  googleSubject: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async create(input: CreateUserInput): Promise<UserDocument> {
    try {
      return await this.userModel.create({
        ...input,
        emailNormalized: this.normalize(input.email),
        usernameNormalized: this.normalize(input.username),
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException(
          'An account with that email or username already exists',
          'USER_ALREADY_EXISTS',
        );
      }
      throw error;
    }
  }

  async createGoogle(input: CreateGoogleUserInput): Promise<UserDocument> {
    const suffix = createHash('sha256')
      .update(input.googleSubject)
      .digest('hex')
      .slice(0, 8);
    const emailStem = input.email.split('@')[0] ?? 'verith_user';
    const base =
      emailStem
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 21) || 'verith_user';
    const username = `${base}_${suffix}`.slice(0, 30);

    try {
      return await this.userModel.create({
        email: input.email,
        emailNormalized: this.normalize(input.email),
        username,
        usernameNormalized: this.normalize(username),
        authProvider: AuthProvider.GOOGLE,
        googleSubject: input.googleSubject,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        ...(input.displayName
          ? { displayName: input.displayName.slice(0, 80) }
          : {}),
        ...(input.firstName ? { firstName: input.firstName.slice(0, 80) } : {}),
        ...(input.lastName ? { lastName: input.lastName.slice(0, 80) } : {}),
        ...(input.avatar ? { avatar: input.avatar } : {}),
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException(
          'This Google identity is already connected to a Verith account',
          'GOOGLE_ACCOUNT_ALREADY_EXISTS',
        );
      }
      throw error;
    }
  }

  findByIdentifierWithPassword(
    identifier: string,
  ): Promise<UserDocument | null> {
    const normalized = this.normalize(identifier);
    return this.userModel
      .findOne({
        $or: [
          { emailNormalized: normalized },
          { usernameNormalized: normalized },
        ],
      })
      .select('+passwordHash')
      .exec();
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ emailNormalized: this.normalize(email) })
      .exec();
  }

  findByGoogleSubject(googleSubject: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleSubject }).exec();
  }

  async findByIdOrThrow(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(
        'The user could not be found',
        'USER_NOT_FOUND',
      );
    }
    return user;
  }

  async activate(userId: Types.ObjectId): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId, status: UserStatus.PENDING_VERIFICATION },
        { $set: { status: UserStatus.ACTIVE, emailVerifiedAt: new Date() } },
      )
      .exec();
  }

  async updatePassword(
    userId: Types.ObjectId,
    passwordHash: string,
  ): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { $set: { passwordHash } })
      .exec();
  }

  async recordLogin(userId: Types.ObjectId): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { $set: { lastLoginAt: new Date(), lastActiveAt: new Date() } },
      )
      .exec();
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<Record<string, unknown>> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: dto },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!user) {
      throw new NotFoundException(
        'The user could not be found',
        'USER_NOT_FOUND',
      );
    }
    return this.toPrivateProfile(user);
  }

  async updateAvatar(
    userId: string,
    secureUrl: string,
  ): Promise<Record<string, unknown>> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { avatar: secureUrl } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!user) {
      throw new NotFoundException(
        'The user could not be found',
        'USER_NOT_FOUND',
      );
    }
    return this.toPrivateProfile(user);
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<Record<string, unknown>> {
    const updates = Object.fromEntries(
      Object.entries(dto.preferences).map(([key, value]) => [
        `notificationPreferences.${key}`,
        value,
      ]),
    );
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: updates }, { returnDocument: 'after' })
      .exec();
    if (!user) {
      throw new NotFoundException(
        'The user could not be found',
        'USER_NOT_FOUND',
      );
    }
    return this.toPrivateProfile(user);
  }

  async updatePrivacy(
    userId: string,
    dto: UpdatePrivacyDto,
  ): Promise<Record<string, unknown>> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: {
            privacyPreferences: {
              publicProfile: dto.publicProfile,
              leaderboard: dto.leaderboard,
            },
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!user) {
      throw new NotFoundException(
        'The user could not be found',
        'USER_NOT_FOUND',
      );
    }
    return this.toPrivateProfile(user);
  }

  async getPrivateProfile(userId: string): Promise<Record<string, unknown>> {
    return this.toPrivateProfile(await this.findByIdOrThrow(userId));
  }

  async getPublicProfile(username: string): Promise<Record<string, unknown>> {
    const user = await this.userModel
      .findOne({
        usernameNormalized: this.normalize(username),
        status: UserStatus.ACTIVE,
        'privacyPreferences.publicProfile': true,
      })
      .exec();
    if (!user) {
      throw new NotFoundException(
        'The public profile could not be found',
        'PUBLIC_PROFILE_NOT_FOUND',
      );
    }
    return {
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatar: user.avatar,
      authProvider: user.authProvider ?? AuthProvider.LOCAL,
      createdAt: user.createdAt,
    };
  }

  async requestDeletion(userId: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId, status: UserStatus.ACTIVE },
        {
          $set: {
            status: UserStatus.DELETION_PENDING,
            deletionRequestedAt: new Date(),
          },
        },
      )
      .exec();
  }

  async cancelDeletion(userId: string): Promise<void> {
    await this.userModel
      .updateOne(
        {
          _id: userId,
          status: UserStatus.DELETION_PENDING,
          erasureProcessingAt: { $exists: false },
        },
        {
          $set: { status: UserStatus.ACTIVE },
          $unset: { deletionRequestedAt: 1 },
        },
      )
      .exec();
  }

  toPrivateProfile(user: UserDocument): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      avatar: user.avatar,
      role: user.role,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
      timezone: user.timezone,
      theme: user.theme,
      notificationPreferences: user.notificationPreferences,
      privacyPreferences: user.privacyPreferences,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletionRequestedAt: user.deletionRequestedAt,
    };
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase();
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
