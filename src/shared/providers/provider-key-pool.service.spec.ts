import { ProviderKeyPoolService } from './provider-key-pool.service';

describe('ProviderKeyPoolService', () => {
  it('selects healthy keys deterministically without exposing their values', () => {
    const pool = new ProviderKeyPoolService().forProvider('TEST', [
      'first-secret',
      'second-secret',
      'first-secret',
    ]);

    const first = pool.acquire();
    expect(first).not.toBeNull();
    first?.succeed();
    const second = pool.acquire();
    expect(second).not.toBeNull();
    expect(second?.fingerprint).not.toBe(first?.fingerprint);
    second?.succeed();

    expect(pool.status()).toMatchObject({
      configuredKeys: 2,
      healthyKeys: 2,
      cooldownKeys: 0,
      disabledKeys: 0,
    });
    expect(JSON.stringify(pool.status())).not.toContain('secret');
  });

  it('disables an authentication-failed key and cools down rate-limited keys', () => {
    const pool = new ProviderKeyPoolService().forProvider('TEST', [
      'first',
      'second',
    ]);
    const first = pool.acquire();
    first?.fail('TEST_AUTHENTICATION_FAILED');
    const second = pool.acquire();
    second?.fail('TEST_RATE_LIMITED', 30_000);

    expect(pool.acquire()).toBeNull();
    expect(pool.status()).toMatchObject({
      configuredKeys: 2,
      healthyKeys: 0,
      cooldownKeys: 1,
      disabledKeys: 1,
    });
  });
});
