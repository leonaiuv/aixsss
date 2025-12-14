import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterInput, LoginInput } from '@aixsss/shared';
import bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  private async issueAccessToken(userId: string, email: string, teamId: string): Promise<string> {
    return this.jwt.signAsync({
      sub: userId,
      email,
      teamId,
    });
  }

  async register(input: RegisterInput): Promise<{ accessToken: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const teamName = input.teamName?.trim() || '默认团队';

    const created = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        memberships: {
          create: {
            role: 'OWNER',
            team: {
              create: {
                name: teamName,
              },
            },
          },
        },
      },
      include: {
        memberships: {
          include: { team: true },
        },
      },
    });

    const teamId = created.memberships[0].teamId;
    const accessToken = await this.issueAccessToken(created.id, created.email, teamId);
    return { accessToken };
  }

  async login(input: LoginInput): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { memberships: true },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const teamId = user.memberships[0]?.teamId;
    if (!teamId) throw new UnauthorizedException('No team found for user');

    const accessToken = await this.issueAccessToken(user.id, user.email, teamId);
    return { accessToken };
  }
}


