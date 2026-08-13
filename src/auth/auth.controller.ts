import { Controller, Post, Body, Get, Delete, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: any) {
    return this.authService.login(body.email, body.password);
  }

  @Post('setup') // Recordar cambiar después
  async setup(@Body() body: any) {
    return this.authService.crearUsuarioInicial(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('node-directory')
  async getNodeDirectory() {
    return this.authService.obtenerDirectorioNodos();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('Admin', 'Operador')
  @Get('users')
  async getUsers() {
    return this.authService.obtenerUsuarios();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('Admin', 'Operador')
  @Post('users')
  async createUser(@Body() body: any) {
    return this.authService.crearUsuario(body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('Admin', 'Operador')
  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: any) {
    return this.authService.actualizarUsuario(id, body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('Admin', 'Operador')
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.authService.eliminarUsuario(id);
  }
}
