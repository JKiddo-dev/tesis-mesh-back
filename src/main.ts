import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.MQTT,
    options: {
      url: 'mqtt://broker.emqx.io:1883', // Broker temporal, revisar otras opciones.
    },
  });

  await app.startAllMicroservices();
  console.log('MQTT conectado exitosamente');

  await app.listen(4000);
  console.log('API REST corriendo en: http://localhost:4000');
}
bootstrap();