export type ProcessRole = 'all' | 'api' | 'worker' | 'scheduler';

export const processRole = (): ProcessRole => {
  const configured = process.env.PROCESS_ROLE;
  if (
    configured === 'all' ||
    configured === 'api' ||
    configured === 'worker' ||
    configured === 'scheduler'
  )
    return configured;
  return process.env.NODE_ENV === 'production' ? 'api' : 'all';
};

export const runsWorkers = () =>
  processRole() === 'all' || processRole() === 'worker';

export const runsScheduler = () =>
  processRole() === 'all' || processRole() === 'scheduler';
