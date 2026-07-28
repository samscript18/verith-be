import { Global, Module } from '@nestjs/common';
import { MailService } from './mail/mail.service';
import { SafeFetchService } from './services/safe-fetch.service';

@Global()
@Module({
  providers: [MailService, SafeFetchService],
  exports: [MailService, SafeFetchService],
})
export class SharedModule {}
