import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telemetry, TelemetryDocument } from './schemas/telemetry.schema';
import { Settings, SettingsDocument } from './schemas/settings.schema';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @InjectModel(Telemetry.name) private telemetryModel: Model<TelemetryDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    this.logger.log('Iniciando tarea de limpieza automática de base de datos...');
    
    const config = await this.settingsModel.findOne().exec();
    const diasRetencion = config?.retentionDays || 30; 

    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - diasRetencion);

    try {
      const resultado = await this.telemetryModel.deleteMany({
        createdAt: { $lt: fechaLimite }
      }).exec();

      this.logger.log(`Limpieza completada: Se eliminaron ${resultado.deletedCount} registros anteriores a ${diasRetencion} días.`);
    } catch (error) {
      this.logger.error('Error crítico al intentar limpiar la base de datos', error);
    }
  }
}