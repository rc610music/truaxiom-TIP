import {
  activity,
  agents,
  ingestionSources,
  knowledgeObjects,
  modules,
  organization,
  products,
  projects,
  recommendations,
  tasks
} from "./seed";
import { createRepositorySnapshot } from "./dataAccess";
import { rootWorkContentMap } from "./rootWorkContentMap";

export function createTipBootstrapSnapshot() {
  return createRepositorySnapshot({
    organizations: [organization],
    products,
    projects,
    modules,
    agents,
    knowledgeObjects,
    tasks,
    recommendations,
    ingestionSources,
    contentMaps: [rootWorkContentMap],
    activity
  });
}
