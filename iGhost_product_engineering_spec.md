# iGhost Product & Engineering Specification

**Project name:** iGhost  
**Tagline:** Summon AI users before real users rage-quit.  
**Hackathon target:** OpenAI track only  
**Core principle:** Every meaningful feature must depend on OpenAI models in a way that is central to the product, not decorative.

---

## 0. Executive Summary

iGhost is an AI-native usability testing product. A user uploads one or more screenshots of a product flow, describes the intended product and task, then summons AI "ghost users" who attempt to understand, trust, and use the product.

Each ghost has a distinct persona, goal, patience level, skepticism level, and behavioral pattern. The ghosts narrate their reactions using OpenAI voice models, produce task-specific feedback, identify where they would rage-quit, and generate concrete improvements.

iGhost then produces:
- live ghost reactions;
- voice narration;
- animated ghost avatars;
- rage-quit replay;
- before/after copy rewrites;
- layout suggestions;
- generated annotated screenshots;
- Codex-generated patch suggestions;
- a shareable report.

The user should feel like they are watching a synthetic usability lab session, not reading an AI-generated UX report.

---

## 1. Product Positioning

### 1.1 One-Sentence Description

iGhost is an AI usability lab that lets builders summon synthetic users to test product flows, reveal where users get confused, and generate improvements before real users see the product.

### 1.2 Primary User

The primary user is a builder, founder, designer, or hackathon team that has a prototype, landing page, or product flow and needs fast qualitative feedback before showing it to real users.

### 1.3 Core Use Case

A user has a product flow and wants to answer:

> "Would a first-time user understand this, trust this, and know what to do next?"

### 1.4 Core Product Loop

1. Upload screenshots of a product flow.
2. Describe the product and intended user task.
3. Summon ghost users.
4. Watch ghosts react with text, voice, and visual avatar states.
5. See exactly where each ghost gets confused or rage-quits.
6. Receive concrete fixes.
7. Generate better copy, layout suggestions, annotated screenshots, or a Codex patch.
8. Share a report.

### 1.5 What iGhost Is Not

iGhost is not:
- a dashboard;
- an analytics tool;
- a heatmap product;
- a replacement for real user testing;
- a generic "review my website" chatbot;
- a sponsor-track recommender;
- a team workspace.

### 1.6 Product Promise

iGhost does not claim to perfectly predict real user behavior. It claims to catch obvious clarity, trust, UX, and positioning issues before real users waste their time on them.

---

## 2. OpenAI-Only Constraint

### 2.1 Required Constraint

The product must use only OpenAI models and OpenAI-adjacent tooling for AI functionality.

No Gemini, Fal, ElevenLabs, Anthropic, Groq, Mistral, Perplexity, Replicate, Runway, or non-OpenAI generative AI should be used.

### 2.2 Allowed OpenAI Capabilities

The implementation may use:
- GPT-5.5 or the strongest available OpenAI reasoning/chat model for product understanding and ghost simulation;
- OpenAI vision-capable models for screenshot analysis;
- OpenAI text-to-speech / voice models for narration;
- OpenAI image generation/editing models for annotated screenshots and ghost avatar generation;
- Codex for patch generation and code edits;
- OpenAI embeddings if needed for report search or retrieval, though this is optional;
- OpenAI structured outputs / JSON schema mode for deterministic result formatting.

### 2.3 Success Criteria

The project satisfies the OpenAI-only constraint if:
- all generative AI outputs come from OpenAI;
- voice narration comes from OpenAI voice models;
- image annotations or generated visuals come from OpenAI image models;
- code patch generation comes from Codex or OpenAI code-capable tooling;
- the project pitch can credibly say: "The AI layer is entirely OpenAI-powered."

---

## 3. Core Product Requirements

The product must include the following features:

1. Multiple screenshots as a flow.
2. Voice narration.
3. Animated ghost avatars.
4. Codex patch generation.
5. Shareable report.
6. Before/after rewrite.
7. Generated annotated screenshot.
8. Rage-quit replay.

Sponsor-specific testing modes and team workspace/history are intentionally excluded.

---

## 4. User Journey

### 4.1 First-Time User Journey

#### Step 1: Landing Page

The user lands on iGhost and sees:
- product name;
- strong tagline;
- explanation of the ghost testing concept;
- primary CTA: "Run a ghost test";
- secondary CTA: "Try with example flow."

#### Step 2: Create Test

The user enters:
- product name;
- product description;
- target user;
- intended task;
- screenshots of the flow;
- optional codebase/repository context for Codex patch generation.

#### Step 3: Configure Ghosts

The system suggests default ghosts:
- Impatient first-time user;
- confused non-technical user;
- skeptical technical user.

The user may optionally:
- regenerate ghost cast;
- edit ghost names/archetypes;
- choose number of ghosts, default 3.

#### Step 4: Summon Ghosts

The user clicks "Summon ghosts."

The system:
- analyzes the screenshots;
- understands the flow;
- generates or finalizes ghost personas;
- simulates each ghost attempting the task;
- identifies rage-quit points;
- generates feedback and fixes;
- produces voice clips;
- creates annotated screenshot;
- prepares replay and shareable report.

#### Step 5: Watch Live Haunting

The user sees a staged playback:
- ghost avatars appear;
- each ghost narrates what they notice;
- current screenshot is highlighted;
- confusion markers appear;
- patience meter drops;
- ghost either continues or rage-quits;
- rage-quit replay is generated if applicable.

#### Step 6: Review Fixes

The user receives:
- top friction points;
- before/after copy;
- layout suggestions;
- annotated screenshots;
- Codex patch suggestion;
- shareable report link.

#### Step 7: Apply or Export

The user can:
- copy rewritten copy;
- download or share report;
- download annotated screenshot;
- copy patch;
- view patch diff;
- re-run test after changes.

### 4.2 Success Criteria

The first-time journey is successful if:
- a user can run a complete test without documentation;
- total manual input is minimal;
- the output feels specific to their product, not generic;
- voice, avatars, rage-quit replay, and annotated screenshot are integrated into the experience;
- the user leaves with at least three concrete improvements they can apply immediately.

---

## 5. Information Architecture

### 5.1 Routes

Recommended routes:

```txt
/
  Landing page

/new
  Create new ghost test

/test/:testId
  Live test session and results

/report/:reportId
  Public shareable report

/examples
  Preloaded demo examples

/api/*
  Backend endpoints
```

### 5.2 Main Pages

#### Landing Page

Purpose:
- explain iGhost quickly;
- show a short visual demo;
- drive user to create a test.

Required sections:
- Hero;
- "How it works";
- example ghost reaction;
- feature list;
- CTA.

Success criteria:
- user understands product in under 10 seconds;
- CTA is visible above the fold;
- page does not look like a dashboard.

#### Create Test Page

Purpose:
- collect required inputs.

Required components:
- product name input;
- product description textarea;
- target user input;
- intended task input;
- screenshot uploader;
- screenshot ordering interface;
- optional code/context upload area;
- ghost cast preview;
- summon button.

Success criteria:
- user can upload at least 2 screenshots and reorder them;
- user can run test with only product description, task, and one screenshot;
- validation catches missing required fields.

#### Test Session Page

Purpose:
- display the live haunting and results.

Required components:
- current screenshot viewer;
- ghost avatar panel;
- voice playback controls;
- ghost dialogue;
- patience meter;
- rage-quit indicator;
- timeline/replay controls;
- friction list;
- fixes panel;
- annotated screenshot viewer;
- Codex patch viewer;
- share report button.

Success criteria:
- user can watch the ghost feedback sequentially;
- user can jump to each screenshot or rage-quit point;
- all results are usable without refreshing.

#### Shareable Report Page

Purpose:
- provide a clean public artifact.

Required sections:
- product/test summary;
- screenshots tested;
- ghost cast;
- key findings;
- rage-quit replay summary;
- annotated screenshot;
- before/after rewrites;
- layout suggestions;
- Codex patch summary;
- disclaimer about synthetic testing.

Success criteria:
- report opens without authentication if sharing is enabled;
- report excludes private code unless explicitly included;
- report is visually polished and easy to skim.

---

## 6. Data Model

### 6.1 Test

```ts
type Test = {
  id: string;
  productName: string;
  productDescription: string;
  targetUser?: string;
  intendedTask: string;
  status:
    | "draft"
    | "analyzing"
    | "generating_ghosts"
    | "simulating"
    | "generating_assets"
    | "complete"
    | "failed";
  createdAt: string;
  updatedAt: string;
  screenshotIds: string[];
  ghostIds: string[];
  reportId?: string;
};
```

### 6.2 Screenshot

```ts
type Screenshot = {
  id: string;
  testId: string;
  url: string;
  order: number;
  label?: string;
  description?: string;
  width?: number;
  height?: number;
};
```

### 6.3 ProductUnderstanding

```ts
type ProductUnderstanding = {
  testId: string;
  inferredProductType: string;
  inferredPrimaryUser: string;
  inferredUserGoal: string;
  primaryCTA?: string;
  keyUIElements: {
    screenshotId: string;
    elements: string[];
  }[];
  flowSummary: string;
  uncertaintyNotes: string[];
};
```

### 6.4 Ghost

```ts
type Ghost = {
  id: string;
  testId: string;
  name: string;
  archetype: string;
  goal: string;
  context: string;
  technicalLevel: "low" | "medium" | "high";
  patienceInitial: number;
  skepticism: number;
  caresAbout: string[];
  hates: string[];
  avatarImageUrl?: string;
  avatarState?: "neutral" | "curious" | "confused" | "annoyed" | "rage_quit";
};
```

### 6.5 GhostReaction

```ts
type GhostReaction = {
  id: string;
  testId: string;
  ghostId: string;
  screenshotId: string;
  stepOrder: number;
  noticedFirst: string;
  interpretation: string;
  confusion: string[];
  trustIssues: string[];
  expectedNextAction: string;
  actualLikelyAction: string;
  quote: string;
  patienceBefore: number;
  patienceAfter: number;
  emotion:
    | "curious"
    | "neutral"
    | "confused"
    | "skeptical"
    | "annoyed"
    | "rage_quit";
  wouldContinue: boolean;
  audioUrl?: string;
};
```

### 6.6 RageQuitEvent

```ts
type RageQuitEvent = {
  id: string;
  testId: string;
  ghostId: string;
  screenshotId: string;
  stepOrder: number;
  reason: string;
  exactTrigger: string;
  userThought: string;
  severity: "medium" | "high" | "critical";
  replayNarration: string;
  audioUrl?: string;
};
```

### 6.7 FrictionPoint

```ts
type FrictionPoint = {
  id: string;
  testId: string;
  title: string;
  description: string;
  evidence: string;
  affectedGhostIds: string[];
  affectedScreenshotIds: string[];
  severity: "low" | "medium" | "high" | "critical";
  recommendedFix: string;
};
```

### 6.8 RewriteSuggestion

```ts
type RewriteSuggestion = {
  id: string;
  testId: string;
  type: "headline" | "subheadline" | "cta" | "body_copy" | "error_message" | "onboarding_copy";
  before: string;
  after: string;
  rationale: string;
  affectedFrictionPointIds: string[];
};
```

### 6.9 LayoutSuggestion

```ts
type LayoutSuggestion = {
  id: string;
  testId: string;
  screenshotId: string;
  issue: string;
  suggestion: string;
  rationale: string;
  priority: "low" | "medium" | "high";
};
```

### 6.10 AnnotatedScreenshot

```ts
type AnnotatedScreenshot = {
  id: string;
  testId: string;
  screenshotId: string;
  imageUrl: string;
  annotations: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    severity: "low" | "medium" | "high" | "critical";
    explanation: string;
  }[];
};
```

### 6.11 CodexPatch

```ts
type CodexPatch = {
  id: string;
  testId: string;
  status: "not_requested" | "generating" | "ready" | "failed";
  summary: string;
  filesChanged: {
    path: string;
    changeSummary: string;
    diff: string;
  }[];
  instructions: string;
  safetyNotes: string[];
};
```

### 6.12 Report

```ts
type Report = {
  id: string;
  testId: string;
  publicSlug: string;
  isPublic: boolean;
  title: string;
  summary: string;
  createdAt: string;
};
```

---

## 7. Feature Specifications

---

# Feature 1: Multiple Screenshots as a Flow

## 7.1 Purpose

Allow users to upload multiple screenshots representing a product journey, so ghosts can evaluate not just one screen but the logic and continuity of the entire flow.

## 7.2 Requirements

### Functional Requirements

The system must:
- support uploading multiple screenshots;
- allow drag-and-drop reordering;
- allow optional labels per screenshot;
- preserve screenshot order during analysis;
- analyze each screenshot individually and as part of the overall flow;
- reference specific screenshots in ghost reactions and fixes.

### Input Requirements

Each screenshot should have:
- image file;
- order index;
- optional label, such as "Landing Page", "Signup", "Onboarding Step 1", "Dashboard Empty State";
- optional user note.

### Output Requirements

The system should produce:
- flow summary;
- per-screen findings;
- cross-screen continuity findings;
- rage-quit point tied to a specific screenshot and step;
- annotated screenshot for at least one high-priority screen.

## 7.3 UI Requirements

The screenshot uploader must:
- show thumbnails;
- support reordering;
- show step numbers;
- support deletion;
- show upload state;
- warn if images are too small or unreadable.

## 7.4 AI Requirements

The OpenAI vision model must:
- inspect each screenshot;
- identify visible UI elements;
- infer likely user intent;
- detect confusing copy or visual hierarchy;
- compare whether each step logically follows the previous one.

## 7.5 Success Criteria

This feature is successful if:
- users can upload at least 5 screenshots in one test;
- the analysis correctly references screenshots by step;
- at least 80% of generated feedback is tied to a specific screen or flow transition;
- the rage-quit replay identifies the exact step where a ghost gives up;
- the report includes the tested flow in order.

---

# Feature 2: Voice Narration

## 8.1 Purpose

Make ghost feedback feel alive and emotionally memorable by generating voice narration for each ghost's key reactions and rage-quit moments.

## 8.2 Requirements

### Functional Requirements

The system must:
- generate voice narration for each ghost;
- use only OpenAI voice models;
- allow playback for each ghost reaction;
- allow mute/skip;
- generate a special rage-quit narration if a ghost gives up;
- cache generated audio.

### Voice Personality Requirements

Each ghost should have a distinct vocal style, for example:
- impatient user: faster, sharper;
- confused beginner: hesitant, unsure;
- skeptical engineer: dry, precise.

The voice should not caricature protected classes or rely on demographic stereotypes.

### Audio Content Requirements

Voice narration should include:
- first impression;
- confusion point;
- would-continue/would-leave decision;
- rage-quit reason if applicable.

### UI Requirements

Each ghost card must include:
- play/pause button;
- audio progress indicator;
- transcript text;
- replay button.

## 8.3 OpenAI Requirements

Use OpenAI text-to-speech / voice model to synthesize narration from generated ghost reaction text.

## 8.4 Success Criteria

Voice narration is successful if:
- each ghost has at least one generated audio clip;
- rage-quit events have distinct audio narration;
- audio playback starts within an acceptable delay after generation;
- transcript and audio content match;
- the product is fully usable with audio muted.

---

# Feature 3: Animated Ghost Avatars

## 9.1 Purpose

Give each ghost a visual identity and emotional state, making the test feel like a live session rather than a static report.

## 9.2 Requirements

### Functional Requirements

The system must:
- generate or assign a ghost avatar for each persona;
- animate avatar states during the replay;
- update avatar expression or visual state based on emotion;
- show visual change when patience drops;
- show a distinctive rage-quit state.

### Avatar Generation Requirements

Avatars may be:
- generated using an OpenAI image model;
- procedurally rendered with CSS/SVG based on ghost data;
- a combination of generated base image plus UI animation.

Given time constraints, a good MVP approach is:
- use CSS/SVG animated ghost avatars;
- optionally use OpenAI image generation for unique ghost portraits.

### Avatar States

Each ghost should support:
- neutral;
- curious;
- confused;
- skeptical;
- annoyed;
- rage-quit.

### Animation Examples

Possible animations:
- floating motion;
- opacity pulse;
- color/outline intensity shift;
- shake on confusion;
- fade-out on rage-quit;
- eyes narrowing on skepticism;
- glitch effect when patience drops.

## 9.3 Success Criteria

Animated avatars are successful if:
- each ghost has a distinct visual identity;
- avatar state changes correspond to reaction emotion;
- rage-quit has a memorable visual moment;
- animations are smooth and do not distract from content;
- implementation does not require non-OpenAI AI providers.

---

# Feature 4: Codex Patch Generation

## 10.1 Purpose

Allow users to turn iGhost feedback into implementable code changes.

## 10.2 Requirements

### Functional Requirements

The system must:
- identify which feedback items can be converted into code/copy changes;
- generate patch suggestions using Codex;
- show a diff-like output;
- summarize changed files;
- provide implementation instructions;
- warn when code context is insufficient.

### Input Options

The user may provide:
- pasted code;
- uploaded files;
- GitHub repository link;
- component snippets;
- framework selection;
- no code, in which case iGhost generates a pseudo-patch or implementation instructions.

### Patch Types

Codex should be able to generate:
- hero copy changes;
- CTA changes;
- component layout changes;
- onboarding copy changes;
- empty-state improvements;
- accessibility improvements;
- visual hierarchy improvements.

### Non-Goals

The system does not need to:
- automatically commit to GitHub;
- open a pull request;
- run tests;
- deploy code;
- modify private repositories without explicit user action.

### Patch UI

The patch viewer must show:
- summary;
- files changed;
- diff;
- copy button;
- "apply manually" instructions;
- warning if patch is approximate.

## 10.3 Codex Prompt Requirements

Codex prompt should include:
- original UX issue;
- recommended fix;
- relevant code context;
- framework/library assumptions;
- requirement to minimize changes;
- requirement to preserve existing behavior;
- requirement to produce readable diff.

## 10.4 Success Criteria

Codex patch generation is successful if:
- at least one actionable patch can be generated for a provided React/Next.js component;
- patch clearly maps to a friction point;
- diff is human-readable;
- patch does not invent unrelated architecture;
- patch includes manual application instructions;
- no code is modified without user review.

---

# Feature 5: Shareable Report

## 11.1 Purpose

Give users a polished artifact they can send to teammates, judges, or collaborators.

## 11.2 Requirements

### Functional Requirements

The system must:
- generate a report after each completed test;
- allow user to create a public share link;
- allow user to copy report URL;
- include all major findings and assets;
- hide private code by default;
- include a clear synthetic testing disclaimer.

### Report Sections

The report must include:
1. Test summary.
2. Product description and intended task.
3. Screenshots tested.
4. Ghost cast.
5. Key ghost reactions.
6. Rage-quit replay summary.
7. Top friction points.
8. Before/after rewrites.
9. Layout suggestions.
10. Annotated screenshot.
11. Codex patch summary, if user includes it.
12. Synthetic testing disclaimer.

### Report Tone

The report should be:
- concise;
- visual;
- easy to skim;
- specific;
- professional enough to share.

## 11.3 Privacy Requirements

The report must:
- not expose uploaded code unless user explicitly includes it;
- not expose API keys or secrets;
- have public/private toggle;
- make it clear when report is publicly accessible.

## 11.4 Success Criteria

The shareable report is successful if:
- it can be opened in a new browser without app state;
- it contains enough context to understand the test;
- findings are tied to screenshots and ghosts;
- sensitive code is excluded by default;
- user can copy a report link in one click.

---

# Feature 6: Before/After Rewrite

## 12.1 Purpose

Translate ghost feedback into immediately usable copy improvements.

## 12.2 Requirements

### Functional Requirements

The system must:
- identify weak or confusing copy from screenshots and product description;
- generate improved copy;
- present before/after pairs;
- explain why the new copy is better;
- support multiple copy types.

### Supported Copy Types

The system should support:
- headline;
- subheadline;
- CTA;
- onboarding text;
- empty state;
- error message;
- pricing explanation;
- product description;
- demo script line.

### Rewrite Principles

Generated copy should be:
- clearer;
- more specific;
- less jargon-heavy;
- more outcome-oriented;
- aligned with intended user task;
- not misleading.

### UI Requirements

Each rewrite card must show:
- original copy;
- improved copy;
- rationale;
- affected ghost(s);
- copy button.

## 12.3 Success Criteria

Before/after rewrite is successful if:
- at least 3 rewrite suggestions are generated when enough text exists;
- each rewrite maps to a friction point;
- user can copy improved text easily;
- generated copy is specific to the product;
- model does not invent unsupported product claims.

---

# Feature 7: Generated Annotated Screenshot

## 13.1 Purpose

Create a visual artifact that shows exactly where the product screen causes confusion.

## 13.2 Requirements

### Functional Requirements

The system must:
- choose the most problematic screenshot or allow user to choose;
- generate annotations for key friction points;
- display annotations over the screenshot;
- allow export/download or inclusion in report.

### Annotation Types

Annotations may include:
- unclear headline;
- weak CTA;
- overloaded section;
- missing trust signal;
- confusing visual hierarchy;
- sign-up too early;
- missing next step;
- unclear AI value;
- accessibility concern.

### Implementation Options

Preferred MVP implementation:
- programmatically overlay annotation boxes and labels using canvas/SVG/HTML based on model-generated coordinates.

Optional advanced implementation:
- use an OpenAI image editing model to generate a visually annotated image.

Programmatic overlay is more deterministic and safer.

### AI Requirements

The OpenAI model should output:
- target screenshot ID;
- annotation label;
- explanation;
- approximate bounding box coordinates;
- severity.

## 13.3 Success Criteria

Annotated screenshot is successful if:
- at least one screenshot receives visible annotations;
- annotations correspond to actual visible UI regions;
- labels are readable;
- annotated image appears in report;
- user can understand major issues without reading the full text.

---

# Feature 8: Rage-Quit Replay

## 14.1 Purpose

Show exactly how and why a ghost stops using the product.

This is the emotional centerpiece of iGhost.

## 14.2 Requirements

### Functional Requirements

The system must:
- simulate each ghost's patience across the flow;
- decrease patience based on friction;
- identify if and when the ghost rage-quits;
- generate a replay timeline;
- narrate the rage-quit moment;
- show screenshot, trigger, thought, and consequence.

### Rage-Quit Logic

A ghost rage-quits if:
- patience drops below a threshold;
- the ghost cannot complete the intended task;
- the ghost loses trust;
- the next action is unclear;
- the product asks for commitment before proving value;
- the ghost finds the product irrelevant.

### Replay UI

The replay should show:
- timeline steps;
- current screenshot;
- ghost avatar state;
- patience meter changes;
- ghost thought bubble;
- trigger highlight;
- final rage-quit quote;
- voice narration.

### Example

```txt
Step 1: Landing page
Patience: 72 → 49
Trigger: vague headline

Step 2: Signup screen
Patience: 49 → 18
Trigger: account required before value shown

Rage quit:
"I still do not know what this does, and now you want my email. I'm out."
```

## 14.3 Success Criteria

Rage-quit replay is successful if:
- at least one replay is generated when a ghost fails the task;
- replay clearly identifies the trigger;
- replay uses screenshot-specific evidence;
- patience meter changes feel plausible;
- rage-quit moment is memorable in demo.

---

## 15. AI Pipeline

### 15.1 Pipeline Overview

```txt
Input collection
  ↓
Screenshot preprocessing
  ↓
Product understanding
  ↓
Ghost generation
  ↓
Flow simulation
  ↓
Rage-quit detection
  ↓
Friction extraction
  ↓
Fix generation
  ↓
Before/after rewrite
  ↓
Annotated screenshot generation
  ↓
Voice generation
  ↓
Codex patch generation
  ↓
Report generation
```

### 15.2 Product Understanding

The model should produce:
- inferred product type;
- intended user;
- intended action;
- visible UI elements;
- screen-by-screen summary;
- flow-level summary;
- uncertainty notes.

### 15.3 Ghost Generation

The model should generate 3 ghosts by default.

Default ghosts:
1. Impatient first-time user.
2. Confused non-technical user.
3. Skeptical technical user.

Each ghost must have:
- name;
- archetype;
- goal;
- context;
- patience;
- skepticism;
- technical level;
- cares about;
- hates.

### 15.4 Ghost Simulation

For each ghost and each screenshot:
- interpret screen;
- identify first noticed element;
- infer next action;
- identify confusion;
- update patience;
- decide continue or quit.

### 15.5 Friction Extraction

The system should consolidate repeated issues across ghosts.

Each friction point must include:
- title;
- description;
- evidence;
- severity;
- affected ghosts;
- affected screenshots;
- recommended fix.

### 15.6 Fix Generation

The model should generate:
- copy rewrites;
- layout suggestions;
- annotated screenshot data;
- Codex patch prompt;
- report summary.

---

## 16. Prompt Specifications

### 16.1 System Prompt: iGhost Core

```txt
You are iGhost, an AI usability testing system.

You simulate realistic users attempting a specific task on a product flow.

You must:
- stay grounded in the provided screenshots and product description;
- avoid generic UX advice;
- identify what users would notice, misunderstand, trust, distrust, click, or avoid;
- produce specific feedback tied to screenshots;
- simulate different ghosts with different goals and constraints;
- treat outputs as hypotheses, not factual predictions;
- avoid demographic stereotyping;
- give concrete fixes;
- never claim to replace real user testing.

You must output valid structured JSON matching the provided schema.
```

### 16.2 Product Understanding Prompt

```txt
Analyze the provided product screenshots as an ordered flow.

Inputs:
- Product name
- Product description
- Target user
- Intended user task
- Ordered screenshots

Return:
- inferred product type
- inferred target user
- inferred task
- summary of each screenshot
- visible UI elements on each screenshot
- likely primary CTA on each screenshot
- potential uncertainty
- flow-level summary
```

### 16.3 Ghost Generation Prompt

```txt
Generate three ghost users for this product test.

Requirements:
- Each ghost must have a distinct goal, context, and failure mode.
- Ghosts should be based on behavioral constraints, not protected demographic stereotypes.
- Include one impatient first-time user.
- Include one confused non-technical user.
- Include one skeptical technical user.
- Each ghost must have a patience score from 0 to 100 and skepticism score from 0 to 100.
```

### 16.4 Ghost Simulation Prompt

```txt
Simulate this ghost moving through the product flow.

For each screenshot:
1. What does the ghost notice first?
2. What does the ghost think the product wants them to do?
3. What confuses or reassures them?
4. What would they try next?
5. How does their patience change?
6. Do they continue or quit?

If the ghost quits, identify:
- exact screenshot;
- exact trigger;
- reason;
- final quote;
- what would have prevented the quit.

Keep feedback specific and grounded in the screen.
```

### 16.5 Rewrite Prompt

```txt
Generate before/after copy rewrites based on the friction points.

For each rewrite:
- identify the original copy if visible or infer the weak copy from context;
- provide improved copy;
- explain why it is better;
- tie it to a ghost reaction;
- do not invent unsupported product capabilities.
```

### 16.6 Layout Suggestion Prompt

```txt
Generate layout suggestions based on the ghost failures.

For each suggestion:
- identify screenshot;
- identify UI region;
- explain the issue;
- propose a concrete layout improvement;
- explain which ghost this helps and why.
```

### 16.7 Annotation Prompt

```txt
Generate screenshot annotations for the highest-priority screen.

Return:
- screenshot ID;
- annotation label;
- explanation;
- severity;
- approximate bounding box coordinates from 0 to 1 for x, y, width, height.

Coordinates must refer to visible regions in the screenshot.
```

### 16.8 Voice Prompt

Voice narration should be generated from short, polished ghost quotes.

Rules:
- do not narrate the entire report;
- narrate the most emotionally useful moments;
- keep clips under 15 seconds where possible;
- match persona tone without stereotyping.

### 16.9 Codex Patch Prompt

```txt
You are Codex helping implement UX fixes from an iGhost usability test.

Inputs:
- Product context
- Friction points
- Rewrite suggestions
- Layout suggestions
- Code context

Task:
Generate a minimal patch that addresses the highest-priority issues.

Rules:
- preserve existing app behavior;
- make minimal changes;
- do not invent unrelated features;
- keep code idiomatic;
- explain each file change;
- output a diff where possible;
- if code context is insufficient, provide implementation instructions instead of pretending to know the codebase.
```

---

## 17. User Interface Requirements

### 17.1 Visual Identity

The visual style should be:
- clean;
- slightly spooky;
- playful but credible;
- product-focused;
- not Halloween-themed to the point of gimmick.

### 17.2 Required UI Components

#### Ghost Card

Displays:
- avatar;
- name;
- archetype;
- goal;
- current emotion;
- patience meter;
- quote;
- voice playback.

#### Screenshot Flow Viewer

Displays:
- ordered screenshots;
- current step;
- annotations;
- rage-quit highlight;
- navigation.

#### Friction Panel

Displays:
- top issues;
- severity;
- affected ghosts;
- affected screenshots;
- recommended fix.

#### Rewrite Panel

Displays:
- before;
- after;
- rationale;
- copy button.

#### Layout Panel

Displays:
- layout issue;
- suggestion;
- priority;
- affected screen.

#### Patch Panel

Displays:
- patch summary;
- changed files;
- diff;
- copy button;
- warning notes.

#### Report Button

Allows:
- generate share link;
- copy link;
- toggle public/private.

---

## 18. Backend Requirements

### 18.1 API Endpoints

Recommended endpoints:

```txt
POST /api/tests
Create test

POST /api/tests/:id/screenshots
Upload screenshots

POST /api/tests/:id/run
Start analysis

GET /api/tests/:id
Fetch test

POST /api/tests/:id/voice
Generate voice clips

POST /api/tests/:id/annotations
Generate annotated screenshot data/image

POST /api/tests/:id/patch
Generate Codex patch

POST /api/tests/:id/report
Generate shareable report

GET /api/reports/:slug
Fetch public report
```

### 18.2 Processing Requirements

The backend must:
- validate input;
- handle image upload;
- call OpenAI APIs;
- parse structured outputs;
- store intermediate results;
- recover gracefully from failed AI calls;
- allow partial results if non-core asset generation fails.

### 18.3 Error Handling

If voice generation fails:
- show transcript only;
- allow retry.

If annotated screenshot generation fails:
- show textual annotations;
- allow retry.

If Codex patch fails:
- show implementation instructions.

If ghost simulation fails:
- show error and retry option.

### 18.4 Success Criteria

Backend is successful if:
- one complete test can run end-to-end;
- failures in optional generation do not break the whole test;
- user can still get useful feedback if one model call fails;
- outputs are stored and reloadable.

---

## 19. Frontend Requirements

### 19.1 Recommended Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Framer Motion for animation
- Optional shadcn/ui components

### 19.2 State Requirements

The frontend must track:
- upload state;
- test creation state;
- analysis progress;
- current replay step;
- selected ghost;
- selected screenshot;
- audio playback state;
- report sharing state.

### 19.3 Responsiveness

The app should be optimized for desktop demo.

Mobile support is nice but not critical for the hackathon.

### 19.4 Success Criteria

Frontend is successful if:
- demo operator can complete a test smoothly;
- app does not require page reloads;
- animations support the story;
- ghost reactions are easy to understand at a glance;
- UI does not visually resemble an analytics dashboard.

---

## 20. Security and Privacy Requirements

### 20.1 User Uploads

The system must:
- handle uploaded images securely;
- avoid exposing uploads publicly unless report is shared;
- not include private code in public report by default.

### 20.2 API Keys

The system must:
- never expose OpenAI API keys client-side;
- use server-side API calls;
- keep environment variables private.

### 20.3 Code Context

If users provide code:
- warn before including it in public report;
- do not share code by default;
- do not execute code.

### 20.4 Success Criteria

Security is acceptable for hackathon MVP if:
- API keys are server-only;
- reports are private by default or clearly marked public;
- code is excluded from public report unless opted in;
- no uploaded secrets are printed into UI accidentally.

---

## 21. Accessibility Requirements

### 21.1 Required

The app must:
- be usable without audio;
- show transcripts for voice clips;
- use readable contrast;
- support keyboard navigation for main controls;
- include alt text or labels for generated visuals.

### 21.2 Success Criteria

Accessibility is successful if:
- all voice content has text equivalent;
- a user can complete test without listening;
- buttons and inputs are clearly labeled;
- ghost avatar animation is not necessary to understand results.

---

## 22. Performance Requirements

### 22.1 Expected Constraints

AI generation may be slow. The UI must manage waiting gracefully.

### 22.2 Required Behaviors

The app should:
- show progress states;
- reveal partial results as they complete;
- cache generated outputs;
- avoid regenerating expensive assets unnecessarily;
- limit uploaded image sizes.

### 22.3 Success Criteria

Performance is acceptable if:
- first visible result appears quickly after run starts;
- full result completes within a demo-tolerable timeframe;
- user sees progress rather than blank loading;
- repeated report loading is fast because results are cached.

---

## 23. Evaluation and Success Metrics

### 23.1 Product Success Metrics

For the hackathon, success means:
- judges understand the product in under 15 seconds;
- the demo produces a memorable ghost reaction;
- the product clearly requires OpenAI models;
- the output is specific and useful;
- the Codex patch connects feedback to implementation;
- voice and replay make the experience emotionally sticky.

### 23.2 Feature-Level Success Criteria

| Feature | Success Criteria |
|---|---|
| Multiple screenshots | Ghosts reference specific steps and transitions |
| Voice narration | Each ghost has playable OpenAI-generated narration |
| Animated avatars | Emotional states change during replay |
| Codex patch | At least one useful diff or implementation patch is generated |
| Shareable report | Report can be opened via public link |
| Before/after rewrite | Copy suggestions are specific and copyable |
| Annotated screenshot | Visual annotations correspond to real UI regions |
| Rage-quit replay | Replay shows exact trigger and reason for quitting |

### 23.3 Demo Success Criteria

The live demo is successful if:
- upload/input works;
- ghosts generate distinct reactions;
- one ghost rage-quits for a specific reason;
- voice narration plays;
- annotated screenshot is shown;
- before/after rewrite is shown;
- Codex patch is shown;
- shareable report link works.

---

## 24. Hackathon Build Plan

### Phase 1: App Shell

Build:
- landing page;
- create test page;
- upload flow;
- test session page;
- report page skeleton.

Success:
- user can create test and view empty session.

### Phase 2: Core AI Analysis

Build:
- OpenAI screenshot analysis;
- ghost generation;
- ghost simulation;
- structured JSON parsing.

Success:
- app produces ghost reactions from uploaded screenshots.

### Phase 3: Results UI

Build:
- ghost cards;
- patience meter;
- flow viewer;
- friction points;
- rewrite suggestions;
- layout suggestions.

Success:
- user can understand findings without reading raw JSON.

### Phase 4: Rage-Quit Replay

Build:
- replay timeline;
- patience changes;
- rage-quit event;
- avatar state transitions.

Success:
- at least one ghost can visibly rage-quit during replay.

### Phase 5: Voice

Build:
- generate TTS clips;
- playback controls;
- transcript matching.

Success:
- ghost reactions can be heard.

### Phase 6: Annotated Screenshot

Build:
- model-generated annotation data;
- overlay rendering;
- export/include in report.

Success:
- screenshot displays issue labels visually.

### Phase 7: Codex Patch

Build:
- code/context input;
- patch generation;
- diff viewer.

Success:
- patch maps to friction point and can be copied.

### Phase 8: Shareable Report

Build:
- report generation;
- public slug;
- report page;
- share button.

Success:
- report link opens independently.

### Phase 9: Polish and Demo Hardening

Build:
- example test;
- fallback states;
- loading animations;
- polished copy;
- final pitch flow.

Success:
- demo works even if one optional model call fails.

---

## 25. MVP Cutline

If time is limited, preserve these at all costs:

1. Screenshot flow upload.
2. Ghost simulation.
3. Rage-quit replay.
4. Before/after rewrite.
5. Codex patch.
6. Shareable report.

Voice, avatars, and annotated screenshots are highly valuable, but the product must still be useful if asset generation is slow.

However, because the intended product spec requires all nice-to-haves, the final target implementation should include all eight required features.

---

## 26. Demo Script

### Opening

"Every builder has had this moment: you show someone your product and realize they have no idea what it does. Real user testing takes time. iGhost lets you summon AI users before real users rage-quit."

### Input

"Here, I upload a product flow and tell iGhost what the user is supposed to do."

### Ghosts

"iGhost creates three synthetic users with different goals and patience levels."

### Replay

"Now we watch them move through the flow. This ghost notices the headline, gets confused by the CTA, and rage-quits when the product asks for sign-up before showing value."

### Fixes

"iGhost turns that into concrete changes: better copy, layout suggestions, an annotated screenshot, and a Codex patch."

### Close

"It does not replace real users. It catches obvious confusion before you waste real users' time."

---

## 27. Judge FAQ

### Q: Why is AI necessary?

AI is necessary because iGhost simulates task-driven users, interprets visual product flows, generates persona-specific reactions, detects likely failure points, produces voice narration, annotates screenshots, rewrites copy, and generates Codex patches. The product does not exist without multimodal reasoning and generation.

### Q: Why not just ask ChatGPT to review a landing page?

iGhost is structured around a task, a product flow, multiple ghost personas, patience simulation, rage-quit replay, visual annotation, voice narration, and implementation patches. It is a productized synthetic usability session, not a one-off prompt.

### Q: Are synthetic users reliable?

They are useful as hypotheses, not truth. iGhost is a pre-testing layer. It helps catch obvious friction before real user testing.

### Q: Does this replace real user research?

No. Real users are the source of truth. iGhost helps teams prepare before they spend time with real users.

### Q: What makes this different from a UX audit?

A UX audit is usually static and expert-driven. iGhost is task-driven, persona-based, multimodal, replayable, and tied to concrete implementation changes.

### Q: Why use OpenAI models?

OpenAI powers the full loop: multimodal product understanding, ghost simulation, voice narration, image/annotation generation, copy rewriting, and Codex patch generation.

### Q: What is the biggest risk?

The biggest risk is generic output. The product mitigates this by grounding every reaction in a specific screenshot, ghost goal, task, and flow step.

### Q: What is the long-term version?

The long-term version is an AI usability lab that can browse live products, compare synthetic predictions with real user sessions, and generate code patches for validated issues.

---

## 28. Anti-Generic Output Rules

Every generated finding must include:
- affected screenshot;
- affected ghost;
- task impact;
- concrete evidence;
- specific fix.

Reject or regenerate output if it says vague things like:
- "Improve clarity";
- "Make the design more user-friendly";
- "Add more details";
- "Improve UX";
- "Use better visuals."

Acceptable output:
- "On Screenshot 2, the CTA says 'Continue' but the ghost does not know whether this creates an account or starts a demo. Rename it to 'See demo without signing up' or add helper text below it."

---

## 29. Required Disclaimers

iGhost should display a short disclaimer in reports:

> iGhost uses AI-generated synthetic users to identify likely usability and clarity issues. These findings are hypotheses, not statistically representative user research. Validate important decisions with real users.

---

## 30. Final Implementation Definition of Done

The project is considered complete when:

1. A user can upload multiple screenshots.
2. A user can describe a product and intended task.
3. iGhost generates at least three ghost personas.
4. Each ghost reacts to the product flow.
5. Each ghost has a patience meter and emotional state.
6. At least one ghost can rage-quit.
7. Rage-quit replay shows the exact step and trigger.
8. Voice narration is generated using OpenAI voice.
9. Animated avatars respond to ghost emotions.
10. Before/after rewrites are generated.
11. Layout suggestions are generated.
12. Annotated screenshot is generated or rendered.
13. Codex patch is generated from at least one friction point.
14. A shareable report is created.
15. All AI capabilities use OpenAI models only.
16. The product remains usable even if voice/image/patch generation fails.
17. The demo can be completed end-to-end.

---

## 31. Recommended First Build Slice

Build this first:

1. `/new` page with product description, task, and screenshot upload.
2. OpenAI call that returns structured ghost reactions.
3. `/test/:id` page with ghost cards, patience meters, and friction points.
4. Rage-quit replay.
5. Before/after rewrite.
6. Shareable report.

Then add:
7. Voice narration.
8. Animated avatars.
9. Annotated screenshot.
10. Codex patch.

This order minimizes risk while preserving the full product vision.

---

## 32. Final Product North Star

The user should leave thinking:

> "This felt like watching future users struggle with my product, and now I know exactly what to fix."

That is the experience iGhost must deliver.
