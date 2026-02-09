import { Module } from '@nestjs/common';
import { CharactersController } from './characters.controller.js';
import { CharactersService } from './characters.service.js';
import { CharacterRelationshipsModule } from '../character-relationships/character-relationships.module.js';

@Module({
  imports: [CharacterRelationshipsModule],
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}

