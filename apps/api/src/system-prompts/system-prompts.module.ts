import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SystemPromptsController } from './system-prompts.controller.js';
import { SystemPromptsService } from './system-prompts.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [SystemPromptsController],
  providers: [SystemPromptsService],
})
export class SystemPromptsModule {}

