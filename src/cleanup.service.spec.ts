import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CleanupService } from './cleanup.service';
import { Telemetry } from './schemas/telemetry.schema';
import { Settings } from './schemas/settings.schema';

describe('CleanupService', () => {
  let service: CleanupService;
  let mockTelemetryModel: any;
  let mockSettingsModel: any;

  beforeEach(async () => {
    mockTelemetryModel = {
      deleteMany: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 15 }),
      }),
    };

    mockSettingsModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ retentionDays: 30 }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CleanupService,
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

    service = module.get<CleanupService>(CleanupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleCron', () => {
    it('should delete telemetry data older than retention period', async () => {
      await service.handleCron();

      expect(mockSettingsModel.findOne).toHaveBeenCalled();
      expect(mockTelemetryModel.deleteMany).toHaveBeenCalledWith({
        createdAt: { $lt: expect.any(Date) },
      });
    });
  });
});
