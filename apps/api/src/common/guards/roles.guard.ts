import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@hris/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Otorisasi berbasis peran. SUPER_ADMIN selalu lolos.
 * Tanpa @Roles di handler/class → semua user terautentikasi boleh lewat.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const req = context.switchToHttp().getRequest<{ user?: { role?: Role } }>();
    const role = req.user?.role;
    if (!role) {
      throw new ForbiddenException('Akses ditolak');
    }
    if (role === Role.SUPER_ADMIN) {
      return true;
    }
    if (!required.includes(role)) {
      throw new ForbiddenException('Akses ditolak');
    }
    return true;
  }
}
