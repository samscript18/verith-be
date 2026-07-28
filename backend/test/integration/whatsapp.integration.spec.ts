import { getConnectionToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { Types, type Connection } from 'mongoose';
import { AppModule } from '../../src/app.module';
import { WhatsAppLinkService } from '../../src/api/whatsapp/services/whatsapp-link.service';
import { WhatsAppService } from '../../src/api/whatsapp/services/whatsapp.service';
import { WHATSAPP_QUEUE } from '../../src/api/whatsapp/whatsapp.constants';

describe('WhatsApp secure account linking (integration)', () => {
  jest.setTimeout(30000);
  let moduleRef: TestingModule;
  let connection: Connection;
  let links: WhatsAppLinkService;
  let whatsapp: WhatsAppService;
  let queue: Queue;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
    links = moduleRef.get(WhatsAppLinkService);
    whatsapp = moduleRef.get(WhatsAppService);
    queue = moduleRef.get<Queue>(getQueueToken(WHATSAPP_QUEUE));
    await queue.pause();
  });
  afterAll(async () => {
    await connection.collection('whatsapp_links').deleteMany({});
    await connection.collection('whatsapp_messages').deleteMany({});
    await queue.drain();
    await moduleRef.close();
  });

  it('deduplicates repeated webhook deliveries by Meta message ID', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.duplicate-test',
                    from: '2348099999999',
                    type: 'text',
                    text: { body: 'A claim to verify' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await whatsapp.acceptWebhook(payload);
    await whatsapp.acceptWebhook(payload);
    expect(
      await connection
        .collection('whatsapp_messages')
        .countDocuments({ wamid: 'wamid.duplicate-test' }),
    ).toBe(1);
  });

  it('consumes a hashed one-time code and removes linkage data on unlink', async () => {
    const userId = new Types.ObjectId().toString();
    const issued = await links.createCode(userId);
    const phone = '2348012345678';
    const linked = await links.consumeCode(phone, issued.code);
    expect(linked?.userId.toString()).toBe(userId);
    expect(await links.consumeCode(phone, issued.code)).toBeNull();
    expect(await links.status(userId)).toEqual({ linked: true });
    expect((await links.resolve(phone))?.userId.toString()).toBe(userId);
    await links.unlink(userId);
    expect(await links.status(userId)).toEqual({ linked: false });
    expect(await links.resolve(phone)).toBeNull();
  });
});
