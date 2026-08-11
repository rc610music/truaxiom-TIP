import type { ConfidenceStatus, Priority, Recommendation, RecommendationType } from "@truaxiom/types";

export interface AiGenerationRequest {
  id: string;
  organizationId: string;
  productId?: string;
  moduleId?: string;
  objective: string;
  context: string[];
  constraints: string[];
  requestedAt: string;
}

export interface AiGenerationResult {
  requestId: string;
  provider: string;
  model?: string;
  status: "draft" | "completed" | "failed";
  output: string;
  confidence: ConfidenceStatus;
  evidence: string[];
  createdAt: string;
  errors?: string[];
}

export interface AiProviderAdapter {
  id: string;
  name: string;
  provider: "manual" | "openai" | "anthropic" | "google" | "local" | "other";
  mode: "offline" | "online";
  generate(request: AiGenerationRequest): Promise<AiGenerationResult>;
}

export function createAiGenerationRequest(input: Omit<AiGenerationRequest, "id" | "requestedAt">): AiGenerationRequest {
  return {
    ...input,
    id: `AIR-${Date.now()}`,
    requestedAt: new Date().toISOString()
  };
}

export const manualAiProviderAdapter: AiProviderAdapter = {
  id: "AI-MANUAL-DRAFT",
  name: "Manual Draft Provider",
  provider: "manual",
  mode: "offline",
  async generate(request) {
    return {
      requestId: request.id,
      provider: "manual",
      status: "draft",
      output: `Manual review required for objective: ${request.objective}`,
      confidence: "unknown",
      evidence: request.context.slice(0, 5),
      createdAt: new Date().toISOString(),
      errors: []
    };
  }
};

export function convertAiResultToRecommendation(input: {
  result: AiGenerationResult;
  name: string;
  type: RecommendationType;
  productId?: string;
  projectId?: string;
  moduleId?: string;
  priority?: Priority;
  nextAction: string;
}): Recommendation {
  const now = new Date().toISOString();

  return {
    id: `REC-${input.result.requestId}`,
    name: input.name,
    description: input.result.output,
    status: "active",
    createdAt: now,
    updatedAt: now,
    type: input.type,
    productId: input.productId,
    projectId: input.projectId,
    moduleId: input.moduleId,
    priority: input.priority ?? "medium",
    confidence: input.result.confidence,
    recommendationStatus: "new",
    rationale: input.result.output,
    evidence: input.result.evidence,
    expectedImpact: "Improves TIP's ability to convert intelligence outputs into actionable operating decisions.",
    nextAction: input.nextAction,
    tags: ["ai-adapter", input.result.provider]
  };
}

export function describeAiAdapterReadiness(adapter: AiProviderAdapter): string[] {
  return [
    `Adapter: ${adapter.name}`,
    `Provider: ${adapter.provider}`,
    `Mode: ${adapter.mode}`,
    adapter.mode === "offline" ? "Safe for local/static operation." : "Requires provider credentials and runtime guardrails."
  ];
}
