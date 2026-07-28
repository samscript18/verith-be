import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types, type Connection, type Model } from 'mongoose';
import { AppModule } from '../../src/app.module';
import { NotificationType } from '../../src/api/notifications/enums/notification.enum';
import { NotificationsService } from '../../src/api/notifications/services/notifications.service';
import { UserRole } from '../../src/api/users/enums/user-role.enum';
import { UserStatus } from '../../src/api/users/enums/user-status.enum';
import { User } from '../../src/api/users/schemas/user.schema';

describe('Notifications persistence and preferences (integration)', () => {
  jest.setTimeout(30000);
  let moduleRef: TestingModule;
  let connection: Connection;
  let users: Model<User>;
  let notifications: NotificationsService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
    users = moduleRef.get<Model<User>>(getModelToken(User.name));
    notifications = moduleRef.get(NotificationsService);
  });

  afterAll(async () => {
    await connection.collection('notifications').deleteMany({});
    await connection.collection('users').deleteMany({});
    await moduleRef.close();
  });

  it('honors optional preferences while preserving security alerts', async () => {
    const user = await users.create({
      email: 'notifications@example.com',
      emailNormalized: 'notifications@example.com',
      username: 'notifications',
      usernameNormalized: 'notifications',
      passwordHash: 'not-used-in-this-test',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      notificationPreferences: {
        verificationComplete: false,
        emailEnabled: false,
        security: false,
      },
    });
    const skipped = await notifications.dispatch({
      userId: user._id.toString(),
      type: NotificationType.VERIFICATION_COMPLETED,
      title: 'Complete',
      message: 'A report is ready.',
      idempotencyReference: 'verification:one:completed',
    });
    expect(skipped).toBeNull();

    const alert = await notifications.dispatch({
      userId: user._id.toString(),
      type: NotificationType.SECURITY_ALERT,
      title: 'Security alert',
      message: 'A session changed.',
      idempotencyReference: 'security:session:one',
    });
    expect(alert).not.toBeNull();
    const duplicate = await notifications.dispatch({
      userId: user._id.toString(),
      type: NotificationType.SECURITY_ALERT,
      title: 'Security alert',
      message: 'A session changed.',
      idempotencyReference: 'security:session:one',
    });
    expect(duplicate?.id).toBe(alert?.id);

    const listed = await notifications.list(user._id.toString(), { limit: 20 });
    expect(listed.data).toHaveLength(1);
    await notifications.markRead(user._id.toString(), alert?.id ?? '');
    await notifications.remove(user._id.toString(), alert?.id ?? '');
    const afterDelete = await notifications.list(user._id.toString(), {
      limit: 20,
    });
    expect(afterDelete.data).toHaveLength(0);
  });

  it('rejects notification ownership violations', async () => {
    const outsider = new Types.ObjectId().toString();
    await expect(
      notifications.markRead(outsider, new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_NOT_FOUND' });
  });
});
