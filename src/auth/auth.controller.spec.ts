import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockAuthService = {
    login: jest.fn(),
    crearUsuarioInicial: jest.fn(),
    obtenerUsuarios: jest.fn(),
    crearUsuario: jest.fn(),
    actualizarUsuario: jest.fn(),
    eliminarUsuario: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should call AuthService.login with email and password', async () => {
      const body = { email: 'admin@mesh.com', password: 'password123' };
      const expectedResponse = { access_token: 'token', user: {} };
      mockAuthService.login.mockResolvedValue(expectedResponse);

      const result = await controller.login(body);
      expect(service.login).toHaveBeenCalledWith('admin@mesh.com', 'password123');
      expect(result).toBe(expectedResponse);
    });
  });

  describe('getUsers', () => {
    it('should call AuthService.obtenerUsuarios', async () => {
      const expectedUsers = [{ id: '1', nombre: 'Test' }];
      mockAuthService.obtenerUsuarios.mockResolvedValue(expectedUsers);

      const result = await controller.getUsers();
      expect(service.obtenerUsuarios).toHaveBeenCalled();
      expect(result).toBe(expectedUsers);
    });
  });
});
