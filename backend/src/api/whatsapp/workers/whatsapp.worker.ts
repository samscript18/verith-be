import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { WHATSAPP_INBOUND_JOB, WHATSAPP_QUEUE } from '../whatsapp.constants';
import { WhatsAppService } from '../services/whatsapp.service';

@Processor(WHATSAPP_QUEUE, {
  concurrency: 5,
  drainDelay: 300,
  stalledInterval: 600_000,
})
export class WhatsAppWorker extends WorkerHost {
  constructor(private readonly whatsapp: WhatsAppService) {
    super();
  }
  process(job: Job): Promise<void> {
    if (job.name !== WHATSAPP_INBOUND_JOB) return Promise.resolve();
    return this.whatsapp.processInbound(job.data as never);
  }
}
