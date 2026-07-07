# Guidde Recording SOP (Standard Operating Procedure)

**Who this is for:** anyone recording a tutorial video, even with zero
coding background. You will copy-paste exactly **one** terminal command.
Everything else is clicking things in your web browser.

**What you're about to do, in one sentence:** you'll click Record in Guidde,
then run one command that makes the computer perform the tutorial's steps
on screen by itself (so you don't have to click through it live), then stop
Guidde and finish the video using two files this project already wrote for
you.

---

## Before you start: is this tutorial ready?

Open [`recording-queue.md`](./recording-queue.md) and find your tutorial's
row.

- If its **"Playwright script"** column shows a real file path (not
  **Missing**) → you're ready, keep reading.
- If it shows **Missing** → stop here. This tutorial doesn't have the
  automated "computer performs the steps" script yet, so this SOP can't
  drive it for you. (Someone technical needs to write that script first —
  it's tracked as a to-do, not something this SOP covers.) You could still
  record it fully by hand — click through the app yourself while Guidde
  records, using `generated/tutorials/<tutorial_id>/guidde.md` as your
  step-by-step script — but that's a different, manual process, not this
  one.

Also check the **Notes** column for that row — some tutorials need another
tutorial's data to already exist first (for example, you can't record
"Respond to a Low-Stock Reorder Suggestion" until an inventory item with
low stock actually exists — recording "Add an Inventory Item" first takes
care of that). If your tutorial's Notes mention a prerequisite, record that
prerequisite tutorial first, or confirm the demo org already has the data
it needs.

---

## Step-by-step

### 1. Open a terminal

- **On a Mac:** open the **Terminal** app (search for it with Spotlight —
  the magnifying glass icon, top-right of your screen — or find it in
  Applications → Utilities).
- **In Cursor:** use the built-in terminal panel (menu: Terminal → New
  Terminal, or it may already be open at the bottom of the window).

### 2. Go to the project folder

Copy-paste this, then press Enter (replace the path if your copy of the
project lives somewhere else):

```bash
cd /Users/kumarsunilrai/Projects/whatsapp-accounting
```

### 3. Tell the computer which BantooBooks to use

For a **real** recording (the one that actually gets published), copy-paste:

```bash
export BANTOO_BASE_URL=https://books.bantoobooks.com
```

(If someone asked you to practice/test this SOP first without it counting as
a real take, skip this step — it'll default to a local practice copy of the
app instead. Practicing first is a good idea if this is your first time.)

### 4. Open BantooBooks and Guidde, and start Guidde recording

1. In your regular web browser (not the one that's about to pop up — see
   the box below), open **https://books.bantoobooks.com** once, just so
   Guidde has something on screen while you set up. You don't need to log
   in — the next step logs in automatically in its own window.
2. Click the **Guidde** icon in your browser's toolbar (top-right, next to
   the address bar).
3. Click **Record**.

> ⚠️ **Important — record your Screen or a Window, not "This Tab."** In the
> next step, the recording script opens its **own brand-new browser
> window** to perform the tutorial — it does not use the tab you just had
> open. If Guidde offers a choice of what to capture (some recorders show a
> picker for "This Tab" / "Window" / "Entire Screen"), choose **Entire
> Screen** (safest — you won't need to hunt for the right window) or the
> specific new browser window once it appears. If you pick "This Tab," your
> recording will just show your own idle tab doing nothing while the real
> action happens in a different window.

### 5. Run the recording helper command

Back in your terminal, copy-paste this — **replace `create-a-customer` with
your tutorial's actual `tutorial_id`** from `recording-queue.md`:

```bash
npm run record:guidde -- create-a-customer
```

The command will:

1. Print a short reminder of what you're about to record.
2. Ask you to press **Enter** once you've already clicked Record in Guidde
   (step 4). Don't press Enter until Guidde is actually recording.
3. Open a new Chrome window by itself, log in to the demo account, and
   click/type through every step of the tutorial — smoothly, with a little
   pause after each action so it's easy to follow on video. **Don't touch
   your mouse or keyboard while this runs.**
4. When it finishes, print a reminder of what to do next (the same steps
   below).

This takes anywhere from about 30 seconds to a couple of minutes, depending
on the tutorial.

### 6. Stop the Guidde recording

Once the terminal shows the browser window closed and prints "done"/the
reminder message, switch back to Guidde and click **Stop**. Guidde will
process your recording into its own draft video — this happens inside
Guidde, outside of anything this project controls.

### 7. Review Guidde's draft

Watch it back once. If a step looks wrong (misclick, page didn't load in
time, something looked cut off), just re-run step 5 for a fresh take — it's
always safe to run again (the tutorial data used is designed to not create
messy duplicates).

### 8. Finish the video using the files this project already generated

You don't need to write anything from scratch. Two files are already
written for you — find them from `recording-queue.md`'s row for your
tutorial, or directly at:

- `generated/tutorials/<tutorial_id>/synthesia.md` — the **narration
  script**. Read this out loud (or paste it into Synthesia, or any
  text-to-speech tool) to add a voiceover — Guidde's draft has no audio of
  its own from this process.
- `generated/tutorials/<tutorial_id>/guidde.md` — the **annotation
  checklist**: exactly which parts of the screen to circle/box/zoom in on,
  in order. Use this while polishing the Guidde draft.
- `generated/tutorials/<tutorial_id>/youtube.md` — the **title,
  description, chapters, and hashtags** to paste in when you upload the
  finished video.

### 9. Mark it done

Open `tutorial-factory/checklists/<tutorial_id>.md` and check the box:

```
- [x] Guidde recorded
```

That's the one real, permanent record that this tutorial has actually been
recorded (`recording-queue.md` and `dashboard.md` are regenerated
automatically from this checkbox — don't hand-edit those two files
directly, since the next regeneration would overwrite anything you typed
there). If someone technical is around, ask them to run
`npm run build:tutorial-factory` afterward so the dashboard picks up your
checkmark; if not, it's fine to just leave the box ticked — it'll be picked
up whenever that's next run.

---

## Why this command doesn't also record a video itself

You might wonder why the command in step 5 doesn't produce its own video
file too, since it's already driving the browser. Two tools recording the
exact same screen at the exact same time would just waste time and disk
space for no benefit — Guidde's draft is the one you'll actually edit and
publish. (There's a separate, fully-automated pipeline —
`npm run record:video` — for the case where you want the computer's own
video instead of Guidde's; see [`RECORDING.md`](./RECORDING.md) if you're
curious, but that's a different tool for a different situation, not part of
this SOP.)

## If something goes wrong

- **The terminal shows an error and no browser window ever opened:** take a
  screenshot of the terminal and show it to someone technical — don't guess.
- **The browser opened but got stuck/errored partway through:** that's fine,
  it just means this particular take didn't work. Stop your Guidde
  recording (you can discard that draft), and try step 5 again — every
  tutorial script is safe to re-run.
- **You're not sure if a tutorial is ready to record at all:** check
  `recording-queue.md` first — that's always the source of truth for
  "which tutorials can this helper actually drive."
