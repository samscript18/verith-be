import { nestLogLevels } from './nest-log-levels';

describe('nestLogLevels', () => {
  it('maps Pino-compatible info to the Nest log threshold', () => {
    expect(nestLogLevels('info')).toEqual(['fatal', 'error', 'warn', 'log']);
  });

  it('maps trace to all built-in Nest log levels', () => {
    expect(nestLogLevels('trace')).toEqual([
      'fatal',
      'error',
      'warn',
      'log',
      'debug',
      'verbose',
    ]);
  });

  it('defaults unknown values to debug', () => {
    expect(nestLogLevels('unknown')).toEqual([
      'fatal',
      'error',
      'warn',
      'log',
      'debug',
    ]);
  });
});
