import { getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types, type Connection } from 'mongoose';
import { AppModule } from '../../src/app.module';
import { VerificationSourceType } from '../../src/api/verifications/enums/verification-source-type.enum';
import { VerificationStatus } from '../../src/api/verifications/enums/verification-status.enum';
import { VerificationEventService } from '../../src/api/verifications/services/verification-event.service';
import { VerificationService } from '../../src/api/verifications/services/verification.service';
import {
  ConflictException,
  NotFoundException,
} from '../../src/core/exceptions';

describe('Verification lifecycle (integration)', () => {
  jest.setTimeout(30000);
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: VerificationService;
  let events: VerificationEventService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(VerificationService);
    events = moduleRef.get(VerificationEventService);
  });

  afterAll(async () => {
    await connection.collection('verification_events').deleteMany({});
    await connection.collection('idempotency_records').deleteMany({});
    await connection.collection('verifications').deleteMany({});
    await moduleRef.close();
  });

  it('creates once, initializes through BullMQ, persists events, and enforces ownership', async () => {
    const userId = new Types.ObjectId().toString();
    const dto = {
      sourceType: VerificationSourceType.TEXT,
      text: 'A factual statement that should be investigated.',
    };
    const created = await service.create(
      userId,
      dto,
      'verification-key-0001',
      'req-create',
    );
    const id = created.id as string;
    const repeated = await service.create(
      userId,
      dto,
      'verification-key-0001',
      'req-repeat',
    );
    expect(repeated.id).toBe(id);

    await expect(
      service.create(
        userId,
        { ...dto, text: 'Different content' },
        'verification-key-0001',
        'req-conflict',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    await waitUntil(async () => {
      const current = await service.get(userId, id);
      return current.status === VerificationStatus.PROCESSING;
    });
    const timeline = await events.list(id);
    expect(timeline.map((event) => event.messageCode)).toEqual(
      expect.arrayContaining([
        'VERIFICATION_RECEIVED',
        'INPUT_VALIDATED',
        'CONTENT_EXTRACTION_PENDING',
      ]),
    );
    expect(timeline.map((event) => event.sequence)).toEqual([1, 2, 3]);
    await expect(
      service.get(new Types.ObjectId().toString(), id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const cancelled = await service.cancel(userId, id, 'req-cancel');
    expect(cancelled.status).toBe(VerificationStatus.CANCELLED);
    const retried = await service.retry(userId, id, 'req-retry');
    expect(retried.status).toBe(VerificationStatus.QUEUED);
    expect(retried.retryCount).toBe(1);
  });
});

async function waitUntil(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await check()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for verification worker');
}
