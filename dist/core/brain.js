"use strict";
/**
 * brain.ts - L'interface avec Claude API
 * C'est le cerveau de DangerousBot
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Brain = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class Brain {
    client;
    conversationHistory = [];
    identity;
    constructor(apiKey) {
        this.client = new sdk_1.default({ apiKey });
        this.identity = this.loadIdentity();
    }
    loadIdentity() {
        const identityPath = path.join(__dirname, '..', '..', 'identity', 'instructions.md');
        return fs.readFileSync(identityPath, 'utf-8');
    }
    async think(userMessage, systemContext = '') {
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });
        const systemPrompt = this.identity + (systemContext ? '\n\n---\n\n' + systemContext : '');
        const response = await this.client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8096,
            system: systemPrompt,
            messages: this.conversationHistory
        });
        const assistantMessage = response.content[0].type === 'text'
            ? response.content[0].text
            : '';
        this.conversationHistory.push({
            role: 'assistant',
            content: assistantMessage
        });
        return {
            text: assistantMessage,
            stopReason: response.stop_reason,
            usage: response.usage
        };
    }
    async thinkWithTools(userMessage, tools, systemContext = '') {
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });
        const systemPrompt = this.identity + (systemContext ? '\n\n---\n\n' + systemContext : '');
        const response = await this.client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8096,
            system: systemPrompt,
            tools: tools,
            messages: this.conversationHistory
        });
        this.conversationHistory.push({
            role: 'assistant',
            content: response.content
        });
        return {
            content: response.content,
            stopReason: response.stop_reason,
            usage: response.usage
        };
    }
    addToolResult(toolUseId, result) {
        this.conversationHistory.push({
            role: 'user',
            content: [{
                    type: 'tool_result',
                    tool_use_id: toolUseId,
                    content: result
                }]
        });
    }
    getHistory() {
        return this.conversationHistory;
    }
    clearHistory() {
        this.conversationHistory = [];
    }
    exportMemory() {
        return {
            history: this.conversationHistory,
            timestamp: new Date().toISOString()
        };
    }
    importMemory(memory) {
        if (memory && memory.history) {
            this.conversationHistory = memory.history;
        }
    }
}
exports.Brain = Brain;
//# sourceMappingURL=brain.js.map