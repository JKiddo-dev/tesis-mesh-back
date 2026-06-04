import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, MqttContext } from '@nestjs/microservices';
import { EventosGateway } from './events/events.gateway'; // Asegúrate de que la ruta coincida con tu archivo

@Controller()
export class AppController {
  
  constructor(private readonly eventosGateway: EventosGateway) {}

  @MessagePattern('msh/#')
  handleMeshtasticTraffic(@Payload() data: any, @Ctx() context: MqttContext) {
    const topic = context.getTopic();
    console.log(`\n[MQTT PACKET RECEIVED] en el tópico: ${topic}`);
    
    try {
      let payloadParaFrontend = null;

      // Por si el paquete viene encriptado en binario
      if (topic.includes('/e/') || topic.includes('/c/')) {
        console.log('Ignorando paquete binario (Protobuf).');
        return; 
      }

      if (typeof data === 'object' && !Buffer.isBuffer(data)) {
        payloadParaFrontend = data;
        console.log('Contenido JSON:', JSON.stringify(payloadParaFrontend, null, 2));
      } 
      else {
        const stringData = data.toString();
        payloadParaFrontend = JSON.parse(stringData);
        console.log('Contenido Parseado:', JSON.stringify(payloadParaFrontend, null, 2));
      }

      if (payloadParaFrontend) {
        this.eventosGateway.emitirMensajeMesh(topic, payloadParaFrontend);
        console.log('Retransmitido al Frontend vía WebSockets');
      }

    } catch (error) {
      console.log('Error procesando el paquete MQTT. Ignorando...');
    }
  }
}