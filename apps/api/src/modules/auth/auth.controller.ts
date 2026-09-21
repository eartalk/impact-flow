import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { BootstrapDto } from './dto/bootstrap.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CurrentSession, Public } from './auth.decorators';
import type { AuthSession } from '@impact-flow/contracts';
import { readCookie } from './auth-cookie';
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from './auth.constants';

type HttpRequest = { ip?: string; headers: { cookie?: string } };
type HttpResponse = {
  cookie(name: string, value: string, options: object): void;
  clearCookie(name: string, options: object): void;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('bootstrap-status')
  bootstrapStatus() {
    return this.auth.bootstrapStatus();
  }

  @Public()
  @Post('bootstrap')
  async bootstrap(
    @Body() input: BootstrapDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const issued = await this.auth.bootstrap(input, request.ip);
    this.setSessionCookie(response, issued.token);
    return issued.session;
  }

  @Public()
  @Post('login')
  async login(
    @Body() input: LoginDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const issued = await this.auth.login(input, request.ip);
    this.setSessionCookie(response, issued.token);
    return issued.session;
  }

  @Public()
  @Post('register')
  async register(
    @Body() input: RegisterDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const issued = await this.auth.register(input, request.ip);
    this.setSessionCookie(response, issued.token);
    return issued.session;
  }

  @Post('logout')
  async logout(
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    await this.auth.logout(token, request.ip);
    response.clearCookie(SESSION_COOKIE, { path: '/api' });
    return { success: true };
  }

  @Get('me')
  me(@CurrentSession() session: AuthSession) {
    return session;
  }

  private setSessionCookie(response: HttpResponse, token: string) {
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production',
      path: '/api',
      maxAge: SESSION_MAX_AGE_MS,
    });
  }
}
