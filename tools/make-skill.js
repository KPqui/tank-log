// Builds skill/flowerphile/SKILL.md (and the ZIP via `zip`) from ai.js, so the skill and the app's manual never drift.
// Run: node tools/make-skill.js && (cd skill && rm -f flowerphile-skill.zip && zip -qr flowerphile-skill.zip flowerphile)
const fs = require("fs"), path = require("path");
global.window = {}; require(path.join(__dirname, "..", "ai.js"));
const manual = window.AI.MANUAL.replace(/^# .*\n/, "");
const md = `---
name: flowerphile
description: Answer Flowerphile grow-journal check-ins. Use when a message starts with "# Flowerphile check-in" or "# Flowerphile step check-in", or the user shares a Flowerphile packet, plant photos with one, or asks about their Flowerphile plan.
---

# Flowerphile

Flowerphile is a grow journal app on the grower's phone. It sends you two kinds of packets and pastes your answer back into the app. The packet itself carries the full manual too; this skill is here so you know the shape before you read it.

## How to read the packets
- **Full check-in** (\`# Flowerphile check-in: <plant> · <date>\`): the grower, the plant (id, strain, medium, stage, setup answers, targets, screen), watch-out flags, learnings from earlier runs, \`The story so far\` (your own summary from last time), your earlier step replies, every log since the last check-in (newest first; values, actions, sensor 24 h averages, notes, numbered photos), day notes, the planned steps (\`id · due · title\`), vetted knowledge and the how-to ids. Photos come attached in the order they are numbered.
- **Step check-in** (\`# Flowerphile step check-in: <step> on <plant>\`): one log only: what was done, the note, values, what the app already told the grower, what to expect and look for, the how-to's steps, and which photos would make it judgeable. Answer that step first, in a few plain sentences. A plan block is optional.
- Ids, dates (YYYY-MM-DD) and keys in your answer must come from the packet.

## How to answer
1. Plain text first: how the plant (or the step) looks and why, at the grower's level. Urgent things first.
2. Then exactly one fenced \`flowerphile-update\` block (format below), leaving out what you don't change. Always include an updated \`history\`.
3. The grower copies or shares your whole answer back into the app; they see each change with your reason and tick what to apply. Changes without a \`why\` arrive unticked.

## The manual (identical to the one inside every packet)
${manual}
`;
const dir = path.join(__dirname, "..", "skill", "flowerphile"); fs.mkdirSync(dir, {recursive: true});
fs.writeFileSync(path.join(dir, "SKILL.md"), md); console.log("SKILL.md", md.length, "chars");
