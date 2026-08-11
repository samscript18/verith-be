import { EventEmitter2 } from '@nestjs/event-emitter';
import { firstValueFrom } from 'rxjs';
import { VerificationStreamController } from './verification-stream.controller';
import { VerificationEventService } from '../services/verification-event.service';
import { VerificationService } from '../services/verification.service';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';

describe('VerificationStreamController', () => {
  it('authorizes ownership and emits recorded catch-up events first', async () => {
    const verificationService = {
      findOwned: jest.fn().mockResolvedValue({ id: 'verification-id' }),
    };
    const eventService = {
      list: jest.fn().mockResolvedValue([
        {
          sequence: 4,
          id: 'event-id',
        },
      ]),
      toResponse: jest.fn().mockReturnValue({
        sequence: 4,
        messageCode: 'INPUT_VALIDATED',
      }),
      channel: jest.fn().mockReturnValue('verification.verification-id'),
    };
    const controller = new VerificationStreamController(
      verificationService as unknown as VerificationService,
      eventService as unknown as VerificationEventService,
      new EventEmitter2(),
    );

    const stream = await controller.stream(
      {
        userId: 'user-id',
        sessionId: 'session-id',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
      'verification-id',
      { after: 3 },
    );

    await expect(firstValueFrom(stream)).resolves.toMatchObject({
      id: '4',
      type: 'verification.event',
      data: { sequence: 4, messageCode: 'INPUT_VALIDATED' },
    });
    expect(verificationService.findOwned).toHaveBeenCalledWith(
      'user-id',
      'verification-id',
    );
    expect(eventService.list).toHaveBeenCalledWith('verification-id', 3);
  });
});
