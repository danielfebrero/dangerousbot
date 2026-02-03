/**
 * Index central des tools - Auto-registration
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';

// Import de tous les handlers
import { executeCodeHandler, executeCodeDefinition } from './execute-code';
import { shellHandler, shellDefinition } from './shell';
import { readFileHandler, readFileDefinition } from './read-file';
import { writeFileHandler, writeFileDefinition } from './write-file';
import { editFileHandler, editFileDefinition } from './edit-file';
import { listFilesHandler, listFilesDefinition } from './list-files';
import { deleteFileHandler, deleteFileDefinition } from './delete-file';
import { rememberHandler, rememberDefinition } from './remember';
import { recallHandler, recallDefinition } from './recall';
import { selfUpdateHandler, selfUpdateDefinition } from './self-update';
import { restartServerHandler, restartServerDefinition } from './restart-server';
import { switchProviderHandler, switchProviderDefinition } from './switch-provider';
import { consultMistralHandler, consultMistralDefinition } from './consult-mistral';
import { consultAIHandler, consultAIDefinition } from './consult-ai';
import { manageConversationsHandler, manageConversationsDefinition } from './manage-conversations';
import { manageThreadsHandler, manageThreadsDefinition } from './manage-threads';
import { searxngSearchHandler, searxngSearchDefinition } from './searxng-search';
import { getKimiBalanceHandler, getKimiBalanceDefinition } from './get-kimi-balance';
import { todoHandler, todoDefinition } from './todo';
import { retrieveCodeHandler, retrieveCodeDefinition } from './retrieve-code';
import { codeIndexHandler, codeIndexDefinition } from './code-index';
import { logHandler, logDefinition, setLogLevelHandler, setLogLevelDefinition, clearLogsHandler, clearLogsDefinition } from './log';
import { telegramHandler, telegramDefinition } from './telegram';
import { configHandler, configDefinition } from './config';
import { downloadFileHandler, downloadFileDefinition } from './download-file';
import { sendFileHandler, sendFileDefinition } from './send-file';
import { recallToolResultHandler, recallToolResultDefinition } from './recall-tool-result';
import { compactHandler, compactDefinition } from './compact';

import { PROVIDER } from '../../config';

// Registry des handlers
const toolRegistry: Map<string, ToolHandler> = new Map();

// Enregistrer tous les handlers
export function registerAllTools(): void {
  toolRegistry.clear();
  
  const handlers = [
    executeCodeHandler,
    shellHandler,
    readFileHandler,
    writeFileHandler,
    editFileHandler,
    listFilesHandler,
    deleteFileHandler,
    rememberHandler,
    recallHandler,
    selfUpdateHandler,
    restartServerHandler,
    switchProviderHandler,
    consultMistralHandler,
    consultAIHandler,
    manageConversationsHandler,
    manageThreadsHandler,
    searxngSearchHandler,
    getKimiBalanceHandler,
    todoHandler,
    retrieveCodeHandler,
    codeIndexHandler,
    logHandler,
    setLogLevelHandler,
    clearLogsHandler,
    telegramHandler,
    configHandler,
    downloadFileHandler,
    sendFileHandler,
    recallToolResultHandler,
    compactHandler
  ];

  for (const handler of handlers) {
    toolRegistry.set(handler.name, handler);
  }
}

// Récupérer toutes les définitions de tools
export function getToolDefinitions(): Tool[] {
  return [
    executeCodeDefinition,
    shellDefinition,
    readFileDefinition,
    writeFileDefinition,
    editFileDefinition,
    listFilesDefinition,
    deleteFileDefinition,
    rememberDefinition,
    recallDefinition,
    selfUpdateDefinition,
    restartServerDefinition,
    switchProviderDefinition,
    consultMistralDefinition,
    consultAIDefinition,
    manageConversationsDefinition,
    manageThreadsDefinition,
    searxngSearchDefinition,
    getKimiBalanceDefinition,
    todoDefinition,
    retrieveCodeDefinition,
    codeIndexDefinition,
    logDefinition,
    setLogLevelDefinition,
    clearLogsDefinition,
    telegramDefinition,
    configDefinition,
    downloadFileDefinition,
    sendFileDefinition,
    recallToolResultDefinition,
    compactDefinition
  ];
}

// Récupérer les définitions filtrées par provider
export function getToolDefinitionsForProvider(provider: string | undefined = undefined): Tool[] {
  const allTools = getToolDefinitions();
  const activeProvider = provider || PROVIDER.ACTIVE;
  
  return allTools.filter(tool => {
    // web_search est uniquement pour Kimi
    if (tool.name === 'web_search') {
      return activeProvider === 'kimi';
    }
    // get_kimi_balance est uniquement pour Kimi
    if (tool.name === 'get_kimi_balance') {
      return activeProvider === 'kimi';
    }
    return true;
  });
}

// Récupérer un handler par son nom
export function getToolHandler(toolName: string): ToolHandler | undefined {
  // Initialiser le registry si nécessaire
  if (toolRegistry.size === 0) {
    registerAllTools();
  }

  return toolRegistry.get(toolName);
}

// Exécuter un tool par son nom
export async function executeTool(
  toolName: string,
  input: ToolInput,
  context: ToolContext
): Promise<ToolResult> {
  // Initialiser le registry si nécessaire
  if (toolRegistry.size === 0) {
    registerAllTools();
  }
  
  const handler = toolRegistry.get(toolName);
  if (!handler) {
    return { success: false, error: `Outil inconnu: ${toolName}` };
  }
  
  return await handler.execute(input, context);
}

// Export des types et handlers individuels
export * from './types';
export {
  executeCodeHandler,
  shellHandler,
  configHandler,
  downloadFileHandler,
  sendFileHandler,
  readFileHandler,
  writeFileHandler,
  editFileHandler,
  listFilesHandler,
  deleteFileHandler,
  rememberHandler,
  recallHandler,
  selfUpdateHandler,
  restartServerHandler,
  switchProviderHandler,
  consultMistralHandler,
  consultAIHandler,
  manageConversationsHandler,
  searxngSearchHandler,
  getKimiBalanceHandler,
  todoHandler,
  retrieveCodeHandler,
  codeIndexHandler,
  logHandler,
  setLogLevelHandler,
  clearLogsHandler,
  recallToolResultHandler,
  compactHandler
};
