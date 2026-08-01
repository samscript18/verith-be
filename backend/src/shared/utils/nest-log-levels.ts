import type { LogLevel } from '@nestjs/common';

const orderedLevels: LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

const levelAliases: Record<string, LogLevel> = {
  fatal: 'fatal',
  error: 'error',
  warn: 'warn',
  info: 'log',
  log: 'log',
  debug: 'debug',
  trace: 'verbose',
  verbose: 'verbose',
};

export function nestLogLevels(
  configuredLevel = process.env.LOG_LEVEL ?? 'debug',
): LogLevel[] {
  const threshold = levelAliases[configuredLevel.toLowerCase()] ?? 'debug';
  return orderedLevels.slice(0, orderedLevels.indexOf(threshold) + 1);
}
