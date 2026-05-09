# iGhost 2-Minute Demo Script

## One-Line Pitch

iGhost is an OpenAI-powered usability lab that lets builders summon synthetic users to test a website, narrate what they see, and turn confusion into concrete fixes.

## Recording Plan

Use two parts:

- First 55 seconds: story, problem, and what iGhost does.
- Final 65 seconds: live product walkthrough.

Keep only two browser tabs ready:

- iGhost landing page.
- A generated iGhost result page with a playable MP4, advice, and Codex prompt already loaded.

## Script

### 0:00-0:10 - Hook

"Most product teams find out their landing page is confusing after real users bounce. That is slow, awkward, and expensive. I built iGhost so builders can catch that moment before real users ever see the product."

### 0:10-0:25 - What It Is

"iGhost is an AI usability lab. You give it a website, a task, and a user personality. Then it opens the site, behaves like that user, records a walkthrough, and narrates what the user is thinking while they move through the product."

### 0:25-0:40 - Why OpenAI Is Central

"The AI is not a garnish here. OpenAI models understand the page visually, decide what the ghost should try next, write the human-sounding thought process, generate the voiceover, and turn the session into actionable product fixes. Codex then becomes the handoff from insight to implementation."

### 0:40-0:55 - Judge-Friendly Summary

"The core loop is simple: summon a ghost, watch it struggle or succeed, get specific advice, and send the fix to Codex. The goal is not to replace real user testing. It is to catch obvious clarity, trust, pricing, and navigation problems before they waste real user attention."

### 0:55-1:05 - Start Product Demo

Show the iGhost landing page.

"Here is the product. I paste a URL, describe the job I want the ghost to do, and choose the type of user I want to emulate."

### 1:05-1:20 - Show Inputs

Use a prefilled or fast example:

- URL: `https://www.apple.com/sg/store`
- Task: `Find the student deal or education pricing section.`
- Ghost: Custom, Amanda
- Profile: `Amanda is a student at NUS. She likes great deals and checks student discounts before buying.`

"For this demo, Amanda is a student looking for deals. That personality matters because she is not just browsing randomly. She is specifically hunting for student savings."

### 1:20-1:38 - Show Generated Walkthrough

Open the existing result page instead of waiting for a fresh generation.

"Here is the generated walkthrough. iGhost records the ghost using the site, adds a highlighted cursor, and generates a voiceover from Amanda's perspective. You can see what she saw, what she clicked, and where the experience started to feel unclear."

Play a short 5-8 second clip.

### 1:38-1:52 - Show Advice

Scroll to actionable advice.

"Below the video, iGhost does not just dump a transcript. It turns the session into product advice. In this case, Amanda was looking for student deals, so the recommendation is to make education pricing more obvious and directly accessible."

### 1:52-2:00 - Show Codex Handoff

Scroll to the Codex patch box and click `Fix with Codex in GitHub`.

"Finally, iGhost turns the finding into a Codex-ready implementation request. That closes the loop: watch the user struggle, understand the fix, and hand it to Codex to implement in GitHub."

## What To Make Obvious To Judges

- One line: AI usability lab for product flows.
- Working path: URL in, ghost walkthrough MP4 out.
- AI depth: vision, ghost simulation, voice, advice, Codex handoff.
- Tightness: do not show settings, README, logs, or setup.
- Finished feel: show the playable video, advice cards, and Codex handoff.

## Backup If The Live Run Is Slow

Do not run a brand new test during the recording unless you are comfortable with the wait. Use the existing generated result page for the final minute. The criteria care that the core path works and is easy to judge, not that you burn recording time waiting for generation.

## Screen Recording Recommendation

Use Screen Studio if you are on Mac and want the cleanest demo quickly. It is built for polished product demos and supports webcam and microphone recording.

Use Loom if you want the fastest setup and easy camera plus screen capture.

Use OBS only if you need a free tool and are comfortable configuring scenes, camera, microphone, and screen capture manually.
