import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role, WorkLocationType } from '@hris/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthUser {
  id: string;
  nip: string;
  role: Role;
  branchId: string;
  fullName: string;
  email: string;
  workLocationType: WorkLocationType;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: { sub: string }): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesi tidak valid');
    }
    return {
      id: user.id,
      nip: user.nip,
      role: user.role as unknown as Role,
      branchId: user.branchId,
      fullName: user.fullName,
      email: user.email,
      workLocationType: user.workLocationType as unknown as WorkLocationType,
    };
  }
}
