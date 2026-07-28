import { getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types, type Connection } from 'mongoose';
import { AppModule } from '../../src/app.module';
import { PrivacyService } from '../../src/api/privacy/services/privacy.service';
import { UserStatus } from '../../src/api/users/enums/user-status.enum';

describe('Privacy export and erasure (integration)', () => {
  jest.setTimeout(30000);
  let moduleRef: TestingModule;
  let connection: Connection;
  let privacy: PrivacyService;
  const userId = new Types.ObjectId();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    connection = moduleRef.get(getConnectionToken());
    privacy = moduleRef.get(PrivacyService);
    await connection.collection('users').insertOne({
      _id: userId,
      email: 'privacy@example.test',
      emailNormalized: 'privacy@example.test',
      username: 'privacy-user',
      usernameNormalized: 'privacy-user',
      passwordHash: 'must-not-export',
      role: 'USER',
      status: UserStatus.ACTIVE,
      notificationPreferences: {},
      privacyPreferences: { publicProfile: false, leaderboard: false },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    for (const collection of [
      'privacy_jobs',
      'audit_logs',
      'notifications',
      'users',
    ])
      await connection.collection(collection).deleteMany({ _id: userId });
    await connection.collection('privacy_jobs').deleteMany({ userId });
    await moduleRef.close();
  });

  it('creates an encrypted expiring export without secret fields', async () => {
    const request = await privacy.requestExport(
      userId.toString(),
      'privacy-export-test',
    );
    await privacy.processExport(request.id, userId.toString());
    const bytes = await privacy.download(
      userId.toString(),
      request.id,
      request.downloadToken,
    );
    const exported = JSON.parse(bytes.toString()) as {
      profile: Record<string, unknown>;
    };
    expect(exported.profile.email).toBe('privacy@example.test');
    expect(exported.profile.passwordHash).toBeUndefined();
    await expect(
      privacy.download(userId.toString(), request.id, 'x'.repeat(43)),
    ).rejects.toMatchObject({ code: 'DATA_EXPORT_NOT_AVAILABLE' });
  });

  it('erases owned data but retains an audit-safe record', async () => {
    await connection.collection('notifications').insertOne({
      userId,
      type: 'SECURITY_ALERT',
      title: 'Security',
      message: 'Test',
      idempotencyReference: 'privacy-delete-test',
      emailStatus: 'NOT_REQUESTED',
    });
    await connection.collection('audit_logs').insertOne({
      _id: new Types.ObjectId(),
      actorId: userId,
      actorRole: 'USER',
      action: 'ACCOUNT_DELETION_REQUESTED',
      resourceType: 'USER',
      resourceId: userId.toString(),
      requestId: 'privacy-delete-test',
      reason: 'User requested account erasure',
      createdAt: new Date(),
    });
    await connection.collection('users').updateOne(
      { _id: userId },
      {
        $set: {
          status: UserStatus.DELETION_PENDING,
          deletionRequestedAt: new Date(0),
        },
      },
    );

    await expect(privacy.processPendingDeletions()).resolves.toBe(1);
    const erased = await connection
      .collection('users')
      .findOne({ _id: userId });
    expect(erased?.status).toBe(UserStatus.DELETED);
    expect(erased?.passwordHash).toBe('!ACCOUNT_ERASED!');
    expect(erased?.email).toContain('@deleted.invalid');
    expect(
      await connection.collection('notifications').countDocuments({ userId }),
    ).toBe(0);
    expect(
      await connection
        .collection('audit_logs')
        .countDocuments({ actorId: userId }),
    ).toBe(1);
  });
});
