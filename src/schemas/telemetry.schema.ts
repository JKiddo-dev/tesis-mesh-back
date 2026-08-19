import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TelemetryDocument = Telemetry & Document;

@Schema({ timestamps: true }) 
export class Telemetry {
  @Prop({ required: true })
  nodoId!: string; 

  @Prop({ required: false, default: null })
  nodoDestino?: string;

  @Prop({ required: true })
  tipoPaquete!: string;

  @Prop()
  latitud?: number;

  @Prop()
  longitud?: number;

  @Prop()
  mensajeTexto?: string;

  @Prop({ type: Object })
  metadatos?: Record<string, any>;
}

export const TelemetrySchema = SchemaFactory.createForClass(Telemetry);
