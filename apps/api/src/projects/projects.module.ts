import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { NarrativeCausalChainVersionsController } from './narrative-causal-chain-versions.controller.js';
import { NarrativeCausalChainVersionsService } from './narrative-causal-chain-versions.service.js';

@Module({
  controllers: [ProjectsController, NarrativeCausalChainVersionsController],
  providers: [ProjectsService, NarrativeCausalChainVersionsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}


