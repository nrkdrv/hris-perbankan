import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AuthService,
  REFRESH_COOKIE_NAME,
  REFRESH_TTL_MS,
} from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthUser } from './jwt.strategy';

const COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: COOKIE_PATH,
      maxAge: REFRESH_TTL_MS,
    });
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    const result = await this.auth.login(dto, req);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  /**
   * @Public agar JwtAuthGuard tidak memblokir; token cookie divalidasi
   * manual di AuthService (rotasi + revoke token lama).
   */
  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const result = await this.auth.refresh(raw, req);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: boolean }> {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    await this.auth.logout(raw);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: COOKIE_PATH });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<Record<string, unknown>> {
    return this.auth.me(user.id);
  }
}
