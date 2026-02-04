/**
 * Mock ToolContext - Reusable mock for tool testing
 */

import { vi } from 'vitest';
import type { ToolContext } from '../../core/tools/types.js';
import * as os from 'os';
import * as path from 'path';

/**
 * Creates a complete mock ToolContext with all fields stubbed.
 * Pass overrides to customize specific fields per test.
 */
export function createMockToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectRoot: overrides.projectRoot ?? path.join(os.tmpdir(), 'dangerousbot-test'),
    executor: overrides.executor ?? {
      executeInMemory: vi.fn().mockResolvedValue({ success: true, result: '' }),
      executeCommand: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }),
      resolvePath: vi.fn((p: string) => p),
    },
    memory: overrides.memory ?? {
      addMessage: vi.fn(),
      getMessages: vi.fn().mockReturnValue([]),
      addKnowledge: vi.fn(),
      searchKnowledge: vi.fn().mockReturnValue([]),
      getConfig: vi.fn().mockReturnValue(null),
      setConfig: vi.fn(),
      getStats: vi.fn().mockReturnValue({ sessions: 0, messages: 0, knowledge: 0 }),
    },
    versioning: overrides.versioning ?? {
      getCurrentVersion: vi.fn().mockReturnValue('0.0.0-test'),
      incrementVersion: vi.fn(),
      commitChanges: vi.fn().mockResolvedValue(undefined),
    },
    lifecycle: overrides.lifecycle ?? {
      restart: vi.fn(),
      acquireLock: vi.fn(),
      releaseLock: vi.fn(),
    },
    mistral: overrides.mistral ?? null,
    aiConsultant: overrides.aiConsultant ?? null,
    rollbackManager: overrides.rollbackManager ?? null,
    threadId: overrides.threadId ?? 'test-thread-1',
    source: overrides.source ?? 'webapp',
    ...overrides,
  };
}
