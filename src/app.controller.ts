import { Controller, Get } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, MqttContext } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventosGateway } from './events/events.gateway'; 
import { Telemetry, TelemetryDocument } from './schemas/telemetry.schema'; 

@Controller()
export class AppController {
  
  constructor(
    private readonly eventosGateway: EventosGateway,
    @InjectModel(Telemetry.name) private telemetryModel: Model<TelemetryDocument>
  ) {}

  @Get('telemetry/nodes')
  async getActiveNodes() {
    console.log('[HTTP] Petición GET recibida en /telemtry/nodes');
    try {
      const nodosUnicos = await this.telemetryModel.distinct('nodoId').exec();
      return nodosUnicos;
    } catch (error) {
      console.log('Error obteniendo lista de nodos únicos', error);
      return [];
    }
  }

  @Get('telemetry/history')
  async getTelemetryHistory() {
    console.log('[HTTP] Petición GET recibida en /telemetry/history');
    try {
      const historial = await this.telemetryModel.find({ 
        tipoPaquete: 'position',
        latitud: { $ne: null },
        longitud: { $ne: null }
      })
      .sort({ createdAt: 1 }) // 1 = ascendente (del más antiguo al mas nuevo)
      .exec();

      return historial;
    } catch (error) {
      console.log('Error obteniendo historial de la BD', error);
      return { error: 'No se pudo obtener el historial' };
    }
  }
  
  @Get('telemetry/messages')
  async getMessagesHistory() {
    console.log('[HTTP] Petición GET recibida en /telemetry/messages');
    try {
      const mensajes = await this.telemetryModel.find()
        .sort({ createdAt: -1 }) // Los más nuevos primero
        .limit(50)
        .exec();

      return mensajes.reverse();
    } catch (error) {
      console.log('Error obteniendo historial de mensajes', error);
      return [];
    }
  }

  @MessagePattern('tesis/utem/mesh/#')
  async handleMeshtasticTraffic(@Payload() data: any, @Ctx() context: MqttContext) { 
    const topic = context.getTopic();
    console.log(`\n[MQTT PACKET RECEIVED] en el tópico: ${topic}`);
    
    try {
      let payloadParaFrontend: any = null;

      if (topic.includes('/e/') || topic.includes('/c/')) {
        console.log('Ignorando paquete binario (Protobuf).');
        return; 
      }

      if (typeof data === 'object' && !Buffer.isBuffer(data)) {
        payloadParaFrontend = data;
        // console.log('Contenido JSON:', JSON.stringify(payloadParaFrontend, null, 2));
      } 
      else {
        const stringData = data.toString();
        payloadParaFrontend = JSON.parse(stringData);
        // console.log('Contenido Parseado:', JSON.stringify(payloadParaFrontend, null, 2));
      }

      if (payloadParaFrontend) {
        
        let tipoPaquete = payloadParaFrontend.type || 'unknown';
        let latitud: number | undefined;
        let longitud: number | undefined;
        let mensajeTexto: string | undefined;

        if (tipoPaquete === 'position' && payloadParaFrontend.payload) {
          latitud = payloadParaFrontend.payload.latitude_i / 10000000;
          longitud = payloadParaFrontend.payload.longitude_i / 10000000;
        } else if (tipoPaquete === 'text' && payloadParaFrontend.payload) {
          mensajeTexto = payloadParaFrontend.payload.text;
        }

        const nuevaTelemetria = await this.telemetryModel.create({
          nodoId: payloadParaFrontend.fromStr || payloadParaFrontend.from || 'Desconocido',
          tipoPaquete,
          latitud,
          longitud,
          mensajeTexto,
          metadatos: payloadParaFrontend,
        });
        
        console.log(`[MongoDB] Datos guardados con ID: ${nuevaTelemetria._id}`);

        this.eventosGateway.emitirMensajeMesh(topic, payloadParaFrontend);
        console.log('Retransmitido al Frontend vía WebSockets');
      }

    } catch (error) {
      console.log('Error procesando el paquete MQTT o guardando en BD. Ignorando...', error);
    }
  }
}