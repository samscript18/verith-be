import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates, type Connection } from 'mongoose';

@Injectable()
export class DatabaseService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  isReady(): boolean {
    return this.connection.readyState === ConnectionStates.connected;
  }

  getState(): number {
    return this.connection.readyState;
  }
}
