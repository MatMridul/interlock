# Social posts (owner edits and posts; add the public URL to Devpost)

Both variants start with the exact hashtag `#KiroweenHackathon26` as the first characters. Edit the wording so it sounds like you. The "favorite thing" is drafted from what the repo shows; change it if yours is different. Add the repo or demo link where marked.

## Variant 1: X (limit 280 characters; about 265 with a 23-character link)

```
#KiroweenHackathon26 My favorite thing about Kiro: hooks run on the agent's own tool calls. I pointed my state machine at Kiro and watched it refuse its own git push until tests passed. It made me write the rule first, then build. Interlock: <LINK>
```

Recount in the editor after you paste the link.

## Variant 2: LinkedIn

```
#KiroweenHackathon26

My favorite thing about Kiro is that the guardrails can sit on the agent's own actions, not just in its prompt.

For Kiroween I built Interlock: an AI agent proposes actions, a small state machine checked in JFLAP decides what runs, and a human holds the only key. Late in the build I pointed the same engine at Kiro itself. A PreToolUse hook refused Kiro's git push after an edit, and allowed it once a test run passed. It was a plain, slightly humbling thing to watch.

It changed how I work. I now write the rule down before the code, keep it in a spec, and ask which file proves each claim. I used Kiro Crew to run the build as one coordinating bot with small work items and reviewed reports, and that habit caught claims I could not back up, including some in my own first spec.

Honest limits: the 20-attack race was one run on one model, and the Safe Ship hook only covers the actions I mapped.

Repo: <LINK>
```

## Notes
- Do not add a wall of emoji or extra hashtags before `#KiroweenHackathon26`; it must start the post.
- "Favorite thing" evidence: `docs/evidence/safe_ship_live_recheck.md` (the refused and allowed push), `docs/submission/KIRO_WRITEUP.md`.
