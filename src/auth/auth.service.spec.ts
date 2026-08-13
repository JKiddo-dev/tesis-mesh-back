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
    mockUserModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ _id: 'user_created', ...dto }),
    }));
    mockUserModel.findOne = jest.fn();
    mockUserModel.find = jest.fn();
    mockUserModel.findByIdAndUpdate = jest.fn();
    mockUserModel.findByIdAndDelete = jest.fn();

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

    it('should return token, user object with role and nodoId on successful login', async () => {
      const passwordHash = await bcrypt.hash('secret123', 10);
      const user = {
        _id: 'user_123',
        nombre: 'Juan Perez',
        email: 'juan@example.com',
        passwordHash,
        rol: 'Usuario',
        estado: 'Activo',
        nodoId: 'node_abc',
      };

      mockUserModel.findOne.mockReturnValue(user);

      const result = await service.login('juan@example.com', 'secret123');

      expect(result).toHaveProperty('access_token', 'mock_token');
      expect(result.user).toEqual({
        id: 'user_123',
        nombre: 'Juan Perez',
        email: 'juan@example.com',
        rol: 'Usuario',
        nodoId: 'node_abc',
      });
    });
  });

  describe('obtenerUsuarios', () => {
    it('should return all users without password hash', async () => {
      const mockResult = [
        { _id: '1', nombre: 'Admin', email: 'admin@mesh.com', rol: 'Admin', nodoId: null },
        { _id: '2', nombre: 'Operador', email: 'op@mesh.com', rol: 'Operador', nodoId: 'node_123' },
        { _id: '3', nombre: 'Usuario', email: 'user@mesh.com', rol: 'Usuario', nodoId: null },
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

  describe('crearUsuario', () => {
    it('should create user with assigned node and default role Usuario if not provided', async () => {
      const userData = {
        nombre: 'Test User',
        email: 'test@user.cl',
        password: 'password123',
        nodoId: 'node_999'
      };

      const user = await service.crearUsuario(userData);
      expect(user).toBeDefined();
      expect(user.nombre).toBe('Test User');
      expect(user.rol).toBe('Usuario');
      expect(user.nodoId).toBe('node_999');
    });
  });

  describe('actualizarUsuario', () => {
    it('should update user fields including assigned radio node', async () => {
      const updateData = { nodoId: 'node_555', rol: 'Operador' };
      mockUserModel.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'user_1',
          nombre: 'Updated',
          rol: 'Operador',
          nodoId: 'node_555'
        }),
      });

      const result = await service.actualizarUsuario('user_1', updateData);
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith('user_1', updateData, { new: true });
      expect(result.nodoId).toBe('node_555');
    });
  });
});
