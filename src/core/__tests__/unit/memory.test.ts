import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import Database from 'better-sqlite3';

// Mock des modules
vi.mock('os', async () => {
  const actual = await vi.importActual('os') as typeof import('os');
  return {
    ...actual,
    homedir: () => TEST_DATA_DIR,
  };
});

const TEST_DATA_DIR = path.join(__dirname, '../../.test-data');
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'data', 'dangerousbot.db');

// Import après le mock
let Memory: typeof import('../../memory.js').Memory;

describe('Memory', () => {
  beforeEach(async () => {
    // Nettoyer le dossier de test
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
    
    // Réimporter pour réinitialiser
    const module = await import('../../memory.js');
    Memory = module.Memory;
  });

  afterEach(() => {
    // Nettoyer après chaque test
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
    vi.resetModules();
  });

  describe('addMessage', () => {
    it('should add a user message with text only', () => {
      const memory = new Memory();
      
      const id = memory.addMessage('user', 'Hello world');
      
      expect(id).toBeGreaterThan(0);
    });

    it('should add a message with tool_calls', () => {
      const memory = new Memory();
      const toolCalls = [
        { name: 'read_file', arguments: { path: 'test.txt' } },
      ];
      
      const id = memory.addMessage('assistant', 'Let me read the file', toolCalls);
      
      expect(id).toBeGreaterThan(0);
    });

    it('should add a message with source', () => {
      const memory = new Memory();
      
      const id = memory.addMessage('user', 'Hello from Telegram', undefined, undefined, 'telegram');
      
      expect(id).toBeGreaterThan(0);
      
      // Vérifier que le message est récupéré avec la source
      const messages = memory.getMessages();
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.source).toBe('telegram');
    });

    it('should add a message with images', () => {
      const memory = new Memory();
      const images = [
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/jpeg' as const,
            data: 'base64encodeddata',
          },
        },
      ];
      
      const id = memory.addMessage('user', 'Check this image', undefined, images);
      
      expect(id).toBeGreaterThan(0);
      
      // Vérifier que les images sont récupérées
      const messages = memory.getMessages();
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.images).toEqual(images);
    });
  });

  describe('getMessages', () => {
    it('should return messages in chronological order', () => {
      const memory = new Memory();
      
      memory.addMessage('user', 'First message');
      memory.addMessage('assistant', 'First response');
      memory.addMessage('user', 'Second message');
      
      const messages = memory.getMessages();
      
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('First message');
      expect(messages[1].content).toBe('First response');
      expect(messages[2].content).toBe('Second message');
    });

    it('should filter by source', () => {
      const memory = new Memory();
      
      memory.addMessage('user', 'Web message', undefined, undefined, 'webapp');
      memory.addMessage('user', 'Telegram message', undefined, undefined, 'telegram');
      memory.addMessage('user', 'Another web message', undefined, undefined, 'webapp');
      
      const webMessages = memory.getMessages(undefined, 100, 'webapp');
      
      expect(webMessages).toHaveLength(2);
      expect(webMessages.every(m => m.source === 'webapp' || m.source === undefined)).toBe(true);
    });

    it('should limit the number of messages', () => {
      const memory = new Memory();
      
      for (let i = 0; i < 10; i++) {
        memory.addMessage('user', `Message ${i}`);
      }
      
      const messages = memory.getMessages(undefined, 5);
      
      expect(messages).toHaveLength(5);
    });
  });

  describe('getRecentMessages', () => {
    it('should return recent messages only', () => {
      const memory = new Memory();
      
      memory.addMessage('user', 'Old message 1');
      memory.addMessage('user', 'Old message 2');
      memory.addMessage('user', 'Recent message');
      
      const recent = memory.getRecentMessages(1);
      
      expect(recent).toHaveLength(1);
      expect(recent[0].content).toBe('Recent message');
    });

    it('should apply source filter', () => {
      const memory = new Memory();
      
      memory.addMessage('user', 'Web 1', undefined, undefined, 'webapp');
      memory.addMessage('user', 'Telegram 1', undefined, undefined, 'telegram');
      memory.addMessage('user', 'Web 2', undefined, undefined, 'webapp');
      
      const recentWeb = memory.getRecentMessages(10, 'webapp');
      
      expect(recentWeb.every(m => m.source === 'webapp' || m.source === undefined)).toBe(true);
    });
  });

  describe('Knowledge management', () => {
    it('should add and retrieve knowledge', () => {
      const memory = new Memory();
      
      const id = memory.addKnowledge('fact', 'Test fact');
      
      expect(id).toBeGreaterThan(0);
      
      const knowledge = memory.getKnowledge('fact');
      expect(knowledge).toHaveLength(1);
      expect(knowledge[0].content).toBe('Test fact');
    });

    it('should filter knowledge by type', () => {
      const memory = new Memory();
      
      memory.addKnowledge('fact', 'Fact 1');
      memory.addKnowledge('skill', 'Skill 1');
      memory.addKnowledge('fact', 'Fact 2');
      
      const facts = memory.getKnowledge('fact');
      const skills = memory.getKnowledge('skill');
      
      expect(facts).toHaveLength(2);
      expect(skills).toHaveLength(1);
    });

    it('should retrieve all knowledge when no type specified', () => {
      const memory = new Memory();
      
      memory.addKnowledge('fact', 'Fact 1');
      memory.addKnowledge('skill', 'Skill 1');
      
      const all = memory.getKnowledge();
      
      expect(all).toHaveLength(2);
    });
  });

  describe('Session management', () => {
    it('should create a new session with setSessionId', () => {
      const memory = new Memory();
      
      const firstSessionId = memory.getSessionId();
      const newSessionId = `session_${Date.now()}_test`;
      
      memory.setSessionId(newSessionId);
      
      expect(memory.getSessionId()).toBe(newSessionId);
      expect(memory.getSessionId()).not.toBe(firstSessionId);
    });

    it('should isolate messages between sessions', () => {
      const memory = new Memory();
      
      const session1Id = memory.getSessionId();
      memory.addMessage('user', 'Session 1 message');
      
      const session2Id = `session_${Date.now()}_test2`;
      memory.setSessionId(session2Id);
      memory.addMessage('user', 'Session 2 message');
      
      // Check session 2 messages
      const messagesSession2 = memory.getMessages(session2Id);
      expect(messagesSession2).toHaveLength(1);
      expect(messagesSession2[0].content).toBe('Session 2 message');
      
      // Check session 1 messages
      const messagesSession1 = memory.getMessages(session1Id);
      expect(messagesSession1).toHaveLength(1);
      expect(messagesSession1[0].content).toBe('Session 1 message');
    });
  });
});
