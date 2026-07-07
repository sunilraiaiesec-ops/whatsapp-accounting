---
# ============================================================================
# BLANK TUTORIAL TEMPLATE — copy this file to create a new tutorial.
# See ../tutorials/README.md for the full field reference and workflow.
# Every field below is REQUIRED unless the comment says otherwise. This
# frontmatter block must validate against schema.json.
# ============================================================================

# Stable id, kebab-case. MUST equal the filename minus "NNN-" and ".md".
# Never rename this once published — it may already be linked from Guidde
# projects, YouTube descriptions, or the help center.
tutorial_id: your-tutorial-id-here

# Human title, shown as the H1 and as the help-center article title.
title: "Your Tutorial Title Here"

# One of: Customers, Suppliers, Sales & Invoicing, Payments, Receipts,
# Inventory, Reports, Ask Bantoo, Settings, Migration, Approvals, Billing,
# Purchasing, Banking.
# Keep this list small — add a new value only with a real justification.
feature_area: "Feature Area"

# Who this is for, in plain terms. Calibrates jargon level everywhere below.
audience: "e.g. New BantooBooks users"

# ONE sentence: what the user accomplishes by the end. Doubles as the
# opening line of the YouTube description.
goal: "What the user will be able to do after following this tutorial."

# What must already be true / set up before starting. Use one bullet per
# requirement. If there truly are none, still list "A BantooBooks account
# with access to <feature area>" so recorders know the minimum state.
prerequisites:
  - "Prerequisite one"
  - "Prerequisite two"

# Which demo org to record in. Use the canonical org unless you have a
# specific reason to use one of the other two seeded demo companies —
# if so, note why in guidde_recording_notes.
demo_company: "Central Distribution Cameroon SARL"

# The EXACT values to type/select on screen. Keys are free-form — use
# whatever field names the real form uses (see the app code). Values must
# be strings (even amounts/dates) so they can be typed verbatim. Pull
# realistic values consistent with the demo org's actual seeded data
# style — a real-sounding Cameroonian shop/customer name, a real supplier
# name from the seed list, a real catalog-style product name, XAF amounts
# in round distributor-scale figures. Do NOT invent generic placeholders
# like "Test Customer" or "Product A".
test_data:
  field_name_one: "value one"
  field_name_two: "value two"

# Numbered, precise actions. Quote REAL button/field labels from the app
# exactly as they render (check the component/translation file — don't
# paraphrase). One discrete action per step.
step_by_step_actions:
  - step: 1
    action: 'Click the "Exact Button Label" button on the Exact Page Name.'
  - step: 2
    action: "Fill in the exact field label with the test_data value."

# For each step, which page/panel is visible — written for a video editor
# who has never used the app and can't infer this from the action alone.
screen_to_show:
  - step: 1
    screen: "The Exact Page Name page, showing the list and the quick-add form."
  - step: 2
    screen: "The quick-add form, expanded."

# Friendly, plain-language narration, roughly 1:1 with the steps above.
# Assumes the viewer CAN see the screen (contrast with synthesia_script).
# Short sentences. Avoid jargon. Explain WHY a step matters where useful.
voiceover_script:
  - step: 1
    line: "Let's start by opening the Exact Page Name page."
  - step: 2
    line: "Now we'll fill in a few details. This helps BantooBooks keep track of..."

# What to visually emphasize/circle/zoom on at each step, for whoever adds
# call-outs in Guidde (or a similar tool) after the raw recording is done.
on_screen_highlights:
  - step: 1
    highlight: "Circle the exact button being clicked."
  - step: 2
    highlight: "Zoom in on the field being filled in."

# What the user should see/verify at the end — concrete and checkable.
expected_result: "Describe the observable end state, e.g. a count increasing, a new row appearing, a status changing."

# Punchy, <70 chars.
short_youtube_title: "Short Punchy Title Under 70 Characters"

# 2-4 sentences + a short bullet list of what's covered, written for
# discoverability (use words an SME owner would actually search).
youtube_description: |
  One or two sentences on what this video shows and why it matters for a
  small business owner. One more sentence on who it's for.

  What you'll learn:
  - Bullet one
  - Bullet two
  - Bullet three

# A short, self-contained written how-to (a few paragraphs) that could
# stand alone as a help-center article, independent of any video.
help_center_article: |
  ## Why this matters

  A short paragraph explaining the plain-language "why" behind this task.

  ## Steps

  A few paragraphs walking through the task in prose, referencing the same
  exact UI labels used in step_by_step_actions above.

  ## Tip

  Any optional tip, gotcha, or related feature worth mentioning.

# Practical notes for whoever records this in Guidde: browser zoom level,
# things to blur/avoid showing (other orgs in the switcher, real phone
# numbers, API keys, etc.), pacing tips, click-precision notes.
guidde_recording_notes: |
  Zoom level: 100%. Blur/avoid: <anything sensitive>. Pacing: <tips>.
  Click precision: <notes on any fiddly UI, e.g. collapsible sections>.

# A separate, tightly-timed narrator script for an AI avatar tool
# (Synthesia). Short sentences, natural pauses marked with "...". Target
# ~60-90 seconds spoken (~150-220 words). Must stand alone with NO
# visual-only references ("as you can see", "click here") since the
# Synthesia viewer may never see the matching screen recording.
synthesia_script: |
  Hi, I'm going to show you how to do this in BantooBooks...

  <narration written to work with NO visible screen>
---

# Your Tutorial Title Here

<!--
  The body below is optional prose/expansion of the frontmatter above —
  use it for anything that doesn't fit neatly into a YAML field, such as
  a longer explanation, a screenshot placeholder, or reviewer notes. The
  frontmatter is the machine-readable source of truth; the body is for
  human readers browsing the file directly on GitHub/Cursor.
-->

_Optional free-form body content goes here._
