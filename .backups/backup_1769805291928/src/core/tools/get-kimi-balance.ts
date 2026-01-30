/**
 * Tool: get_kimi_balance - Récupère le solde Kimi
 */

import { Tool, ToolResult, ToolInput } from '../types';
import { ToolHandler, ToolContext } from './types';
import { APIS, PATHS } from '../../config';

export const getKimiBalanceDefinition: Tool = {
  name: 'get_kimi_balance',
  description: 'Récupère les crédits disponibles sur le compte Moonshot AI (Kimi). Utile pour vérifier le solde restant en USD (cash + vouchers) avant d\'effectuer des opérations coûteuses.',
  input_schema: {
    type: 'object',
    properties: {},
    required: []
  }
};

export const getKimiBalanceHandler: ToolHandler = {
  name: 'get_kimi_balance',
  definition: getKimiBalanceDefinition,
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    try {
      const fs = await import('fs');
      const kimiKey = APIS.KIMI_API_KEY || (fs.existsSync(PATHS.KIMI_KEY_FILE) 
        ? fs.readFileSync(PATHS.KIMI_KEY_FILE, 'utf-8').trim()
        : '');
      
      if (!kimiKey) {
        return {
          success: false,
          error: 'Clé API Kimi non configurée'
        };
      }

      const response = await fetch('https://api.moonshot.ai/v1/users/me/balance', {
        headers: {
          'Authorization': `Bearer ${kimiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          error: `API Error: ${response.status} - ${await response.text()}`
        };
      }

      const data = await response.json();
      
      if (data.code !== 0 || !data.status) {
        return {
          success: false,
          error: `API Error: code ${data.code}, scode ${data.scode}`
        };
      }

      return {
        success: true,
        available_balance: data.data.available_balance,
        voucher_balance: data.data.voucher_balance,
        cash_balance: data.data.cash_balance,
        currency: 'USD',
        message: `Solde disponible: ${data.data.available_balance.toFixed(2)} (Vouchers: ${data.data.voucher_balance.toFixed(2)}, Cash: ${data.data.cash_balance.toFixed(2)})`
      };
    } catch (error) {
      return {
        success: false,
        error: `Erreur: ${(error as Error).message}`
      };
    }
  }
};
