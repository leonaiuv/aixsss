import { Module } from '@nestjs/common';
import { EpisodesController } from './episodes.controller.js';
import { EpisodesService } from './episodes.service.js';

@Module({
  controllers: [EpisodesController],
  providers: [EpisodesService],
})
export class EpisodesModule {}

