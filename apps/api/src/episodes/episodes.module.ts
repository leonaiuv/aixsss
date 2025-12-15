import { Module } from '@nestjs/common';
import { EpisodesController } from './episodes.controller.js';
import { EpisodesService } from './episodes.service.js';
import { EpisodeScenesController } from './episode-scenes.controller.js';
import { ScenesModule } from '../scenes/scenes.module.js';

@Module({
  imports: [ScenesModule],
  controllers: [EpisodesController, EpisodeScenesController],
  providers: [EpisodesService],
})
export class EpisodesModule {}
