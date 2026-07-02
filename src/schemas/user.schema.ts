import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  nombre?: string;

  @Prop({ required: true, unique: true })
  email?: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, default: 'Operador', enum: ['Admin', 'Operador'] })
  rol?: string;

  @Prop({ required: true, default: 'Activo', enum: ['Activo', 'Inactivo'] })
  estado?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);