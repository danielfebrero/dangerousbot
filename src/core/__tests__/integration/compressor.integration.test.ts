/**
 * Tests d'intégration pour le MemoryCompressor
 * 
 * Ces tests vérifient que:
 * 1. compress() récupère correctement les messages du thread
 * 2. Les tool_calls sont inclus dans les données envoyées au provider
 * 3. Le formatage de la conversation est complet
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';

// Variables pour les imports dynamiques
let MemoryCompressor: any;

// Test DB path
const TEST_DATA_DIR = path.join(__dirname, '../../../../.test-data-compressor');

// TODO: This integration test needs a complete rewrite - uses outdated schema and constructor signature
describe.skip('MemoryCompressor Integration', () => {
  const testThreadId = 'test_thread_compressor';
  let db: Database.Database;
  let mockCreateCompletion: any;
  
  beforeEach(async () => {
    // Setup base de données de test
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
    const testDbPath = path.join(TEST_DATA_DIR, 'test.db');
    
    // Supprimer l'ancienne DB si elle existe
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    // Créer une nouvelle DB de test
    db = new Database(testDbPath);
    
    // Créer les tables nécessaires
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        tool_calls TEXT,
        tool_call_id TEXT,
        created_at INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL,
        content TEXT NOT NULL,
        message_count INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Créer le mock pour le provider
    mockCreateCompletion = vi.fn();
    const mockProvider = {
      createCompletion: mockCreateCompletion,
      createStreamingCompletion: vi.fn(),
      getModel: () => 'test-compressor-model'
    };
    
    // Mock du factory
    vi.doMock('../../../ai/provider-factory', () => ({
      createProvider: vi.fn(() => mockProvider)
    }));
    
    // Mock du config
    vi.doMock('../../../config', async () => ({
      config: {
        COMPRESSOR: {
          MODEL: 'test-compressor-model',
          MAX_TOKENS: 500,
          TEMPERATURE: 0.3
        },
        DATABASE: { PATH: testDbPath }
      },
      MODELS: { KIMI: 'test-compressor-model' },
      TOKENS: { MAX_COMPRESSION_SUMMARY: 500 },
      MEMORY: { RELEVANT_MEMORIES_TOP_K: 3 },
    }));
    
    // Mock de la database avec notre DB de test
    vi.doMock('../../../database', () => ({ db, getDatabase: () => db }));
    vi.doMock('../../../database/index.js', () => ({ db, getDatabase: () => db }));
    
    // Importer MemoryCompressor après les mocks
    const compressorModule = await import('../../compressor');
    MemoryCompressor = compressorModule.MemoryCompressor;
    
    // Setup mock response
    mockCreateCompletion.mockResolvedValue({
      content: 'Résumé de test: conversation sur la météo et les outils.'
    });
  });
  
  afterAll(() => {
    // Cleanup
    if (db) db.close();
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it('should include tool_calls in the conversation sent to the provider', async () => {
    // Insérer des messages avec tool_calls
    const insertMessage = db.prepare(`
      INSERT INTO messages (thread_id, role, content, tool_calls, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    // Message user
    insertMessage.run(testThreadId, 'user', 'Quel temps fait-il à Paris ?', null, Date.now() - 3000);
    
    // Message assistant avec tool_calls
    const toolCalls = JSON.stringify([{
      id: 'call_123',
      type: 'function',
      function: {
        name: 'searxng_search',
        arguments: JSON.stringify({ query: 'météo Paris', engines: 'google' })
      }
    }]);
    insertMessage.run(testThreadId, 'assistant', 'Je vais chercher la météo.', toolCalls, Date.now() - 2000);
    
    // Tool result
    insertMessage.run(
      testThreadId, 
      'tool', 
      '__TOOL_RESULT__searxng_search__{"results":[{"title":"Météo Paris","content":"20°C, ensoleillé"}]}',
      null,
      Date.now() - 1000
    );
    
    // Message assistant final
    insertMessage.run(testThreadId, 'assistant', 'Il fait 20°C et ensoleillé à Paris.', null, Date.now());
    
    // Créer le compresseur et appeler compress
    const compressor = new MemoryCompressor(testThreadId, db);
    await compressor.compress(2); // Garder seulement 2 messages récents
    
    // Vérifier que createCompletion a été appelé
    expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
    
    // Récupérer les messages envoyés au provider
    const callArgs = mockCreateCompletion.mock.calls[0][0];
    const conversationContent = callArgs.messages.find((m: any) => m.role === 'user')?.content;
    
    // Afficher pour debug
    console.log('Conversation envoyée au compresseur:');
    console.log(conversationContent);
    
    // Vérifier que la conversation contient les tool_calls
    expect(conversationContent).toContain('searxng_search');
    expect(conversationContent).toContain('météo Paris');
    expect(conversationContent).toContain('engines');
    expect(conversationContent).toContain('[Tools:');
    expect(conversationContent).toContain('[Tool Result:');
    
    // Vérifier que les tool_calls sont bien parsés et inclus
    expect(conversationContent).toContain('query="météo Paris"');
  });

  it('should preserve message flow with multiple tool calls', async () => {
    const insertMessage = db.prepare(`
      INSERT INTO messages (thread_id, role, content, tool_calls, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const now = Date.now();
    
    // Séquence: user -> assistant (2 tools) -> tool results -> assistant
    insertMessage.run(testThreadId, 'user', 'Compare Paris et Lyon', null, now - 4000);
    
    const toolCalls = JSON.stringify([
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'searxng_search',
          arguments: JSON.stringify({ query: 'météo Paris' })
        }
      },
      {
        id: 'call_2',
        type: 'function',
        function: {
          name: 'searxng_search',
          arguments: JSON.stringify({ query: 'météo Lyon' })
        }
      }
    ]);
    insertMessage.run(testThreadId, 'assistant', 'Je cherche les infos.', toolCalls, now - 3000);
    
    insertMessage.run(
      testThreadId, 
      'tool', 
      '__TOOL_RESULT__searxng_search__Paris: 20°C',
      null,
      now - 2000
    );
    
    insertMessage.run(
      testThreadId, 
      'tool', 
      '__TOOL_RESULT__searxng_search__Lyon: 22°C',
      null,
      now - 1000
    );
    
    insertMessage.run(testThreadId, 'assistant', 'Paris: 20°C, Lyon: 22°C', null, now);
    
    const compressor = new MemoryCompressor(testThreadId, db);
    await compressor.compress(0);
    
    const callArgs = mockCreateCompletion.mock.calls[0][0];
    const conversationContent = callArgs.messages.find((m: any) => m.role === 'user')?.content;
    
    // Vérifier que les 2 tool calls sont présents
    const toolMatches = (conversationContent as string).match(/searxng_search/g);
    expect(toolMatches).toHaveLength(2);
    
    // Vérifier l'ordre: les tool results doivent suivre les tool calls
    expect((conversationContent as string).indexOf('[Tools:')).toBeLessThan((conversationContent as string).indexOf('Paris: 20°C'));
    expect((conversationContent as string).indexOf('Paris: 20°C')).toBeLessThan((conversationContent as string).indexOf('Lyon: 22°C'));
  });

  it('should handle messages without tool_calls gracefully', async () => {
    const insertMessage = db.prepare(`
      INSERT INTO messages (thread_id, role, content, tool_calls, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    insertMessage.run(testThreadId, 'user', 'Bonjour', null, Date.now() - 2000);
    insertMessage.run(testThreadId, 'assistant', 'Bonjour ! Comment puis-je vous aider ?', null, Date.now() - 1000);
    
    const compressor = new MemoryCompressor(testThreadId, db);
    await compressor.compress(0);
    
    const callArgs = mockCreateCompletion.mock.calls[0][0];
    const conversationContent = callArgs.messages.find((m: any) => m.role === 'user')?.content;
    
    // Vérifier que la conversation est quand même formatée correctement
    expect(conversationContent).toContain('[USER]: Bonjour');
    expect(conversationContent).toContain('[ASSISTANT]: Bonjour !');
    expect(conversationContent).not.toContain('[Tools:');
  });

  it('should truncate long tool results', async () => {
    const insertMessage = db.prepare(`
      INSERT INTO messages (thread_id, role, content, tool_calls, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const longResult = 'x'.repeat(1000);
    insertMessage.run(
      testThreadId, 
      'tool', 
      `__TOOL_RESULT__some_tool__${longResult}`,
      null,
      Date.now()
    );
    
    const compressor = new MemoryCompressor(testThreadId, db);
    await compressor.compress(0);
    
    const callArgs = mockCreateCompletion.mock.calls[0][0];
    const conversationContent = callArgs.messages.find((m: any) => m.role === 'user')?.content;
    
    // Vérifier que le résultat est tronqué
    expect(conversationContent).toContain('[tronqué]');
    expect((conversationContent as string).length).toBeLessThan(longResult.length + 500);
  });
});
