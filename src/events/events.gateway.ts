import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

//CORS habilitado para hacer conexión entre puertos 3000 (front) y 4000 (back)
@WebSocketGateway({ cors: { origin: '*' } }) 
export class EventosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    console.log(`Frontend conectado por Sockets: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Frontend desconectado: ${client.id}`);
  }

  // Esta función la llamaremos desde nuestro controlador MQTT
  emitirMensajeMesh(topico: string, payload: any) {
    this.server.emit('nuevoMensajeMesh', { topico, payload });
  }
}