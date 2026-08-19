import { Controller, Get, Delete, Param, Post, Body, UseGuards, Put, OnModuleInit, Req } from '@nestjs/common';
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
      if (!topic.includes('#') && !topic.includes('+')) {
        const wildcardTopic = topic.endsWith('/') ? `${topic}#` : `${topic}/#`;
        this.mqttClient?.subscribe(wildcardTopic);
      }
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
  @Roles('Admin')
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
      const msjs = await this.telemetryModel.find().sort({ createdAt: -1 }).limit(100).exec();
      return msjs.reverse();
    } catch (error) { return []; }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('telemetry/direct/:nodoId1/:nodoId2')
  async getDirectMessages(
    @Param('nodoId1') nodoId1: string,
    @Param('nodoId2') nodoId2: string
  ) {
    try {
      const msjs = await this.telemetryModel.find({
        tipoPaquete: { $in: ['TEXTO', 'sendtext'] },
        $or: [
          { nodoId: nodoId1, nodoDestino: nodoId2 },
          { nodoId: nodoId2, nodoDestino: nodoId1 },
          { nodoId: nodoId1, nodoDestino: { $in: [null, 'BROADCAST', '4294967295', ''] } },
          { nodoId: nodoId2, nodoDestino: { $in: [null, 'BROADCAST', '4294967295', ''] } }
        ]
      }).sort({ createdAt: 1 }).limit(150).exec();
      return msjs;
    } catch (error) {
      return [];
    }
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
  
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('Admin', 'Operador')
  @Post('telemetry/send')
  async enviarMensajeMesh(@Body() body: { mensaje: string, nodoDestino?: string, nodoOrigen?: string }) {
    try {
      const remitente = body.nodoOrigen || '1234567890';
      const destinatario = body.nodoDestino || 'BROADCAST';
      
      let toNumeric = 4294967295;
      if (body.nodoDestino && body.nodoDestino !== 'BROADCAST') {
        if (body.nodoDestino.startsWith('!')) {
          const hex = body.nodoDestino.replace('!', '');
          const parsed = parseInt(hex, 16);
          toNumeric = isNaN(parsed) ? 4294967295 : parsed;
        } else {
          const parsed = parseInt(body.nodoDestino, 10);
          toNumeric = isNaN(parsed) ? 4294967295 : parsed;
        }
      }

      const payloadMeshtastic = {
        type: "sendtext",
        payload: body.mensaje,
        to: toNumeric,
        toStr: destinatario,
        from: remitente,
        channel: 0 
      };

      const nuevoMensaje = await this.telemetryModel.create({
        nodoId: remitente,
        nodoDestino: destinatario,
        tipoPaquete: 'TEXTO',
        mensajeTexto: body.mensaje,
        metadatos: payloadMeshtastic,
      });

      const topicoEnvio = this.topicoActual ? this.topicoActual.replace('/#', '').replace('/+', '') : 'msh/prueba/2/json';
      
      if (this.mqttClient && this.mqttClient.connected) {
        this.mqttClient.publish(topicoEnvio, JSON.stringify(payloadMeshtastic));
        console.log(`[MQTT] Mensaje 1-a-1 enviado hacia ${destinatario} en tópico ${topicoEnvio}`);
      }

      this.eventosGateway.emitirMensajeMesh(topicoEnvio, nuevoMensaje);

      return { exito: true, mensaje: "Mensaje publicado y registrado", data: nuevoMensaje };
      
    } catch (error) {
      return { exito: false, error: 'No se pudo enviar el mensaje' };
    }
  }

  async handleMeshtasticTraffic(topic: string, data: Buffer) { 
    try {
      let nodoDestinoExtraido: string | undefined;
      
      const partesTopico = topic.split('/');
      const ultimaParte = partesTopico[partesTopico.length - 1];
      if (ultimaParte && (ultimaParte.startsWith('!') || !isNaN(Number(ultimaParte)))) {
        nodoDestinoExtraido = ultimaParte;
      }

      const stringData = data.toString();
      let payloadParaFrontend: any = null;

      try {
        payloadParaFrontend = JSON.parse(stringData);
      } catch (e) {
        if (topic.includes('/e/') || topic.includes('/text')) {
          payloadParaFrontend = {
            type: 'text',
            payload: { text: stringData },
            sender: 'Radio-' + (partesTopico[partesTopico.length - 2] || 'Mesh')
          };
        }
      }

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
          mensajeTexto = typeof payloadParaFrontend.payload === 'string' ? payloadParaFrontend.payload : payloadParaFrontend.payload?.text;
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

        const nodoId = payloadParaFrontend.sender || payloadParaFrontend.fromStr || String(payloadParaFrontend.from) || 'Desconocido';
        const nodoDestino = payloadParaFrontend.toStr || (payloadParaFrontend.to ? String(payloadParaFrontend.to) : undefined) || nodoDestinoExtraido || 'BROADCAST';

        const nuevaTelemetria = await this.telemetryModel.create({
          nodoId,
          nodoDestino,
          tipoPaquete,
          latitud,
          longitud,
          mensajeTexto,
          metadatos: payloadParaFrontend,
        });
        
        this.eventosGateway.emitirMensajeMesh(topic, nuevaTelemetria);
      }
    } catch (error) {
      console.error('[MQTT Traffic Parse Error]', error);
    }
  }
}
