# Trusted Capability Manifest catalog

Repository-reviewed JSON Capability Manifests go here. Required permissions use exact
`read:resource`, `write:resource`, or `actions:action` names corresponding to AgentManifest
permission groups. No wildcard expansion or cross-namespace grant inference.

Risk and permissions supplied by missions can only strengthen these requirements.
`outputs` names are evidence kinds required before review. Catalog JSON is validated
at API startup; undeclared capabilities produce UNROUTABLE, not an invented worker.
