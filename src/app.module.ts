import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventosGateway } from './events/events.gateway';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, EventosGateway],
})
export class AppModule {}
