import { Controller, Get, Delete, Param, Post, Body, UseGuards, Put, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventosGateway } from './events/events.gateway'; 
import { Telemetry, TelemetryDocument } from './schemas/telemetry.schema'; 
import { Settings, SettingsDocument } from './schemas/settings.schema';
import { AuthGuard } from '@nestjs/passport';
import * as mqtt from 'mqtt'; 

import { Roles } from './auth/roles.decorator'; 
import { RolesGuard } from './auth/roles.guard';

@Controller()
export class AppController implements OnModuleInit {

  private mqttClient: mqtt.MqttClient | null = null;
  private topicoActual: string = '';

  constructor(
    private readonly eventosGateway: EventosGateway,
    @InjectModel(Telemetry.name) private telemetryModel: Model<TelemetryDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>
  ) {}

  async onModuleInit() {
    await this.inicializarMqttDinámico();
  }

  async inicializarMqttDinámico() {
    let config = await this.settingsModel.findOne().exec();
    if (!config) {
      console.log('[MongoDB] Creando configuración por defecto...');
      config = await this.settingsModel.create({});
    }
    this.conectarBroker(config.mqttBrokerUrl, config.mqttTopic);
  }

  conectarBroker(url: string, topic: string, username?: string, password?: string) {
    if (this.mqttClient) {
      console.log('[MQTT] Desconectando cliente anterior...');
      this.mqttClient.end(true); 
    }

    console.log(`[MQTT] Conectando a: ${url}...`);
    const options: mqtt.IClientOptions = {};
    if (username) options.username = username;
    if (password) options.password = password;

    this.mqttClient = mqtt.connect(url, options);
    this.topicoActual = topic;
    this.mqttClient.on('connect', () => {
      console.log(`[MQTT] Conectado. Suscribiendo al tópico: ${topic}`);
      this.mqttClient?.subscribe(topic, (err) => {
        if (err) console.error('[MQTT] Error al suscribirse:', err);
      });
    });

    this.mqttClient.on('message', (incomingTopic, messageBuffer) => {
      this.handleMeshtasticTraffic(incomingTopic, messageBuffer);
    });

    this.mqttClient.on('error', (err) => {
      console.error('[MQTT] Error de conexión:', err.message);
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('Admin', 'Operador')
  @Get('settings')
  async getSettings() {
    let config = await this.settingsModel.findOne().exec();
    if (!config) config = await this.settingsModel.create({});
    return config;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('Admin') // Solo administradores pueden modificar la configuración de la red
  @Put('settings')
  async updateSettings(@Body() body: Partial<Settings>) {
    let config = await this.settingsModel.findOne().exec();
    if (!config) config = await this.settingsModel.create({});

    const requiereReconexion = 
      (body.mqttBrokerUrl && body.mqttBrokerUrl !== config.mqttBrokerUrl) || 
      (body.mqttTopic && body.mqttTopic !== config.mqttTopic);

    const updatedConfig = await this.settingsModel.findByIdAndUpdate(config._id, body, { new: true }).exec();

    if (requiereReconexion && updatedConfig) {
      console.log('[SETTINGS] Cambio detectado en MQTT. Reiniciando conexión en caliente...');
      this.conectarBroker(updatedConfig.mqttBrokerUrl, updatedConfig.mqttTopic);
    }

    return { exito: true, settings: updatedConfig };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('telemetry/nodes')
  async getActiveNodes() {
    try {
      return await this.telemetryModel.distinct('nodoId').exec();
    } catch (error) { return []; }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('telemetry/history')
  async getTelemetryHistory() {
    try {
      return await this.telemetryModel.find({ tipoPaquete: 'POSICION', latitud: { $ne: null } }).sort({ createdAt: 1 }).exec();
    } catch (error) { return { error: 'Error BD' }; }
  }
  
  @UseGuards(AuthGuard('jwt'))
  @Get('telemetry/messages')
  async getMessagesHistory() {
    try {
      const msjs = await this.telemetryModel.find().sort({ createdAt: -1 }).limit(50).exec();
      return msjs.reverse();
    } catch (error) { return []; }
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('Admin', 'Operador')
  @Delete('telemetry/nodes/:id')
  async deleteNode(@Param('id') id: string) {
    try {
      const res = await this.telemetryModel.deleteMany({ nodoId: id }).exec();
      return { exito: true, mensaje: `Borrados ${res.deletedCount} registros` };
    } catch (error) { return { exito: false, error: 'Error BD' }; }
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('Admin', 'Operador')
  @Delete('telemetry/clear-all')
  async clearAllData() {
    try {
      const res = await this.telemetryModel.deleteMany({}).exec();
      return { exito: true, mensaje: `Borrados ${res.deletedCount} registros` };
    } catch (error) { return { exito: false, error: 'Error BD' }; }
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('Admin', 'Operador')
  @Get('telemetry/analytics')
  async getAnalytics() {
    try {
      const conteoPaquetes = await this.telemetryModel.aggregate([
        { $group: { _id: "$tipoPaquete", cantidad: { $sum: 1 } } },
        { $project: { name: "$_id", value: "$cantidad", _id: 0 } }
      ]);

      const rssiPorNodo = await this.telemetryModel.aggregate([
        { $match: { "metadatos.rssi": { $exists: true, $ne: null } } },
        { $group: { _id: "$nodoId", promedioRssi: { $avg: "$metadatos.rssi" }, totalPaquetes: { $sum: 1 } } },
        { $project: { nodo: "$_id", rssi: { $round: ["$promedioRssi", 2] }, paquetes: "$totalPaquetes", _id: 0 } },
        { $sort: { paquetes: -1 } }, { $limit: 10 } 
      ]);

      return { conteoPaquetes, rssiPorNodo };
    } catch (error) { return { error: 'Error BD' }; }
  }
  
  @UseGuards(AuthGuard('jwt'))
  @Post('telemetry/send')
  async enviarMensajeMesh(@Body() body: { mensaje: string, nodoDestino?: string }) {
    try {
      if (!this.mqttClient || !this.mqttClient.connected) {
        return { exito: false, error: 'No hay conexión activa con el broker MQTT' };
      }

      const payloadMeshtastic = {
        type: "sendtext",
        payload: body.mensaje,
        to: body.nodoDestino ? parseInt(body.nodoDestino) : 4294967295, 
        from: 1234567890, 
        channel: 0 
      };

      const topicoEnvio = this.topicoActual.replace('/#', '');
      this.mqttClient.publish(topicoEnvio, JSON.stringify(payloadMeshtastic));
      
      console.log(`[MQTT] Mensaje inyectado al tópico ${topicoEnvio}`);
      return { exito: true, mensaje: "Mensaje publicado" };
      
    } catch (error) {
      return { exito: false, error: 'No se pudo enviar el mensaje' };
    }
  }

  async handleMeshtasticTraffic(topic: string, data: Buffer) { 
    try {
      if (topic.includes('/e/') || topic.includes('/c/')) return; 

      const stringData = data.toString();
      const payloadParaFrontend = JSON.parse(stringData);

      if (payloadParaFrontend) {
        const rawType = payloadParaFrontend.type || (payloadParaFrontend.decoded?.portnum) || 'unknown';
        let tipoPaquete = 'OTRO';
        let latitud: number | undefined;
        let longitud: number | undefined;
        let mensajeTexto: string | undefined;

        const rawTypeLower = String(rawType).toLowerCase();

        if (rawTypeLower === 'text' || rawType === 'TEXT_MESSAGE_APP' || rawType == 1) {
          tipoPaquete = 'TEXTO';
          mensajeTexto = payloadParaFrontend.payload?.text || (typeof payloadParaFrontend.payload === 'string' ? payloadParaFrontend.payload : undefined);
        } else if (rawTypeLower === 'sendtext') {
          tipoPaquete = 'TEXTO'; 
          mensajeTexto = payloadParaFrontend.payload;
        } else if (rawTypeLower === 'position' || rawType === 'POSITION_APP' || rawType == 3) {
          tipoPaquete = 'POSICION';
          if (payloadParaFrontend.payload?.latitude_i) {
            latitud = payloadParaFrontend.payload.latitude_i / 10000000;
            longitud = payloadParaFrontend.payload.longitude_i / 10000000;
          }
        } else if (rawTypeLower === 'telemetry' || rawType === 'TELEMETRY_APP' || rawType == 67) {
          tipoPaquete = 'TELEMETRIA';
        } else if (rawTypeLower === 'nodeinfo' || rawType === 'NODEINFO_APP' || rawType == 4) {
          tipoPaquete = 'NODEINFO'; 
        }

        const nuevaTelemetria = await this.telemetryModel.create({
          nodoId: payloadParaFrontend.sender || payloadParaFrontend.fromStr || String(payloadParaFrontend.from) || 'Desconocido',
          tipoPaquete,
          latitud,
          longitud,
          mensajeTexto,
          metadatos: payloadParaFrontend,
        });
        
        this.eventosGateway.emitirMensajeMesh(topic, nuevaTelemetria);
      }
    } catch (error) {
    }
  }
}
