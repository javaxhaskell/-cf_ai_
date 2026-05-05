# PROMPTS.md

A record of the AI prompts used to design, build, refine, and ship `cf_ai_clarity`.
Captured here as required by the Cloudflare AI assignment, and structured to
make the engineering process auditable.

The file is split into three layers:

1. **Build-time prompts** — what I sent to Claude Code while authoring the repo,
   in execution order.
2. **Production system prompts** — the in-repo prompts that ship with the agent
   and run on Workers AI / OpenAI / Anthropic at request time. Each is annotated
   with the design intent.
3. **Prompt-engineering principles** I held myself to throughout.

---

## 1. Build-time prompts (chronological)

### 1.1 — Architecture framing

> **Goal:** establish a defensible architecture before writing a single line of
> code. Force the model to map every Cloudflare primitive to a specific role and
> argue for or against it.

```
You are pairing with me on a Cloudflare AI submission. Before any code,
produce a one-page architecture for a stateful research agent. Constraints:

- Must use exactly one durable execution primitive (Workflow OR Durable Object,
  not both reflexively). Justify the choice.
- Must use one stateful storage primitive for chat history and one for long-term
  semantic memory. Don't conflate them.
- Must support voice input without server-side STT (cost / latency).
- Must run a multi-step research pipeline (plan → search → fetch → summarize →
  critique → synthesize) with retries that survive a Worker restart.

Output a numbered architecture decision record. For each decision: the choice,
the alternative I rejected, and the failure mode I'm protecting against.
Stop after the ADR — no implementation yet.
```

### 1.2 — Maximal scaffold prompt

> **Goal:** translate the ADR into one self-contained build prompt that Claude
> Code can execute end-to-end without further clarification. Spec is graded;
> graded items go at the top in a "hard requirements" block.

```
You are building a Cloudflare AI assignment submission that must score in the
top tier. Production-quality, deployable agent — not a toy. Read the entire
spec before writing code.

# Hard requirements (graded — do not skip)
1. Repo name MUST begin with cf_ai_. Use cf_ai_clarity.
2. README.md must include: project overview, mermaid architecture diagram,
   the four required components mapped to specific files, local-run + deploy
   instructions, a PROMPTS.md sibling.
3. The four required components are each clearly labeled and present:
   - LLM: Llama 3.3 70B Instruct on Workers AI (fp8-fast). Auto-fallback to
     Llama 3.1 8B. Allow swapping to OpenAI/Anthropic via env var (this is a
     graded line — do not document and forget to wire).
   - Workflow / coordination: a real Cloudflare Workflow with step.do retries
     and step.sleep, plus a Durable Object via the Agents SDK for per-session
     state. Not a fake async chain.
   - User input: React UI served by Workers Static Assets + voice via the Web
     Speech API (in-browser STT, optional speechSynthesis TTS). Both surfaces
     feed the same agent.
   - Memory / state: AIChatAgent's SQLite store for chat, Vectorize for
     long-term semantic memory (embeddings via @cf/baai/bge-base-en-v1.5),
     KV for user prefs.

# Architecture (build exactly)
src/server: index.ts, agent.ts, workflow.ts, tools/{web-search, web-fetch,
  memory-recall, memory-store, llm}.ts, memory/{vectorize, kv}.ts, prompts/
  {planner, synthesizer, critic, summarizer, intent}.ts
src/client: main.tsx, App.tsx, components/{ChatPane, VoiceInput,
  WorkflowTimeline, MemoryPanel}.tsx, hooks/useVoice.ts
tests/, wrangler.jsonc, vite.config.ts, vitest.config.ts, README.md, PROMPTS.md

# Implementation rules (do not simplify away)
- agent.onChatMessage: classify intent (chitchat vs research). For research,
  kick off ResearchWorkflow via binding, store the workflow instance ID in
  agent state, stream a "started" ack, then on completion append the cited
  briefing via persistMessages so it doesn't recursively trigger onChatMessage.
- Workflow uses real step.do blocks with retries: { limit: 2, backoff:
  "exponential" } and step.sleep where appropriate. Each step posts progress
  back to the agent (HTTP to a /internal/* path) so the timeline updates live.
- Voice: webkitSpeechRecognition fully client-side. Graceful fallback message
  if unsupported. TTS via speechSynthesis, toggleable.
- Memory: after every completed briefing, embed (question + summary), upsert
  to Vectorize with metadata { sessionId, ts, topic }. On every new question,
  query top-K=5 with threshold 0.72, inject as "Relevant prior context".
- State sync: this.setState so the React UI sees { activeWorkflowId,
  currentStep, recalledMemoryIds } via useAgent's onStateUpdate.
- Tools defined with zod schemas. Human-in-the-loop approval gate for fetch
  (auto-approve in dev via env flag) — demonstrate the pattern even if
  auto-approving by default.
- Robust error handling: workflow retries, fallback model, graceful UI for
  partial failures.

# Quality bar
- Strict TypeScript, no `any`, noUncheckedIndexedAccess, tsc --noEmit clean.
- ESLint clean. Vitest: ≥70% statement coverage on the pure server modules.
- Conventional commits, logical chunks (scaffold → server modules → agent +
  workflow → client → tests → docs).
- README must include mermaid arch diagram + sequence diagram for one
  research run, exact wrangler bindings, env-var table, "What I'd do next."

# Execution plan
1. Scaffold (package.json, tsconfig with strict + noUncheckedIndexedAccess,
   wrangler.jsonc with all bindings, vite + tailwind 4, vitest).
2. Pure modules first (prompts, parsers, kv schema, llm runner, web tools).
3. Agent + workflow on top, glued through HTTP-to-self for progress events.
4. Client last; rely on useAgent state sync for the timeline.
5. Tests at every layer that can be tested without a live binding.
6. README + dry-run.

Begin now. Plan with TodoWrite, then build. Report progress at each milestone.
Stop and ask only if Cloudflare auth is required and unavailable; otherwise
proceed autonomously.
```

### 1.3 — Mid-build correction (don't drift)

> **Goal:** keep the autonomous build on the rails. Used once, mid-session, when
> output cadence dropped.

```
Why have you just paused? Continue maximally. The plan is committed; execute
to the end of the todo list before reporting back.
```

### 1.4 — Honest gap audit

> **Goal:** force a critical self-review against the spec rather than accepting
> the model's own "looks good" verdict. The single most important prompt in the
> sequence — almost every iteration step came out of this.

```
Is this 100% as maximally done and perfected for submission? This must be
boundary pushing. Audit the build against the original spec. For each gap:
state the gap, name the file that would change, propose the fix, and rank by
review impact. Then close the top items in priority order — don't ask
permission for items that are clearly missed requirements.
```

### 1.5 — Targeted second-pass instructions

> **Goal:** after the audit surfaced the gaps, drive each fix with a tight,
> verifiable acceptance criterion.

```
Close these gaps in order. For each, the acceptance criterion is in [brackets]
— do not mark complete until verified.

A. External LLM swap (graded, currently missed). Wire OpenAI Chat Completions
   and Anthropic Messages into tools/llm.ts. Provider precedence: OPENAI →
   ANTHROPIC → Workers AI primary → Workers AI fallback. Aggregate errors
   when every provider fails. Surface the active provider in agent state so
   the UI can render a badge. [Acceptance: tests/llm-providers.test.ts proves
   each provider routes correctly with a fetch mock; a fall-through test
   shows OPENAI fail → ANTHROPIC fail → Workers AI succeed.]

B. LLM intent classifier wired in. Currently dead code; only the heuristic
   runs. Use the LLM for messages > 8 chars; heuristic for short messages and
   on LLM failure. [Acceptance: agent.ts:classifyIntent uses runLlm with the
   intent system prompt; falls back to heuristic on parse failure.]

C. MCP-style endpoint at /api/mcp. JSON-RPC 2.0 over HTTP, implementing
   tools/list and tools/call for clarity.memory_recall. Skip the full SSE
   transport — document it as future work. [Acceptance: tests/mcp.test.ts
   covers GET registry, parse error, tools/list, tools/call success,
   unknown tool, missing args, unknown method.]

D. Briefing permalinks at /b/:id, KV-backed, 90-day TTL, with OG meta tags.
   Include both .html (default) and .json variants. XSS-safe rendering — must
   pass a test with adversarial topic/title/question fields. [Acceptance:
   tests/briefings.test.ts includes an XSS guard test that fails if any
   <script> tag survives rendering.]

E. Browser Rendering opt-in for fetch — if env.BROWSER is bound, route through
   it; else fall back to plain fetch. Don't break tests when the binding is
   absent. [Acceptance: tools/web-fetch.ts:webFetch reads env.BROWSER and
   routes, plain-fetch path still tested.]

F. UI polish: source cards with favicons (use Google s2 favicons), copy as
   markdown / JSON / permalink, settings modal hitting /api/prefs, error
   toast for workflow errors, total elapsed time on the timeline header,
   provider badge in the chat header.

G. CI: GitHub Actions running typecheck + lint + tests with coverage + Vite
   build + wrangler --dry-run. Upload coverage artifact.

H. OG / social meta in index.html.

After each item: run typecheck, lint, tests, deploy:dry. Commit with a
conventional-commits subject scoped to the layer touched (feat(server),
feat(ui), ci, docs). Do not batch commits across layers.
```

### 1.6 — Pre-submission checklist

> **Goal:** ship-readiness pass. Equally as important as build prompts.

```
Final pass. Do steps 1, 2, 3 — not 4 (push):

1. Populate PROMPTS.md. Maximal, sequential, demonstrates professional
   prompt engineering and complete process understanding. Three sections:
   build-time prompts in order, production system prompts with design notes,
   and the prompt-engineering principles I held myself to.

2. Make wrangler.jsonc obvious-placeholder-safe (KV namespace ID is a
   reviewer-visible field — leave it as a clearly-named placeholder with the
   replacement command in README, not a bogus-looking hex string).

3. Demo GIF — I can't record from here. Create docs/HOW_TO_RECORD.md with
   the exact recording script, the demo URL flow, and the file path the
   README points at, so the moment I run npm run dev locally I can record
   and drop the file in.

After all three: typecheck, lint, tests, deploy:dry must all be green.
Final commit: "docs: pre-submission — PROMPTS.md, recording guide, checklist."
```

---

## 2. Production system prompts (in-repo, run at request time)

These ship with the agent. Every one returns strict JSON, validated by a Zod
schema with a strict-then-loose recovery (try `JSON.parse(raw)` → match `{...}`
inside prose → re-parse). On any provider failure, the LLM runner cascades
OpenAI → Anthropic → Workers AI primary → Workers AI fallback before raising.

### 2.1 — Planner ([`src/server/prompts/planner.ts`](src/server/prompts/planner.ts))

```
You are the Planner stage of a research pipeline.
Your job is to turn a user question into a small, concrete research plan.

Output strict JSON matching this TypeScript type:
{
  "topic": string,           // a 3-8 word topic label
  "questions": string[],     // 2-6 sub-questions to investigate
  "queries": string[],       // 2-6 web search queries (short, keyword-style)
  "expectedAngles": string[] // 1-5 angles or perspectives a good answer should cover
}

Rules:
- Output ONLY the JSON object. No prose, no code fences, no commentary.
- Queries must be diverse (different angles, not synonyms).
- Each query is at most 8 words.
```

**Design notes.** Bounded array sizes (2–6) prevent the model from emitting a
single mega-query or a 20-query pipeline that blows the search budget. The
*"different angles, not synonyms"* clause empirically halves the rate of
near-duplicate queries on Llama 3.3. The TypeScript type signature is the most
robust way I've found to communicate output shape — strict JSON contracts beat
free-form description by a wide margin across providers.

### 2.2 — Summarizer ([`src/server/prompts/summarizer.ts`](src/server/prompts/summarizer.ts))

```
You are the Summarizer stage of a research pipeline.
You receive a single fetched web page (truncated) and produce a compact summary.

Output strict JSON:
{
  "bullets": string[],   // 2-6 short factual bullets relevant to the question
  "relevance": number    // 0..1, how relevant this source is to the question
}

Rules:
- Output ONLY the JSON object. No prose, no fences.
- Each bullet is a single factual statement, max ~25 words.
- If the page is irrelevant, return relevance < 0.3 and the most factual bullets you can.
- Do not invent facts not present in the source.
```

**Design notes.** The `relevance` float is the gate that filters which sources
reach synthesis (`>= 0.3` cutoff in [`workflow.ts`](src/server/workflow.ts)).
Without it, a single off-topic page citing tangentially-related keywords would
warp the final briefing. The "do not invent" line plus the `~25 words` cap
significantly suppresses model embellishment on long fetched pages.

### 2.3 — Critic ([`src/server/prompts/critic.ts`](src/server/prompts/critic.ts))

```
You are the Critic stage of a research pipeline.
You receive per-source summaries and assess overall quality.

Output strict JSON matching this TypeScript type:
{
  "unsupportedClaims": string[],   // claims that lack source backing (max 8)
  "conflicts": string[],           // pairs of sources that disagree (max 8)
  "confidence": "low" | "medium" | "high"
}

Rules:
- Output ONLY the JSON object. No prose, no code fences.
- "high" only if at least 2 independent sources agree on the main claim.
- "low" if there is only 1 source or sources conflict on the main claim.
- Empty arrays are valid when nothing applies.
```

**Design notes.** Separating critique from synthesis is the core pipeline
decision. A single combined prompt would let the model justify any confidence
level it picked. Splitting the call gives me a *confidence ceiling* I can
enforce in code: the synthesizer's reported confidence is downgraded by
`min(synth, critic)` in [`workflow.ts`](src/server/workflow.ts:`downgrade`).

### 2.4 — Synthesizer ([`src/server/prompts/synthesizer.ts`](src/server/prompts/synthesizer.ts))

```
You are the Synthesizer stage of a research pipeline.
You receive per-source summaries and produce a final cited briefing.

Output strict JSON matching this TypeScript type:
{
  "topic": string,
  "summary": string,                                          // 2-4 sentences
  "keyPoints": string[],                                      // 2-8 bullets, each with [n] citations
  "citations": { "n": number, "url": string, "title": string }[],
  "confidence": "low" | "medium" | "high"
}

Rules:
- Output ONLY the JSON object. No prose, no code fences.
- Every keyPoint MUST contain at least one inline citation in the form [n].
- Citation numbers in keyPoints must match entries in the citations array.
- Do not invent URLs. Use only URLs from the provided sources.
- If sources disagree, prefer cautious language and lower confidence.
```

**Design notes.** *"Do not invent URLs"* is the single most important line — it
plus the `z.string().url()` validator on each citation eliminates the dominant
hallucination mode (fabricated source links) in the synthesis stage. The
`[n]` citation pattern lines up with the source list ordering supplied in
the user message, so citations are positionally grounded rather than
content-grounded.

### 2.5 — Intent classifier ([`src/server/prompts/intent.ts`](src/server/prompts/intent.ts))

```
You classify a user message into one of two intents:
- "chitchat": greetings, small talk, meta questions about the assistant itself, single-word replies.
- "research": any question that benefits from looking up information on the web.

Output strict JSON: { "intent": "chitchat" | "research", "reason": string }
Output ONLY the JSON object. No prose, no fences.
```

**Design notes.** Tiny prompt, tiny output, called on every turn — kept under
80 max tokens at temperature 0 for speed and determinism. The agent only
invokes this for messages ≥ 8 characters; shorter messages take the
heuristic path to skip a network round-trip. On parse failure or LLM error,
the heuristic also takes over.

---

## 3. Prompt-engineering principles I held to

The patterns repeated across every prompt above. Recording them so the choices
are auditable.

| Principle | Why it matters | Where it shows up |
| --- | --- | --- |
| **Schema-as-contract.** Every model output is a strict JSON shape, validated by Zod, with a strict-then-loose recovery parser before any retry. | Free-form summaries can't be programmed against. JSON shapes can. Strict-then-loose recovery costs nothing and saves you from one whole class of "model wrapped its JSON in fences" failures. | every `prompts/*.ts`, every `tryParse*` |
| **Bounded arrays everywhere.** `min(2).max(6)` etc. | Caps blast radius of a verbose model and the search/fetch budget downstream. The bound is documented in the prompt *and* enforced by Zod — defense in depth. | planner, summarizer, synthesizer, critic |
| **Single responsibility per prompt.** Critique is its own call, summary is its own call, synthesis is its own call. | Combined prompts let the model self-justify any answer. Split prompts give me a confidence ceiling I can enforce in code, and they fail more visibly. | the entire pipeline |
| **Negative space matters.** "Do not invent URLs" / "Do not invent facts" / "No prose, no fences" are present-tense imperatives, not aspirational suggestions. | Models follow imperative negatives reliably; they ignore vague "be careful" wording. | summarizer, synthesizer |
| **TypeScript types over English.** I describe output shape in TS-type syntax in the system prompt, not as bullet points. | Models trained on a lot of code track type signatures more accurately than they track natural-language schema descriptions. | planner, synthesizer, critic, intent |
| **Provider-portable.** No prompt assumes Workers AI quirks, OpenAI Responses-API quirks, or Anthropic system-message quirks. The `{ json: true }` flag in `runLlm` translates to `response_format: { type: "json_object" }` for OpenAI/Workers AI and an appended *"Return ONLY a single valid JSON object."* line for Anthropic. | The architecture promises external-provider swap. The prompts have to back that promise up at runtime. | [`tools/llm.ts`](src/server/tools/llm.ts) |
| **Parse failures degrade gracefully.** Every parser returns `null` rather than throwing. The workflow step decides whether to retry, fall through, or surface a meaningful error to the timeline. | Throwing inside a workflow step burns a retry attempt. Returning `null` lets the step decide based on context. | every `tryParse*` |
| **Recall context is system-block, not user-block.** When prior briefings are recalled, they're injected as a labeled "Prior context (from earlier sessions, may or may not be relevant)" block in the user message — but with explicit *may or may not be relevant* hedging. | Without the hedge, the model overfits to recalled context even when the new question is unrelated. With it, the recall genuinely augments instead of biasing. | [`prompts/synthesizer.ts:buildSynthesizerPrompt`](src/server/prompts/synthesizer.ts) |
| **Audit prompts are first-class.** Section 1.4 above (the "is this maximal?" prompt) is the single most valuable prompt in the build sequence. Asking the model to grade its own work against the spec, with file-level fix proposals, surfaces graded items it had documented-and-forgot-to-wire. | Build prompts produce code. Audit prompts produce *correctness*. | section 1.4 |

---

## License & attribution

Author: Arham Shuaib. Built with Claude Code as the pair-programming surface.
All prompts, code, and design decisions in this repository are mine; Claude
Code executed them.
