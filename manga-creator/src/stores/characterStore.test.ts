import { describe, it, expect, beforeEach } from 'vitest';
import { useCharacterStore } from './characterStore';

describe('CharacterStore', () => {
  beforeEach(() => {
    // 重置store状态
    useCharacterStore.setState({ characters: [] });
  });

  describe('addCharacter', () => {
    it('应该能够添加新角色', () => {
      const { addCharacter, characters } = useCharacterStore.getState();

      addCharacter({
        projectId: 'project-1',
        name: '李明',
        appearance: '20岁青年，黑发，身穿白衬衫',
        personality: '开朗、勇敢、正义感强',
        background: '普通大学生',
        relationships: [],
        appearances: [],
      });

      expect(characters).toHaveLength(1);
      expect(characters[0].name).toBe('李明');
      expect(characters[0].projectId).toBe('project-1');
    });

    it('应该自动生成ID和时间戳', () => {
      const { addCharacter, characters } = useCharacterStore.getState();

      addCharacter({
        projectId: 'project-1',
        name: '王芳',
        appearance: '女性，长发',
        personality: '温柔',
        background: '教师',
        relationships: [],
        appearances: [],
      });

      expect(characters[0].id).toBeDefined();
      expect(characters[0].createdAt).toBeDefined();
      expect(characters[0].updatedAt).toBeDefined();
    });
  });

  describe('updateCharacter', () => {
    it('应该能够更新角色信息', () => {
      const { addCharacter, updateCharacter, characters } =
        useCharacterStore.getState();

      addCharacter({
        projectId: 'project-1',
        name: '张三',
        appearance: '初始外观',
        personality: '初始性格',
        background: '初始背景',
        relationships: [],
        appearances: [],
      });

      const characterId = characters[0].id;

      updateCharacter(characterId, {
        appearance: '更新后的外观',
        personality: '更新后的性格',
      });

      const updatedCharacter = useCharacterStore
        .getState()
        .characters.find((c) => c.id === characterId);

      expect(updatedCharacter?.appearance).toBe('更新后的外观');
      expect(updatedCharacter?.personality).toBe('更新后的性格');
      expect(updatedCharacter?.background).toBe('初始背景'); // 未更新的字段保持不变
    });
  });

  describe('deleteCharacter', () => {
    it('应该能够删除角色', () => {
      const { addCharacter, deleteCharacter, characters } =
        useCharacterStore.getState();

      addCharacter({
        projectId: 'project-1',
        name: '待删除角色',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const characterId = characters[0].id;
      deleteCharacter(characterId);

      expect(useCharacterStore.getState().characters).toHaveLength(0);
    });
  });

  describe('getProjectCharacters', () => {
    it('应该能够按项目ID筛选角色', () => {
      const { addCharacter, getProjectCharacters } =
        useCharacterStore.getState();

      addCharacter({
        projectId: 'project-1',
        name: '角色1',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      addCharacter({
        projectId: 'project-2',
        name: '角色2',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      addCharacter({
        projectId: 'project-1',
        name: '角色3',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const project1Characters = getProjectCharacters('project-1');
      expect(project1Characters).toHaveLength(2);
      expect(project1Characters.every((c) => c.projectId === 'project-1')).toBe(
        true
      );
    });
  });

  describe('addRelationship', () => {
    it('应该能够添加角色关系', () => {
      const { addCharacter, addRelationship, characters } =
        useCharacterStore.getState();

      addCharacter({
        projectId: 'project-1',
        name: '角色A',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const characterId = characters[0].id;

      addRelationship(characterId, {
        targetCharacterId: 'character-B',
        relationshipType: '朋友',
        description: '多年好友',
      });

      const updatedCharacter = useCharacterStore
        .getState()
        .characters.find((c) => c.id === characterId);

      expect(updatedCharacter?.relationships).toHaveLength(1);
      expect(updatedCharacter?.relationships[0].relationshipType).toBe('朋友');
    });
  });
});
