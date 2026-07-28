import { Global, Module } from '@nestjs/common';
import { MailService } from './mail/mail.service';

@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class SharedModule {}
