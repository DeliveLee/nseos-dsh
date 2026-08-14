# Design Rationale and Sources

## Why this is deliberately smaller than a full “AI software factory”

The first release emphasizes a testable operating model. More Agents are added only when a measured bottleneck warrants them. Multi-Agent systems add coordination, evaluation, reliability and token-cost overhead; tightly coupled coding work is often less parallelizable than open-ended research.

## Why Claude Code files are separated

- `CLAUDE.md`: instructions every session must know.
- `.claude/rules/`: focused always-on project rules.
- `.claude/skills/`: reusable workflows loaded when invoked.
- `.claude/agents/`: isolated workers with role-specific tools.
- project files under `ai-nseos/`: durable state and evidence independent of chat history.

## Why prompts are not enforcement

Behavioral instructions reduce ambiguity but do not create a hard security boundary. Permissions, sandboxing, branch protection, CI and human gates enforce high-risk rules.

## Primary references

- Claude Code, “Explore the .claude directory”: https://code.claude.com/docs/en/claude-directory
- Claude Code, “Create custom subagents”: https://code.claude.com/docs/en/sub-agents
- Claude Code, “Extend Claude with skills”: https://code.claude.com/docs/en/slash-commands
- Claude Code, “Configure permissions”: https://code.claude.com/docs/en/permissions
- Anthropic, “How we built our multi-agent research system”: https://www.anthropic.com/engineering/multi-agent-research-system
- OpenAI, “A practical guide to building agents”: https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
- DORA, “State of AI-assisted Software Development 2025”: https://dora.dev/research/2025/dora-report/
- DORA software delivery performance metrics: https://dora.dev/guides/dora-metrics/
- OWASP Top 10 for Agentic Applications: https://genai.owasp.org/2025/12/09/owasp-genai-security-project-releases-top-10-risks-and-mitigations-for-agentic-ai-security/
- Obsidian Vault developer documentation: https://docs.obsidian.md/Plugins/Vault
- Obsidian URI automation documentation: https://help.obsidian.md/Extending+Obsidian/Obsidian+URI

These references informed the structure; project-specific rules must still be validated against the target repository and organization.
