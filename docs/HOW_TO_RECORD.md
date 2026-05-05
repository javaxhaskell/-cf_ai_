# How to record `docs/demo.gif`

The README links a 30-second demo at `docs/demo.gif`. Record it locally and
drop the file in this directory — no other code changes needed.

## What the demo should show

Three beats, ~10 seconds each:

1. **Type a research question.** Suggested: `Compare Postgres vs SQLite for an
   edge-deployed app`. The right-hand panel ticks through `plan → search →
   fetch → summarize → critique → synthesize` with live status. The chat
   surfaces a cited briefing with source cards.
2. **Click a citation card.** It opens the source in a new tab.
3. **Ask a follow-up that triggers semantic recall.** Suggested:
   `What about read-replicas at the edge specifically?` — the **Recalled
   memory** panel populates with the prior briefing at a similarity score
   above the threshold.

Optional bonus beat (if the GIF can fit it): click the 🎤 mic, speak a third
question, and let the agent transcribe it live.

## Recording

### macOS (built-in)

```bash
# Start recording the active window with QuickTime Player → File → New Screen
# Recording, OR press ⌘⇧5 and choose "Record Selected Portion"
# After saving the .mov, convert with:
ffmpeg -i recording.mov -vf "fps=12,scale=900:-1:flags=lanczos" -loop 0 docs/demo.gif
```

### Cross-platform (recommended)

[Kap](https://getkap.co) (free, macOS) or [Peek](https://github.com/phw/peek)
(Linux) export GIF directly with sane defaults. Target 900px wide, 12 fps,
under ~5 MB.

## File requirements

- Path: `docs/demo.gif`
- Width: ~900 px (so it renders cleanly in GitHub's README at native size)
- Length: ≤ 30 seconds
- Size: ≤ 5 MB (anything larger, GitHub may not inline-render)

## After dropping the file

```bash
git add docs/demo.gif
git commit -m "docs: 30s demo gif"
git push
```

The README's `docs/demo.gif` link will start rendering once the file exists.
