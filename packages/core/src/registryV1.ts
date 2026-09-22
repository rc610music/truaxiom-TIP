import type { Organization, Product, Project } from "@truaxiom/types";
import { organization } from "./seed";

const registeredAt = "2026-09-22T00:00:00.000Z";

export const registryV1Version = "v1" as const;

export const registryV1Organization: Organization = organization;

export const registryV1Products: Product[] = [
  {
    id: "PROD-TIP",
    organizationId: organization.id,
    name: "TIP",
    description: "Shared TIP Core intelligence. Mission Control is the operator UI for this product. There is one TIP core for the ecosystem.",
    status: "active",
    category: "platform",
    stage: "prototype",
    publicUrl: "https://rc610music.github.io/truaxiom-TIP/",
    repository: "https://github.com/rc610music/truaxiom-TIP",
    createdAt: registeredAt,
    updatedAt: registeredAt,
    tags: ["registry-v1", "tip-core", "mission-control"]
  },
  {
    id: "PROD-COMMAND-CENTER",
    organizationId: organization.id,
    name: "Command Center",
    description: "Separate executive frontend. It shares these product and project ids with TIP Core and does not run its own TIP core.",
    status: "active",
    category: "app",
    stage: "prototype",
    createdAt: registeredAt,
    updatedAt: registeredAt,
    tags: ["registry-v1", "executive"]
  },
  {
    id: "PROD-ROOTWORK",
    organizationId: organization.id,
    name: "RootWork",
    description: "Wellness product registered in TIP Registry v1.",
    status: "active",
    category: "brand",
    stage: "production",
    publicUrl: "https://restoreyour.life",
    createdAt: registeredAt,
    updatedAt: registeredAt,
    tags: ["registry-v1"]
  },
  {
    id: "PROD-VIBN",
    organizationId: organization.id,
    name: "V!B^n",
    description: "V!B^n product registered in TIP Registry v1.",
    status: "active",
    category: "website",
    stage: "production",
    publicUrl: "https://vibn.social",
    createdAt: registeredAt,
    updatedAt: registeredAt,
    tags: ["registry-v1"]
  },
  {
    id: "PROD-PREPPAY",
    organizationId: organization.id,
    name: "Prep\u2019Pay",
    description: "Prep\u2019Pay product registered in TIP Registry v1.",
    status: "active",
    category: "app",
    stage: "concept",
    createdAt: registeredAt,
    updatedAt: registeredAt,
    tags: ["registry-v1"]
  },
  {
    id: "PROD-KRONIKE",
    organizationId: organization.id,
    name: "Kronike",
    description: "Kronike product registered in TIP Registry v1.",
    status: "active",
    category: "app",
    stage: "concept",
    createdAt: registeredAt,
    updatedAt: registeredAt,
    tags: ["registry-v1"]
  },
  {
    id: "PROD-FLOWFEED",
    organizationId: organization.id,
    name: "FlowFeed",
    description: "FlowFeed product registered in TIP Registry v1.",
    status: "active",
    category: "app",
    stage: "concept",
    createdAt: registeredAt,
    updatedAt: registeredAt,
    tags: ["registry-v1"]
  },
  {
    id: "PROD-DOTDIZZY",
    organizationId: organization.id,
    name: "DotDizzy",
    description: "DotDizzy product registered in TIP Registry v1.",
    status: "active",
    category: "website",
    stage: "production",
    publicUrl: "https://dotdizzy.com",
    createdAt: registeredAt,
    updatedAt: registeredAt,
    tags: ["registry-v1"]
  }
];

export const registryV1Projects: Project[] = [
  project("PRJ-TIP", "PROD-TIP", "TIP Core", "Shared intelligence core and Mission Control operator surface.", "critical"),
  project("PRJ-COMMAND-CENTER", "PROD-COMMAND-CENTER", "Command Center", "Executive frontend project. Uses the shared TIP product and project ids.", "high"),
  project("PRJ-ROOTWORK", "PROD-ROOTWORK", "RootWork", "RootWork project registered under the shared TIP organization.", "high"),
  project("PRJ-VIBN", "PROD-VIBN", "V!B^n", "V!B^n project registered under the shared TIP organization.", "medium"),
  project("PRJ-PREPPAY", "PROD-PREPPAY", "Prep\u2019Pay", "Prep\u2019Pay project registered under the shared TIP organization.", "medium"),
  project("PRJ-KRONIKE", "PROD-KRONIKE", "Kronike", "Kronike project registered under the shared TIP organization.", "medium"),
  project("PRJ-FLOWFEED", "PROD-FLOWFEED", "FlowFeed", "FlowFeed project registered under the shared TIP organization.", "medium"),
  project("PRJ-DOTDIZZY", "PROD-DOTDIZZY", "DotDizzy", "DotDizzy project registered under the shared TIP organization.", "medium")
];

export interface RegistryRecords {
  organizations: Organization[];
  products: Product[];
  projects: Project[];
}

export const registryV1: RegistryRecords = {
  organizations: [registryV1Organization],
  products: registryV1Products,
  projects: registryV1Projects
};

function project(id: string, productId: string, name: string, description: string, priority: Project["priority"]): Project {
  return {
    id,
    organizationId: organization.id,
    productId,
    name,
    description,
    status: "active",
    priority,
    createdAt: registeredAt,
    updatedAt: registeredAt,
    tags: ["registry-v1"]
  };
}
