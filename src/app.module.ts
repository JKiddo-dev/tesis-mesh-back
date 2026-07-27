import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventosGateway } from './events/events.gateway';
import { MongooseModule } from '@nestjs/mongoose';
import { Telemetry, TelemetrySchema } from './schemas/telemetry.schema';
import { User, UserSchema } from './schemas/user.schema';
import { AuthModule } from './auth/auth.module';
import { Settings, SettingsSchema } from './schemas/settings.schema';
import { ScheduleModule } from '@nestjs/schedule';
import { CleanupService } from './cleanup.service';

@Module({
  imports: [MongooseModule.forRoot('mongodb://localhost:27017/tesis_mesh'),
    MongooseModule.forFeature([
      { name: Telemetry.name, schema: TelemetrySchema },
      { name: User.name, schema: UserSchema },
      { name: Settings.name, schema: SettingsSchema},
    ]),
    AuthModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService, EventosGateway, CleanupService],
})
export class AppModule {}
