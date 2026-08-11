/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { FIXED_BADGE_CATALOG } from '../constants/badge-catalog';
import { GamificationCatalogService } from './gamification-catalog.service';

describe('GamificationCatalogService', () => {
  it('seeds system-owned fixed badges without requiring a super admin', async () => {
    const badges = { updateOne: jest.fn().mockResolvedValue({}) };
    const users = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        }),
      }),
    };
    const service = new GamificationCatalogService(
      badges as never,
      users as never,
    );

    await service.onApplicationBootstrap();

    expect(badges.updateOne).toHaveBeenCalledTimes(FIXED_BADGE_CATALOG.length);
    for (const call of badges.updateOne.mock.calls) {
      const update = call[1] as {
        $set: Record<string, unknown>;
        $setOnInsert: Record<string, unknown>;
      };
      expect(update.$set).not.toHaveProperty('active');
      expect(update.$setOnInsert).toEqual({ active: true });
    }
  });

  it('preserves an existing badge active state while refreshing fixed fields', async () => {
    const badges = { updateOne: jest.fn().mockResolvedValue({}) };
    const users = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest
              .fn()
              .mockResolvedValue({ _id: '507f1f77bcf86cd799439011' }),
          }),
        }),
      }),
    };
    const service = new GamificationCatalogService(
      badges as never,
      users as never,
    );

    await service.onApplicationBootstrap();

    const update = badges.updateOne.mock.calls[0]?.[1] as {
      $set: Record<string, unknown>;
      $setOnInsert: Record<string, unknown>;
    };
    expect(update.$set).not.toHaveProperty('active');
    expect(update.$setOnInsert).toEqual(
      expect.objectContaining({ active: true, createdBy: expect.anything() }),
    );
  });
});
