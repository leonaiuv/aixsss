import { Module } from '@nestjs/common';
import { WorldViewController } from './world-view.controller.js';
import { WorldViewService } from './world-view.service.js';

@Module({
  controllers: [WorldViewController],
  providers: [WorldViewService],
})
export class WorldViewModule {}


