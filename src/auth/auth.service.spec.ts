import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../schemas/user.schema';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let mockUserModel: any;
  let mockJwtService: any;

  beforeEach(async () => {
    mockUserModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      save: jest.fn(),
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock_token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should throw UnauthorizedException if user not found', async () => {
      mockUserModel.findOne.mockReturnValue(null);

      await expect(service.login('invalid@example.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user status is Inactivo', async () => {
      mockUserModel.findOne.mockReturnValue({
        email: 'test@example.com',
        estado: 'Inactivo',
      });

      await expect(service.login('test@example.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return token and user object on successful login', async () => {
      const passwordHash = await bcrypt.hash('secret123', 10);
      const user = {
        _id: 'user_123',
        nombre: 'Juan Perez',
        email: 'juan@example.com',
        passwordHash,
        rol: 'Admin',
        estado: 'Activo',
      };

      mockUserModel.findOne.mockReturnValue(user);

      const result = await service.login('juan@example.com', 'secret123');

      expect(result).toHaveProperty('access_token', 'mock_token');
      expect(result.user).toEqual({
        id: 'user_123',
        nombre: 'Juan Perez',
        email: 'juan@example.com',
        rol: 'Admin',
      });
    });
  });

  describe('obtenerUsuarios', () => {
    it('should return all users without password hash', async () => {
      const mockResult = [
        { _id: '1', nombre: 'Admin', email: 'admin@mesh.com' },
      ];
      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockResult),
        }),
      });

      const users = await service.obtenerUsuarios();
      expect(users).toEqual(mockResult);
    });
  });
});
