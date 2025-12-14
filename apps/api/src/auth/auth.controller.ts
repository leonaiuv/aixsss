import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { parseOrBadRequest } from '../common/zod.js';
import { LoginInputSchema, RegisterInputSchema } from '@aixsss/shared';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthUser } from './auth.types.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() body: unknown) {
    const input = parseOrBadRequest(RegisterInputSchema, body);
    return this.auth.register(input);
  }

  @Post('login')
  login(@Body() body: unknown) {
    const input = parseOrBadRequest(LoginInputSchema, body);
    return this.auth.login(input);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}


