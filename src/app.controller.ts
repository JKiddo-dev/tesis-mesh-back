import { Controller, Get, Delete, Param, Post, Body } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, MqttContext, Client, ClientProxy, Transport } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventosGateway } from './events/events.gateway'; 
import { Telemetry, TelemetryDocument } from './schemas/telemetry.schema'; 

@Controller()
export class AppController {

  @Client({ transport: Transport.MQTT, options: { url: 'mqtt://broker.emqx.io:1883' } })
  mqttClient!: ClientProxy;
  
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

  @Delete('telemetry/nodes/:id')
  async deleteNode(@Param('id') id: string) {
    console.log(`[HTTP] Petición DELETE recibida para borrar el nodo: ${id}`);
    try {
      const resultado = await this.telemetryModel.deleteMany({ nodoId: id }).exec();
      
      console.log(`[MongoDB] Se borraron ${resultado.deletedCount} registros del nodo ${id}`);
      
      return { 
        exito: true,
        mensaje: `Se eliminaron ${resultado.deletedCount} mensajes/posiciones del nodo ${id}` 
      };
    } catch (error) {
      console.log(`Error eliminando el nodo ${id}`, error);
      return { 
        exito: false, 
        error: 'Error interno al intentar eliminar el nodo de la base de datos' 
      };
    }
  }

  @Get('telemetry/analytics')
  async getAnalytics() {
    console.log('[HTTP] Petición GET recibida en /telemetry/analytics');
    try {
      const conteoPaquetes = await this.telemetryModel.aggregate([
        { $group: { _id: "$tipoPaquete", cantidad: { $sum: 1 } } },
        { $project: { name: "$_id", value: "$cantidad", _id: 0 } }
      ]);

      const rssiPorNodo = await this.telemetryModel.aggregate([
        { $match: { "metadatos.rxRssi": { $exists: true, $ne: null } } },
        { $group: { 
            _id: "$nodoId", 
            promedioRssi: { $avg: "$metadatos.rxRssi" },
            totalPaquetes: { $sum: 1 }
          } 
        },
        { $project: { 
            nodo: "$_id", 
            rssi: { $round: ["$promedioRssi", 2] }, 
            paquetes: "$totalPaquetes", 
            _id: 0 
          } 
        },
        { $sort: { paquetes: -1 } }, 
        { $limit: 10 } 
      ]);

      return {
        conteoPaquetes,
        rssiPorNodo
      };
    } catch (error) {
      console.log('Error obteniendo analíticas de la BD', error);
      return { error: 'No se pudieron obtener las analíticas' };
    }
  }
  
  @Post('telemetry/send')
  async enviarMensajeMesh(@Body() body: { mensaje: string, nodoDestino?: string }) {
    console.log(`[HTTP] Petición POST para enviar mensaje: "${body.mensaje}"`);
    try {
      const payloadMeshtastic = {
        type: "sendtext",
        payload: body.mensaje,
        to: body.nodoDestino ? parseInt(body.nodoDestino) : 4294967295, 
        from: 1234567890, 
        channel: 0
      };

      
      const topicoEnvio = 'tesis/utem/mesh';

      this.mqttClient.emit(topicoEnvio, payloadMeshtastic);
      
      console.log(`[MQTT] Mensaje inyectado al tópico ${topicoEnvio} en broker.emqx.io`);
      return { exito: true, mensaje: "Mensaje publicado en la red Mesh" };
      
    } catch (error) {
      console.log('Error enviando mensaje MQTT', error);
      return { exito: false, error: 'No se pudo enviar el mensaje' };
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
          nodoId: payloadParaFrontend.sender || payloadParaFrontend.fromStr || String(payloadParaFrontend.from) ||'Desconocido',
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