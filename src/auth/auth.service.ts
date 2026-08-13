import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async login(email: string, pass: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    if (user.estado !== 'Activo') throw new UnauthorizedException('Usuario inactivo');

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Credenciales inválidas');

    const payload = { 
      sub: user._id, 
      email: user.email, 
      rol: user.rol, 
      nombre: user.nombre,
      nodoId: user.nodoId || null 
    };
    
    return {
      access_token: this.jwtService.sign(payload),
      user: { 
        id: user._id, 
        nombre: user.nombre, 
        email: user.email, 
        rol: user.rol,
        nodoId: user.nodoId || null
      }
    };
  }

  async crearUsuarioInicial(data: any) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(data.password, salt);
    
    const newUser = new this.userModel({
      nombre: data.nombre,
      email: data.email,
      passwordHash: hash,
      rol: data.rol || 'Admin',
      estado: 'Activo',
      nodoId: data.nodoId || null
    });
    
    return newUser.save();
  }

  async obtenerUsuarios() {
    return this.userModel.find().select('-passwordHash').exec(); 
  }

  async obtenerDirectorioNodos() {
    return this.userModel.find({ nodoId: { $exists: true, $ne: null } }).select('nombre nodoId rol').exec();
  }

  async crearUsuario(data: any) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(data.password, salt);
    
    const newUser = new this.userModel({
      nombre: data.nombre,
      email: data.email,
      passwordHash: hash,
      rol: data.rol || 'Usuario',
      estado: data.estado || 'Activo',
      nodoId: data.nodoId || null
    });
    
    return newUser.save();
  }

  async actualizarUsuario(id: string, data: any) {
    const updateData = { ...data };

    if (updateData.password && updateData.password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      updateData.passwordHash = await bcrypt.hash(updateData.password, salt);
    }
    delete updateData.password; 

    return this.userModel.findByIdAndUpdate(id, updateData, { new: true }).select('-passwordHash');
  }

  async eliminarUsuario(id: string) {
    return this.userModel.findByIdAndDelete(id);
  }
}
