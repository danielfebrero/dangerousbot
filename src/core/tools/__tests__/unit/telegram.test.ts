import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';
import type { ToolContext } from '../../types.js';

const mockSetTelegramMaster = vi.fn();

vi.mock('../../../memory.js', () => ({
  getMemory: vi.fn(() => ({
    setTelegramMaster: mockSetTelegramMaster,
  })),
}));

import { telegramHandler, telegramDefinition } from '../../telegram.js';

describe('telegram tool', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockToolContext();
  });

  describe('definition', () => {
    it('should have the correct name', () => {
      expect(telegramHandler.name).toBe('telegram');
    });

    it('should expose the definition', () => {
      expect(telegramHandler.definition).toBe(telegramDefinition);
    });

    it('should require command and param properties', () => {
      expect(telegramDefinition.input_schema.required).toContain('command');
      expect(telegramDefinition.input_schema.required).toContain('param');
    });

    it('should enumerate valid commands', () => {
      const commandProp = telegramDefinition.input_schema.properties.command as any;
      expect(commandProp.enum).toEqual(['set_master_user']);
    });
  });

  describe('set_master_user with numeric ID', () => {
    it('should call setTelegramMaster with numeric ID and null username', async () => {
      const result = await telegramHandler.execute(
        { command: 'set_master_user', param: '123456789' },
        ctx,
      );

      expect(mockSetTelegramMaster).toHaveBeenCalledWith(123456789, null);
      expect(result.success).toBe(true);
      expect(result.user_id).toBe(123456789);
      expect(result.username).toBeNull();
      expect(result.message).toContain('123456789');
    });

    it('should handle a single-digit ID', async () => {
      const result = await telegramHandler.execute(
        { command: 'set_master_user', param: '5' },
        ctx,
      );

      expect(mockSetTelegramMaster).toHaveBeenCalledWith(5, null);
      expect(result.success).toBe(true);
      expect(result.user_id).toBe(5);
    });

    it('should handle a large numeric ID', async () => {
      const result = await telegramHandler.execute(
        { command: 'set_master_user', param: '9999999999' },
        ctx,
      );

      expect(mockSetTelegramMaster).toHaveBeenCalledWith(9999999999, null);
      expect(result.success).toBe(true);
      expect(result.user_id).toBe(9999999999);
    });
  });

  describe('set_master_user with username', () => {
    it('should call setTelegramMaster with null ID and cleaned username', async () => {
      const result = await telegramHandler.execute(
        { command: 'set_master_user', param: 'johndoe' },
        ctx,
      );

      expect(mockSetTelegramMaster).toHaveBeenCalledWith(null, 'johndoe');
      expect(result.success).toBe(true);
      expect(result.user_id).toBeNull();
      expect(result.username).toBe('johndoe');
      expect(result.message).toContain('johndoe');
    });

    it('should strip the leading @ from the username', async () => {
      const result = await telegramHandler.execute(
        { command: 'set_master_user', param: '@myuser' },
        ctx,
      );

      expect(mockSetTelegramMaster).toHaveBeenCalledWith(null, 'myuser');
      expect(result.username).toBe('myuser');
    });

    it('should lowercase the username', async () => {
      const result = await telegramHandler.execute(
        { command: 'set_master_user', param: '@MyUser' },
        ctx,
      );

      expect(mockSetTelegramMaster).toHaveBeenCalledWith(null, 'myuser');
      expect(result.username).toBe('myuser');
    });

    it('should treat a mixed alphanumeric string as a username', async () => {
      const result = await telegramHandler.execute(
        { command: 'set_master_user', param: 'user123' },
        ctx,
      );

      expect(mockSetTelegramMaster).toHaveBeenCalledWith(null, 'user123');
      expect(result.success).toBe(true);
      expect(result.username).toBe('user123');
      expect(result.user_id).toBeNull();
    });
  });

  describe('unknown command', () => {
    it('should throw an error for an unrecognized command', async () => {
      await expect(
        telegramHandler.execute({ command: 'remove_user', param: 'someone' }, ctx),
      ).rejects.toThrow('Action inconnue: remove_user');
    });

    it('should throw an error for an empty command', async () => {
      await expect(
        telegramHandler.execute({ command: '', param: 'someone' }, ctx),
      ).rejects.toThrow('Action inconnue');
    });
  });
});
