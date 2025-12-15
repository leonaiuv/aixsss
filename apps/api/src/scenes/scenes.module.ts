import { Module } from '@nestjs/common';
import { ScenesController } from './scenes.controller.js';
import { ScenesService } from './scenes.service.js';

@Module({
  controllers: [ScenesController],
  providers: [ScenesService],
  exports: [ScenesService],
})
export class ScenesModule {}

