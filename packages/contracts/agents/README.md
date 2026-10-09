# Trusted Agent Manifest catalog

Repository-reviewed JSON Agent Manifests go here. No agents are activated by Runtime 002.
The existing bootstrap `agents` collection is demo data and lacks canonical manifests;
it is deliberately not treated as execution authority. HTTP clients cannot add manifests.

Scope must explicitly include a Registry project id or capability id. Exclusions deny
matching projects, capabilities and namespaced permissions. No wildcard scope is inferred.
