import Anthropic from "@anthropic-ai/sdk";
import { config, TOKENS, MODELS, APIS } from "../config.js";

// Types pour Mistral
interface MistralMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface MistralChoice {
  index: number;
  message: MistralMessage;
  finish_reason: string;
}

interface MistralUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface MistralResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: MistralChoice[];
  usage: MistralUsage;
}

export type MistralComplexity = "low" | "medium" | "high" | "auto";

export interface ConsultRequest {
  query: string;
  context?: string;
  complexity?: MistralComplexity;
  forceModel?: "large" | "medium" | "small";
}

export interface ConsultResponse {
  response: string;
  model: string;
  reasoning: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * MistralConsultant - Un "second regard" IA à disposition de DangerousBot
 * 
 * Permet de consulter les modèles Mistral pour obtenir un avis extérieur,
 * faire du brainstorming, valider des idées, ou déléguer des tâches simples.
 */
export class MistralConsultant {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || APIS.MISTRAL_API_KEY;
    this.baseUrl = APIS.MISTRAL_BASE_URL;
    if (!this.apiKey) {
      throw new Error("Mistral API key not configured");
    }
  }

  /**
   * Sélectionne automatiquement le modèle selon la complexité
   */
  private selectModel(complexity: MistralComplexity, query: string): string {
    if (complexity !== "auto") {
      const modelMap = {
        low: MODELS.MISTRAL_SMALL,
        medium: MODELS.MISTRAL_MEDIUM,
        high: MODELS.MISTRAL_LARGE,
      };
      return modelMap[complexity];
    }

    // Auto-détection basée sur des heuristiques
    const queryLower = query.toLowerCase();
    
    // Indicateurs de haute complexité
    const highComplexityIndicators = [
      "architecture", "design", "security", "critical", "review",
      "optimize", "refactor", "complex", "strategy", "decision"
    ];
    
    // Indicateurs de basse complexité
    const lowComplexityIndicators = [
      "format", "convert", "simple", "quick", "list", "generate data",
      "json", "example", "template"
    ];

    const hasHighIndicator = highComplexityIndicators.some(i => queryLower.includes(i));
    const hasLowIndicator = lowComplexityIndicators.some(i => queryLower.includes(i));

    if (hasHighIndicator && !hasLowIndicator) {
      return MODELS.MISTRAL_LARGE;
    } else if (hasLowIndicator && !hasHighIndicator) {
      return MODELS.MISTRAL_SMALL;
    }
    
    // Par défaut: medium
    return MODELS.MISTRAL_MEDIUM;
  }

  /**
   * Consulte un modèle Mistral
   */
  async consult(request: ConsultRequest): Promise<ConsultResponse> {
    const { query, context, complexity = "auto", forceModel } = request;

    // Sélection du modèle
    let model: string;
    let reasoning: string;

    if (forceModel) {
      const forceModelMap = {
        large: MODELS.MISTRAL_LARGE,
        medium: MODELS.MISTRAL_MEDIUM,
        small: MODELS.MISTRAL_SMALL,
      };
      model = forceModelMap[forceModel];
      reasoning = `Modèle forcé: ${forceModel}`;
    } else {
      model = this.selectModel(complexity, query);
      reasoning = complexity === "auto" 
        ? `Auto-sélection basée sur l'analyse de la requête`
        : `Complexité spécifiée: ${complexity}`;
    }

    // Construction du prompt
    const systemPrompt = `Tu es un assistant consulté par DangerousBot, une IA autonome et évolutive.
DangerousBot te consulte pour obtenir un second avis, brainstormer, ou déléguer certaines tâches.
Sois concis, direct et utile.`;

    const userContent = context 
      ? `Contexte:\n${context}\n\n---\n\nQuestion/Tâche:\n${query}`
      : query;

    // Appel API Mistral
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: TOKENS.MAX_CONSULT_AI_RESPONSE,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as MistralResponse;

    return {
      response: data.choices[0].message.content,
      model,
      reasoning,
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      },
    };
  }

  /**
   * Raccourcis pour des cas d'usage courants
   */
  
  async reviewCode(code: string, language: string, focus?: string): Promise<ConsultResponse> {
    return this.consult({
      query: `Review ce code ${language}${focus ? ` avec un focus sur: ${focus}` : ""}:\n\n\`\`\`${language}\n${code}\n\`\`\``,
      complexity: "high",
    });
  }

  async brainstorm(topic: string, constraints?: string): Promise<ConsultResponse> {
    return this.consult({
      query: `Brainstorme sur: ${topic}${constraints ? `\n\nContraintes: ${constraints}` : ""}`,
      complexity: "medium",
    });
  }

  async quickTask(task: string): Promise<ConsultResponse> {
    return this.consult({
      query: task,
      complexity: "low",
    });
  }

  async validate(idea: string, context?: string): Promise<ConsultResponse> {
    return this.consult({
      query: `Valide cette idée/approche et donne ton avis critique:\n\n${idea}`,
      context,
      complexity: "medium",
    });
  }
}

/**
 * Définition du tool pour Claude
 */
export const mistralTool: Anthropic.Tool = {
  name: "consult_mistral",
  description: `Consulte un modèle Mistral pour obtenir un second avis, brainstormer, ou déléguer une tâche.
Les modèles disponibles sont automatiquement sélectionnés selon la complexité:
- HIGH (Mistral Large 3): architecture, sécurité, décisions critiques, code review complexe
- MEDIUM (Mistral Medium 3.1): brainstorming, validation d'idées, questions générales
- LOW (Mistral Small 3.2): tâches rapides, formatting, génération de données

Utilise cet outil quand tu veux:
- Un second avis sur une approche
- Brainstormer des idées
- Valider une décision
- Déléguer une tâche simple pour économiser tes tokens
- Faire review du code avant de le proposer`,
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "La question ou tâche à soumettre à Mistral",
      },
      context: {
        type: "string",
        description: "Contexte additionnel (optionnel)",
      },
      complexity: {
        type: "string",
        enum: ["low", "medium", "high", "auto"],
        description: "Complexité de la tâche (auto par défaut = sélection automatique du modèle)",
      },
      force_model: {
        type: "string",
        enum: ["large", "medium", "small"],
        description: "Forcer un modèle spécifique (optionnel, override la complexité)",
      },
    },
    required: ["query"],
  },
};
