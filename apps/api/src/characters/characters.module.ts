import { Module } from '@nestjs/common';
import { CharactersController } from './characters.controller.js';
import { CharactersService } from './characters.service.js';

@Module({
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}


