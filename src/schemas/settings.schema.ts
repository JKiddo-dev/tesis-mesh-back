import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SettingsDocument = Settings & Document;

@Schema({ timestamps: true })
export class Settings {
  @Prop({ default: 'mqtt://broker.emqx.io:1883' })
  mqttBrokerUrl!: string;

  @Prop({ default: 'tesis/utem/mesh/#' })
  mqttTopic!: string;

  @Prop({ default: -33.4660619 }) // Coordenadas de UTEM sede Macul por defecto
  mapCenterLat!: number;

  @Prop({ default: -70.5980495 })
  mapCenterLng!: number;

  @Prop({ default: 13 })
  mapZoom!: number;

  @Prop({ default: true })
  notificationsEnabled!: boolean;

  @Prop({ default: 30 }) 
  retentionDays!: number;

  @Prop({ required: false })
  mqttUsername?: string;

  @Prop({ required: false })
  mqttPassword?: string;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);