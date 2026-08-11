import type {
  ActivityEvent,
  Agent,
  IngestionSource,
  KnowledgeObject,
  Module,
  Organization,
  Product,
  Project,
  Recommendation,
  Task
} from "@truaxiom/types";

const now = "2026-08-10T00:00:00-04:00";

export const organization: Organization = {
  id: "ORG-TRUAXIOM",
  name: "TruaXiom LLC",
  description: "Innovation studio building AI-powered tools, digital products, and scalable systems for creators, entrepreneurs, and growing businesses.",
  status: "active",
  createdAt: now,
  updatedAt: now,
  mission: "Simplify advanced technology into practical systems that help creators, founders, and small businesses grow.",
  vision: "A connected ecosystem where intelligent systems help businesses understand themselves, coordinate work, and act with clarity.",
  values: ["Practical innovation", "Human authority", "Reusable systems", "Creative momentum", "Operational clarity"],
  domains: ["AI integration", "workflow automation", "SaaS development", "brand systems", "content intelligence"]
};

export const products: Product[] = [
  {
    id: "PROD-TIP",
    organizationId: organization.id,
    name: "TruaXiom Intelligence Platform",
    description: "Flagship business intelligence operating system and Mission Control platform.",
    status: "active",
    category: "platform",
    stage: "prototype",
    repository: "https://github.com/rc610music/truaxiom-TIP",
    createdAt: now,
    updatedAt: now,
    tags: ["flagship", "platform", "mission-control"]
  },
  {
    id: "PROD-ROOTWORK",
    organizationId: organization.id,
    name: "RootWork",
    description: "Wellness and personal growth brand used as the first production validation target for TIP.",
    status: "active",
    category: "brand",
    stage: "production",
    publicUrl: "https://restoreyour.life",
    createdAt: now,
    updatedAt: now,
    tags: ["first-client", "wellness", "content-intelligence"]
  },
  {
    id: "PROD-BOOGIE-LAB",
    organizationId: organization.id,
    name: "Boogie Lab",
    description: "Custom sneaker design studio and product showcase.",
    status: "active",
    category: "app",
    stage: "mvp",
    publicUrl: "https://boogieslab.truaxiom.llc",
    createdAt: now,
    updatedAt: now,
    tags: ["client-project", "design", "commerce"]
  },
  {
    id: "PROD-STOCKSENSE",
    organizationId: organization.id,
    name: "StockSense",
    description: "Investing and options intelligence product family.",
    status: "planned",
    category: "brand",
    stage: "concept",
    createdAt: now,
    updatedAt: now,
    tags: ["markets", "analytics"]
  },
  {
    id: "PROD-PROMPT2POD",
    organizationId: organization.id,
    name: "Prompt2Pod",
    description: "Podcast scripting and production workflow product.",
    status: "planned",
    category: "app",
    stage: "prototype",
    createdAt: now,
    updatedAt: now,
    tags: ["podcast", "content"]
  },
  {
    id: "PROD-SCROLLODEX",
    organizationId: organization.id,
    name: "Scrollodex",
    description: "Rolodex-inspired contact, skill, and business card intelligence application.",
    status: "planned",
    category: "app",
    stage: "mvp",
    createdAt: now,
    updatedAt: now,
    tags: ["contacts", "ocr", "skills"]
  }
];

export const modules: Module[] = [
  {
    id: "MOD-0001",
    name: "Content Intelligence",
    description: "Maps, recommends, drafts, and optimizes content across a connected product ecosystem.",
    status: "planned",
    createdAt: now,
    updatedAt: now,
    capability: "content_strategy",
    installable: true,
    tags: ["content", "seo", "publishing"]
  },
  {
    id: "MOD-0002",
    name: "Project Intelligence",
    description: "Tracks project health, status, blockers, and next actions.",
    status: "planned",
    createdAt: now,
    updatedAt: now,
    capability: "project_operations",
    installable: true,
    tags: ["projects", "operations"]
  },
  {
    id: "MOD-0003",
    name: "Brand Intelligence",
    description: "Maintains brand voice, identity, messaging, and design alignment.",
    status: "planned",
    createdAt: now,
    updatedAt: now,
    capability: "brand_governance",
    installable: true,
    tags: ["brand", "voice", "identity"]
  }
];

export const agents: Agent[] = [
  {
    id: "AGT-0001",
    name: "RootWork Agent",
    description: "First product-specific agent for RootWork content, resources, and practices.",
    status: "planned",
    createdAt: now,
    updatedAt: now,
    productId: "PROD-ROOTWORK",
    moduleIds: ["MOD-0001", "MOD-0003"],
    objective: "Map RootWork knowledge, recommend content additions, and support future publishing automation.",
    autonomyLevel: "recommend",
    tags: ["rootwork", "content", "validation"]
  }
];

export const projects: Project[] = [
  {
    id: "PRJ-SPRINT-002",
    name: "Sprint 002 — Core Platform",
    description: "Build the Mission Control shell, core models, seed data, and initial graph stubs.",
    status: "active",
    organizationId: organization.id,
    productId: "PROD-TIP",
    priority: "critical",
    sprint: "SPRINT-002",
    nextAction: "Add task and recommendation models, then prepare RootWork ingestion planning.",
    createdAt: now,
    updatedAt: now,
    tags: ["sprint", "core-platform"]
  }
];

export const knowledgeObjects: KnowledgeObject[] = [
  {
    id: "KNO-0001",
    name: "TIP Sprint 001 Foundation Package",
    description: "Foundation architecture, registry, roadmap, and Sprint 002 draft uploaded to repository.",
    status: "active",
    sourceType: "repository",
    sourceUri: "https://github.com/rc610music/truaxiom-TIP",
    confidence: "verified",
    approvalStatus: "approved",
    freshness: "new",
    createdAt: now,
    updatedAt: now,
    tags: ["sprint-001", "foundation"]
  },
  {
    id: "KNO-0002",
    name: "RootWork Production Validation Target",
    description: "RootWork / restoreyour.life is the first product used to validate site crawling, content mapping, and recommendations.",
    status: "active",
    sourceType: "system",
    sourceUri: "https://restoreyour.life",
    confidence: "verified",
    approvalStatus: "approved",
    freshness: "new",
    createdAt: now,
    updatedAt: now,
    tags: ["rootwork", "validation", "content-intelligence"]
  }
];

export const tasks: Task[] = [
  {
    id: "TASK-0001",
    name: "Create local development instructions",
    description: "Document how to install dependencies, run Mission Control, and understand the current app structure.",
    status: "active",
    workflowStatus: "ready",
    priority: "high",
    productId: "PROD-TIP",
    projectId: "PRJ-SPRINT-002",
    acceptanceCriteria: ["Document root workspace commands", "Document Mission Control run path", "Document current limitations"],
    createdAt: now,
    updatedAt: now,
    tags: ["developer-experience", "docs"]
  },
  {
    id: "TASK-0002",
    name: "Prepare RootWork ingestion plan",
    description: "Define the first crawl targets, content categories, metadata needs, and recommendation outputs for RootWork.",
    status: "active",
    workflowStatus: "ready",
    priority: "critical",
    productId: "PROD-ROOTWORK",
    projectId: "PRJ-SPRINT-002",
    acceptanceCriteria: ["Define crawl sections", "Define ingestion outputs", "Define approval boundaries"],
    createdAt: now,
    updatedAt: now,
    tags: ["rootwork", "ingestion", "content-intelligence"]
  },
  {
    id: "TASK-0003",
    name: "Add recommendation model to Mission Control",
    description: "Represent intelligence recommendations as first-class objects in the app shell.",
    status: "active",
    workflowStatus: "in_progress",
    priority: "high",
    productId: "PROD-TIP",
    projectId: "PRJ-SPRINT-002",
    recommendationId: "REC-0001",
    acceptanceCriteria: ["Add recommendation type", "Seed first recommendations", "Display recommendations in Mission Control"],
    createdAt: now,
    updatedAt: now,
    tags: ["mission-control", "recommendations"]
  }
];

export const recommendations: Recommendation[] = [
  {
    id: "REC-0001",
    name: "Model recommendations before advanced AI execution",
    description: "Mission Control should display recommendations as structured objects before TIP attempts autonomous reasoning.",
    status: "active",
    type: "architecture",
    priority: "critical",
    confidence: "high",
    recommendationStatus: "accepted",
    productId: "PROD-TIP",
    projectId: "PRJ-SPRINT-002",
    moduleId: "MOD-0002",
    rationale: "Recommendations are the bridge between context and action. Modeling them early gives the Intelligence Engine a stable output target.",
    evidence: ["Sprint 002 objective requires recommendation placeholders", "Mission Control must prioritize what happens next"],
    expectedImpact: "Creates a clear path from Organizational Brain context to actionable tasks.",
    nextAction: "Display active recommendations in Mission Control.",
    createsTaskIds: ["TASK-0003"],
    createdAt: now,
    updatedAt: now,
    tags: ["architecture", "recommendations", "mission-control"]
  },
  {
    id: "REC-0002",
    name: "Start RootWork with read-only ingestion",
    description: "The first RootWork connector pass should only map and recommend. Publishing should remain manual until confidence and approval rules are implemented.",
    status: "active",
    type: "workflow",
    priority: "high",
    confidence: "high",
    recommendationStatus: "new",
    productId: "PROD-ROOTWORK",
    projectId: "PRJ-SPRINT-002",
    agentId: "AGT-0001",
    moduleId: "MOD-0001",
    rationale: "Read-only ingestion gives TIP context without risking unintended changes to the live RootWork site.",
    evidence: ["RootWork is production-facing", "Lovable publishing automation boundaries are not yet verified"],
    expectedImpact: "Allows fast validation while preserving founder control and site safety.",
    nextAction: "Create the RootWork ingestion plan and content map schema.",
    createsTaskIds: ["TASK-0002"],
    createdAt: now,
    updatedAt: now,
    tags: ["rootwork", "safe-automation", "ingestion"]
  }
];

export const ingestionSources: IngestionSource[] = [
  {
    id: "SRC-ROOTWORK-WEBSITE",
    productId: "PROD-ROOTWORK",
    label: "RootWork Website",
    url: "https://restoreyour.life",
    sourceType: "website",
    crawlFrequency: "manual",
    sections: ["blog", "resources", "practices", "pages"],
    enabled: true
  }
];

export const activity: ActivityEvent[] = [
  {
    id: "ACT-0001",
    type: "created",
    label: "Sprint 001 completed",
    description: "Foundation architecture package completed and uploaded to the repository.",
    occurredAt: "2026-08-10T05:00:00-04:00",
    entityId: "SPRINT-001",
    entityType: "activity"
  },
  {
    id: "ACT-0002",
    type: "created",
    label: "Sprint 002 started",
    description: "Core platform implementation begins with Mission Control shell and shared data models.",
    occurredAt: now,
    entityId: "PRJ-SPRINT-002",
    entityType: "project"
  },
  {
    id: "ACT-0003",
    type: "recommended",
    label: "Recommendation model added",
    description: "TIP now treats recommendations as first-class objects that can create tasks and drive Mission Control priorities.",
    occurredAt: now,
    entityId: "REC-0001",
    entityType: "recommendation"
  }
];
