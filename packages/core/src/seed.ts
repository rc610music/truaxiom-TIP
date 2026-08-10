import type { ActivityEvent, Agent, Module, Organization, Product, Project } from "@truaxiom/types";

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
    nextAction: "Initialize Mission Control shell and seed organizational data.",
    createdAt: now,
    updatedAt: now,
    tags: ["sprint", "core-platform"]
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
  }
];
