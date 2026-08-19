import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { EventosGateway } from './events/events.gateway';
import { Telemetry } from './schemas/telemetry.schema';
import { Settings } from './schemas/settings.schema';

describe('AppController', () => {
  let controller: AppController;
  let mockTelemetryModel: any;
  let mockSettingsModel: any;
  let mockEventosGateway: any;

  beforeEach(async () => {
    mockTelemetryModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ _id: 'tel_123', ...dto }),
    }));
    mockTelemetryModel.distinct = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(['node_1', 'node_2']),
    });
    mockTelemetryModel.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockTelemetryModel.deleteMany = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 5 }),
    });
    mockTelemetryModel.aggregate = jest.fn().mockResolvedValue([]);
    mockTelemetryModel.create = jest.fn().mockImplementation((dto) => Promise.resolve({ _id: 'tel_123', ...dto }));

    mockSettingsModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          mqttBrokerUrl: 'mqtt://localhost:1883',
          mqttTopic: 'msh/2/c/#',
        }),
      }),
      create: jest.fn().mockResolvedValue({}),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      }),
    };

    mockEventosGateway = {
      server: {
        emit: jest.fn(),
      },
      emitirMensajeMesh: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: EventosGateway,
          useValue: mockEventosGateway,
        },
        {
          provide: getModelToken(Telemetry.name),
          useValue: mockTelemetryModel,
        },
        {
          provide: getModelToken(Settings.name),
          useValue: mockSettingsModel,
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getActiveNodes', () => {
    it('should return array of distinct node IDs', async () => {
      const nodes = await controller.getActiveNodes();
      expect(nodes).toEqual(['node_1', 'node_2']);
      expect(mockTelemetryModel.distinct).toHaveBeenCalledWith('nodoId');
    });
  });

  describe('getDirectMessages', () => {
    it('should return array of messages between two nodes', async () => {
      const messages = await controller.getDirectMessages('node_1', 'node_2');
      expect(mockTelemetryModel.find).toHaveBeenCalled();
      expect(messages).toEqual([]);
    });
  });

  describe('enviarMensajeMesh', () => {
    it('should create message in DB and emit socket event', async () => {
      const res = await controller.enviarMensajeMesh({
        mensaje: 'Alerta de prueba',
        nodoDestino: 'node_2',
      });
      expect(res.exito).toBe(true);
      expect(mockTelemetryModel.create).toHaveBeenCalled();
      expect(mockEventosGateway.emitirMensajeMesh).toHaveBeenCalled();
    });
  });

  describe('deleteNode', () => {
    it('should delete entries associated with node ID and return deleted count', async () => {
      const response = await controller.deleteNode('node_1');
      expect(mockTelemetryModel.deleteMany).toHaveBeenCalledWith({ nodoId: 'node_1' });
      expect(response).toEqual({
        exito: true,
        mensaje: 'Borrados 5 registros',
      });
    });
  });
});
