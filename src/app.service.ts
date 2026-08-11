import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getRoot(): { name: string; status: string; documentation: string } {
    return {
      name: 'Verith API',
      status: 'operational',
      documentation: '/api/docs',
    };
  }
}
