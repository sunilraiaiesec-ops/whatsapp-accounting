# BantooBooks Tutorial Generator

A deterministic, fully offline script that turns each tutorial in
[`tutorials/`](../tutorials/README.md) into a full set of derived
documentation/marketing assets under `generated/tutorials/<tutorial_id>/`.

It makes **no network calls and calls no AI/LLM API** — every output is
plain string/template logic applied to the frontmatter fields you already
wrote in `tutorials/*.md` (see `tutorials/schema.json`).

## Run it

From the repo root, using the npm scripts defined in the root
`package.json` (the easiest way — see `tutorials/README.md` for the
non-technical version of these instructions):

```bash
npm run generate:tutorials
npm run verify:tutorials
```

Or call the scripts directly with `node` (equivalent, works from any cwd
since paths are resolved relative to this file):

```bash
node generator/generate-tutorial-assets.js
node generator/verify.js
```

`generate-tutorial-assets.js` reads every `tutorials/NNN-slug.md` file and
writes (or overwrites) `generated/tutorials/<tutorial_id>/` for each one.
`verify.js` runs the self-checks (structural + JSON validity + determinism).

Both scripts are plain Node.js with **zero npm dependencies** — the root
`package.json` exists purely to give you short `npm run` commands; there is
nothing to `npm install` before running either one. It's also intentionally
separate from `ledger/package.json` and doesn't affect the Next.js app's
build/deploy setup in any way (see `## Why a root package.json` below).

## Why a root `package.json`

The repo previously had no `package.json` at the root — only
`ledger/package.json` for the Next.js app. The root `package.json` added
alongside this generator is a **minimal convenience wrapper**: just `name`,
`version`, `private: true`, and the two `scripts` entries above. No
`dependencies`, no `devDependencies`.

It's deliberately kept out of `ledger/`'s way:

- It doesn't touch, extend, or reference `ledger/package.json` in any way.
- Build/deploy tooling that assumes `ledger/` is its own project root (e.g.
  Vercel) is unaffected — this file has no build step, no `main` entry, and
  nothing about it makes npm/Vercel treat the repo root as a workspace root
  for `ledger/`.
- It has no dependencies to install, so it can't introduce a second
  `node_modules` tree or version-conflict with anything in `ledger/`.

## Why Node.js, and why a hand-rolled frontmatter parser

There is no `package.json` at the repo root, and this repo's only YAML
parser (`js-yaml`) lives inside `ledger/node_modules` as someone else's
transitive dependency — reaching into another package's `node_modules` is
fragile (it can disappear on `npm prune`, a lockfile bump, etc.), and adding
a brand-new root-level dependency felt heavier than this task needs.

Every `tutorials/*.md` file is hand-written to a small, consistent subset of
YAML — scalars, one level of block-scalar text, flat string maps, and
arrays of small `{step, field}` objects (see `tutorials/schema.json`). That
subset is simple enough to parse correctly in about 150 lines
(`generator/lib/frontmatter.js`), which is more transparent and easier to
audit than pulling in a general-purpose YAML engine for a handful of shapes.
**If the frontmatter grammar ever grows beyond what's handled there**
(nested arrays-of-arrays, anchors, multi-line inline scalars, etc.), the
right move is to add a root `package.json` and switch to `js-yaml` rather
than extending the hand-rolled parser further.

Node was chosen over Python because this is already a Node/Next.js
monorepo (`ledger/`) — Node is guaranteed to be installed for anyone working
in this repo, whereas relying on `pyyaml`/`jsonschema` being pip-installed
system-wide (as I used for one-off validation while writing the tutorials)
isn't something a fresh clone or CI runner can assume.

## What gets generated

For each tutorial, exactly 12 files are written to
`generated/tutorials/<tutorial_id>/`:

| File | Covers | Derived from |
|---|---|---|
| `help.md` | (3) Help Center article | `goal`, `audience`, `prerequisites`, `step_by_step_actions`, `test_data`, `demo_company`, `expected_result`, `help_center_article` |
| `faq.md` | (4) FAQ (5-9 Q&As, feature-area-aware selection) | `audience`+`goal`, `prerequisites`, `step_by_step_actions`, `expected_result`, `feature_area`+`screen_to_show`, `test_data` (+ language cues in the tutorial's own text), `tutorial_id`/`title`/`feature_area` (for the entity noun) — one named `faqFromX()` helper per question, see below |
| `youtube.md` | (5) title, (6) description, (7) chapters, hashtags | `short_youtube_title` (base for a deterministic title variant), `goal`+`youtube_description`+`audience`+`help_center_article`/`expected_result` (rich description), `step_by_step_actions`+`test_data` (short chapter titles + hashtags), `feature_area`/`title`/`demo_company` (hashtags) — see below |
| `shorts.md` | (8) 30-45s Shorts/Reels/TikTok script (Hook/Problem/Fast Solution/Result/CTA) | `feature_area` (Hook/Problem/Result via strategy maps), 2-3 essential actions from `step_by_step_actions` (short phrases), `title` (subject) |
| `linkedin.md` | (9) LinkedIn post | `feature_area` (pain-point hook/relate/solution/CTA via `LINKEDIN_STORY_BY_FEATURE_AREA`, `goal` paraphrased not quoted), `title` (brief tutorial mention) + 3-5 hashtags from `inferEntityNoun()`/`feature_area`/region/keywords |
| `facebook.md` | (10) Facebook post | `feature_area` (question hook/cost/solution/CTA via `FACEBOOK_STORY_BY_FEATURE_AREA`, `goal` paraphrased not quoted, emoji), `title` (brief tutorial mention) + 3-5 hashtags |
| `twitter.md` | (11) X post + 2 alternates | `short_youtube_title`/`title`/`expected_result` + `goal`, each trimmed to fit a 280-char budget; same hashtag derivation as LinkedIn |
| `email.md` | (12) Customer Success email (under 250 words, body-only) | `primaryActionWord()`+`seoNounPhrase()` (subject), `feature_area`+`help_center_article`'s intro (why it matters), `goal`/`expected_result` (benefit bullets), `canonicalUrl`+`relatedTutorials` from `seo.json` + a TODO video placeholder (3 links) |
| `synthesia.md` | (2) narration script | `synthesia_script`, split into scenes on paragraph breaks, each timed at ~150 wpm |
| `guidde.md` | (1) recording checklist | `guidde_recording_notes` (split into checklist items) + `step_by_step_actions` + `screen_to_show` + `on_screen_highlights`, one checklist section per step |
| `seo.json` | (13) meta title, (14) meta description, (15) JSON-LD, (16) keywords, plus Open Graph/Twitter Card, AI-search, rich-snippet, and related-tutorials blocks | see the dedicated "seo.json" subsection below |
| `metadata.json` | (17) thumbnail title, (18) CTA, + table of contents | `short_youtube_title`/`title` (thumbnail), `goal` (CTA), plus an index of the other files in this folder |

That's all 18 requested outputs, mapped onto 12 files (some files bundle
more than one numbered output, e.g. `youtube.md` covers title + description
+ chapters, and `seo.json` covers meta title + meta description + keywords +
JSON-LD).

> **Note on `metadata.json`'s table of contents:** the task description said
> `metadata.json` should list "the other 9 files," but there are 11 other
> generated files in each folder (the 10 other markdown files + `seo.json`).
> I implemented it as a complete index of all 11 sibling files rather than
> arbitrarily omitting some — a "table of contents" that's missing entries
> isn't very useful — and I'm flagging the discrepancy here rather than
> quietly picking a number. That list is generated from `ASSET_TYPES` (see
> "How to extend this" above), not hand-maintained, so it can't go stale.

### Derivation approach per output type (brief)

- **Guidde checklist**: `guidde_recording_notes` is a hand-written paragraph
  that always uses four labels — `Zoom level:`, `Blur/avoid:`, `Pacing:`,
  `Click precision:` — so the parser normalizes whitespace and splits right
  before each label to get one checklist item per topic. If a future
  tutorial doesn't use any of those labels, it falls back to splitting on
  sentence boundaries. Steps become one `### Step N` section combining that
  step's action, screen, and highlight.
- **Synthesia script**: split `synthesia_script` on blank lines into scenes;
  each scene's word count converts to an estimated duration at 150 words/
  minute (explicitly labeled as an estimate, cumulative timestamps shown).
  Note: the per-scene timestamps and the header's total-duration estimate are
  computed independently (per-scene word count vs. total word count, both at
  the same 150 wpm) rather than one being derived from the other — they'll
  normally agree to within a second or two due to rounding, but neither is
  guaranteed to be exactly consistent with the other to the second.
- **Help doc**: reassembles `goal` → `prerequisites` → numbered
  `step_by_step_actions` → a new "sample values used" section from
  `test_data` + `demo_company` → `expected_result` → the full
  `help_center_article`, minus its own internal "Steps" subsection (dropped
  by `stripStepsSection()` so it doesn't just repeat the numbered list above
  it in prose form) and with its remaining `##` headings demoted to `###` so
  they nest correctly under the wrapper's own headings.
- **FAQ**: `buildFaqQuestions()` assembles an ordered list of `{q, a}` pairs
  per tutorial from small named functions, each deriving one Q&A from real
  fields (see `generator/lib/builders.js` for the exact logic — the
  provenance comments live *there*, next to each function, not in the
  generated file). The **question set itself** is feature-area-aware, not
  just the phrasing — a Customers/Suppliers tutorial, a Sales & Invoicing
  tutorial, an Inventory tutorial, and a Receipts tutorial each end up with a
  visibly different mix of questions, via two small `feature_area ->` lookup
  maps rather than any per-`tutorial_id` special-casing (the same pattern as
  `FACEBOOK_STORY_BY_FEATURE_AREA`): adding a new feature area's own flavor
  of question later is a one-line addition to one of these maps, not a code
  change per tutorial.
  - Always render: `faqFromAudience()`, `faqFromPrerequisites()`,
    `faqFromGettingStarted()` (names just the first step's button/control
    label, not its full sentence, so it doesn't duplicate `help.md`'s
    numbered step 1 verbatim), and `faqFromFeatureArea()`.
  - The "what should I see / what happens" question is picked from
    `OUTCOME_BUILDER_BY_FEATURE_AREA`: `faqFromExpectedResult()` (a short,
    freshly-introduced first-sentence gist of `expected_result` — not the
    full field, which `help.md` already quotes verbatim) by default, or a
    feature-specific variant when mapped — `faqFromInvoiceLifecycle()` for
    Sales & Invoicing ("What happens after I save the invoice?", framed
    around the Unpaid → Paid lifecycle) or `faqFromReceiptSettlement()` for
    Receipts ("Does this automatically mark the invoice as paid?"). Each
    variant only fires on genuine textual evidence in that tutorial's own
    `expected_result`/`help_center_article` (e.g. an actual "Unpaid"
    mention) and falls back to the generic version otherwise.
  - `FEATURE_AREA_EXTRA_BUILDERS` layers on additional, feature-specific
    questions: `faqFromStockStartsAtZero()` for Inventory ("Does adding this
    item put stock in my inventory right away?", gated on the tutorial's own
    "0 units" fact) and `faqFromMoneyDirectionTerminology()` for Receipts/
    Payments ("What's the difference between a receipt and a payment?",
    gated on the tutorial's own text actually drawing that money-in/
    money-out distinction; names the real action button from
    `step_by_step_actions[0]` rather than hardcoding one).
  - Generic conditionals render for any feature area when there's genuine,
    grounded content to answer with:
    - `faqFromDuplicateHandling()` — only when some `step_by_step_actions`
      entry's `action` mentions "existing" or "duplicate" (true for the
      contact-creation tutorials, not e.g. inventory items or invoices). The
      question names the specific entity ("duplicate customer", "duplicate
      supplier", ...) via `inferEntityNoun()`; the answer names the two
      action buttons rather than quoting the step's full sentence verbatim.
    - `faqFromRequiredFields()` — sorts `test_data` into required / optional
      / auto-defaulted buckets by scanning `step_by_step_actions` and
      `help_center_article` for concrete cues (a quoted `"Field (optional)"`
      label, "leave X blank", "already shows"/"is the default", a `"+ X / Y
      / Z"` reveal-more-fields control, "if you have", "if useful", "none of
      them are required", etc. — see `classifyTestDataFields()`). Only
      renders when there's at least one field to contrast against the
      required ones; a field only ever becomes "optional"/"auto-set" on
      positive textual evidence, otherwise it defaults to "required" (the
      safer direction).
    - `faqFromNotableOptional()` — "Can I add [field(s)] later?" for the
      tutorial's most notable 1-2 optional fields (generic geography fields
      like country/city are deprioritized in favor of more distinctive ones
      like WhatsApp/Barcode/Reference); skipped if there are no optional
      fields at all.
    - `faqFromEditability()` — a generic, honest "you can always come back
      and update this later" answer, naming the entity via
      `inferEntityNoun()`; skipped if no entity noun can be confidently
      inferred.
  `inferEntityNoun()` checks `tutorial_id`/`title` for keywords
  (invoice/receipt/supplier/customer/item/payment) first, falling back to a
  `feature_area` lookup — never a hardcoded per-tutorial value.
- **YouTube**: assembled to be close to publish-ready with minimal manual
  editing, all still deterministic and frontmatter-only.
  - **Title**: `suggestYoutubeTitle()` takes the existing, already-safe
    `short_youtube_title` and appends one deterministic `(Modifier)` chosen
    from this tutorial's own step count / computed video length — never a
    random pick: `(Complete Guide)` at 12+ steps, `(Under N Minutes)` (N from
    the actual computed chapter-cursor total) under 10 steps, else
    `(Step-by-Step)`.
  - **Description**: `buildYoutubeDescription()` assembles, in order: an
    intro sentence from `goal`; a "What you'll learn" list (reusing the
    tutorial's own hand-written `youtube_description` bullets when present,
    else synthesized from 3 evenly-spaced steps via the same chapter
    summarizer below); a "Who this is for" line (`audience`); a "Why it
    matters" line (the first non-heading paragraph of `help_center_article`,
    falling back to `expected_result`); a try-it CTA; a clearly-labeled
    placeholder link block (the app's real, verified base URL for "Try
    BantooBooks free", and an explicit `TODO` for the Help Center link,
    since no help-center CMS exists yet — never a fabricated URL); and a
    fixed subscribe CTA. Because the description is built from the same
    `title`/`feature_area`/`goal`/`audience` fields that feed `seo.json`'s
    keyword extraction, several of those same keywords naturally show up in
    the copy without any separate keyword-stuffing step.
  - **Hashtags**: `buildYoutubeHashtags()` combines `#BantooBooks` + `#SME` +
    the feature area + the entity noun (`inferEntityNoun()`) + a region tag
    pair derived from this tutorial's own `test_data.country`/`demo_company`
    (e.g. `#CameroonBusiness` + `#AfricaSME` — traceable to a real field, via
    a `country -> tags` lookup map, never invented) + enough keyword-derived
    tags (the same `extractKeywords()` used by `seo.json`, not a second
    extractor) to land in a 5-10 count, deduped the same
    case-/plural-insensitive way as the LinkedIn/Twitter hashtags.
  - **Chapters**: `summarizeStepForChapter()` replaces the old fixed-length
    truncation (which could only ever cut a long step sentence mid-word or
    mid-clause) with a short, complete phrase: it detects the step's leading
    instruction verb (click/type/confirm/check/open/select/change/leave) and
    its target field, cross-referenced against this tutorial's own
    `test_data` keys wherever possible (so a step that fills in three fields
    at once names all three, e.g. "Enter WhatsApp, Country, and City"); a
    duplicate-detection step becomes "Review Possible Duplicate" and a final
    "confirm it now appears" step becomes "Review the Result". Falls back to
    a short leading clause (cut only at a natural punctuation boundary, never
    mid-word, never with a trailing "…") when no pattern confidently
    applies — the acceptance bar is that no chapter title ever ends in "…".
- **Shorts/Reels/TikTok**: an explicit 5-part Hook -> Problem -> Fast
  Solution -> Result -> CTA structure targeting 30-45s (~75-115 words at
  ~150 wpm), replacing the old 3-part Hook/Core/CTA shape. That old shape's
  "Core" section sampled 3 evenly-spaced *full* `voiceover_script` sentences
  with no regard for whether that particular step was actually worth
  showing — the earlier review's "even-index sampling can pick a low-value
  step" finding. The new structure fixes this at the source rather than
  tweaking the sampling: `pickEssentialActionPhrases()` first excludes any
  step that's really a confirmation/outcome moment (the same
  `CHAPTER_FINALE_RE`/`CHAPTER_DUPLICATE_RE` patterns `summarizeStepForChapter()`
  already uses for youtube.md — a "Review the Result" or "Review Possible
  Duplicate" step is never a real fast-path action), *then* evenly samples
  up to 3 of the remaining essential steps and reuses
  `summarizeStepForChapter()` to render each as a short verb+object phrase
  (e.g. "Add Customer", "Enter Phone") instead of a full explanatory
  sentence — so a review/outcome step can no longer be picked at all, and
  every picked step reads as a punchy action cue rather than a sentence.
  `Hook`/`Problem`/`Result` each come from their own small
  `feature_area ->` strategy map (`SHORTS_HOOK_BY_FEATURE_AREA`,
  `SHORTS_PROBLEM_BY_FEATURE_AREA`, `SHORTS_RESULT_BY_FEATURE_AREA`, each
  with a generic `DEFAULT_SHORTS_*` fallback) — the same lookup-map-with-
  fallback pattern used throughout this file, but with its own short,
  punchy, blunt-question-or-imperative copy (distinct in *style* from
  LinkedIn's reflective hooks and Facebook's longer conversational ones,
  even though all three are grounded in the same real pain points). `CTA`
  is always the fixed line "Follow BantooBooks for more business tips." —
  deliberately hardcoded since it's genuinely universal, and never combined
  with a second, different CTA line. Word count is printed so the target
  band is independently verifiable, without forcing an artificial exact
  count.
- **LinkedIn**: a founder-voice business story, not a feature announcement —
  `buildLinkedin()` follows a fixed narrative shape (hook → relatable
  elaboration → BantooBooks angle → brief tutorial mention → reflective CTA)
  where the hook/elaboration/solution/CTA copy all comes from
  `LINKEDIN_STORY_BY_FEATURE_AREA` (a small, fixed set of real, relatable
  pain points per feature area — never a fabricated statistic — with a
  generic `DEFAULT_LINKEDIN_STORY` fallback for any unmapped area, the same
  lookup-map-with-fallback pattern as `FACEBOOK_STORY_BY_FEATURE_AREA`
  below). The "BantooBooks solves this" paragraph's `solution` field is a
  hand-written *paraphrase* of that tutorial's own `goal` field (factually
  equivalent, reworded — never the `goal` string reproduced verbatim), so a
  reader can't spot an exact seam between fixed copy and a raw frontmatter
  field. The CTA question is written to echo the same pain point named in
  that area's hook, not a generic "start your free trial" line.
  Deliberately avoids any UI-mechanics detail (buttons, dropdowns) and any
  decorative emoji, for a calmer, more editorial tone than the Facebook post
  below. `buildLinkedinHashtags()` produces 3-5 specific tags — entity
  noun, feature area, one region tag, then keywords — reusing the same
  `inferEntityNoun()`/`inferRegionHashtags()`/`extractKeywords()` machinery
  built for `youtube.md` rather than a third hashtag algorithm; the generic
  `#BantooBooks`/`#SME` pair is included only as a low-priority fallback,
  when a tutorial's own fields don't yield enough specific tags on their
  own.
- **Facebook**: a short, conversational post for a real shop owner scrolling
  on their phone — distinctly more casual and shorter than LinkedIn, not a
  smaller version of the same copy. `buildFacebook()` follows the same
  underlying hook → cost → solution → tutorial-mention → CTA shape as
  LinkedIn, driven by its own parallel `FACEBOOK_STORY_BY_FEATURE_AREA` map
  (with a `DEFAULT_FACEBOOK_STORY` fallback) rather than routing through
  LinkedIn's copy: the hook is phrased as a direct question ("Still writing
  customer details in a notebook?") rather than LinkedIn's reflective
  statement, `cost` is one short sentence on why it costs the reader time/
  money/stress, and `solution` paraphrases `goal` (same never-quote-it-
  verbatim discipline as LinkedIn, with its own shorter, more casual
  wording). Every field is a single short sentence/paragraph, so the whole
  post stays scannable on a phone — `verify.js` enforces a max-2-sentence-
  per-paragraph rule. `buildFacebookHashtags()` produces 3-5 tags tuned
  toward small-business/retail/Africa themes (leading with `#SmallBusiness`),
  reusing the same `inferEntityNoun()`/`inferRegionHashtags()`/
  `extractKeywords()` machinery as LinkedIn rather than a 4th hashtag
  algorithm.
- **X (Twitter)**: same underlying facts (`goal`, `feature_area`,
  `expected_result`) as Facebook/LinkedIn, trimmed to fit a 280-char budget,
  and still feature-announcement-style/emoji-forward (that tone fits an X
  audience even though it no longer fits LinkedIn's founder-voice post or
  Facebook's shop-owner-conversation voice). X's hashtags reuse
  `buildHashtags()`, the original shared keyword-derived hashtag helper
  (`#BantooBooks` + `#SME` + feature area + keywords — a separate, longer
  set than LinkedIn/Facebook's tighter 3-5-tag helpers, since a
  feature-announcement post can afford to be more exhaustive).
- **Email**: a warm, 1:1-feeling note from BantooBooks' own Customer Success
  team ("Hi there," / "We know...") — deliberately a third distinct voice
  from LinkedIn's founder-editorial tone and Facebook's blunt-question
  shop-owner tone. `buildEmail()`'s subject line is its own short,
  benefit-oriented template (`"A faster way to {action} {noun}s in
  BantooBooks"`, e.g. "A faster way to create customers in BantooBooks")
  built from `primaryActionWord()`/`seoNounPhrase()` (the same helpers
  `seo.json`'s `primaryKeyword` uses) — a different, plainer register from
  `youtube.md`'s title logic, with no "(Complete Guide)"-style suffix. The
  body's opening paragraph pairs a short `EMAIL_WHY_LEAD_BY_FEATURE_AREA`
  lead sentence (same lookup-map-with-fallback pattern as the other social
  builders, but in first-person-plural CS voice) with the real first
  sentence of `help_center_article`'s own intro paragraph
  (`extractFirstArticleParagraph()`, the same "why it matters" extraction
  built for `youtube.md`'s description — not a second parallel extractor),
  falling back to `expected_result` if a tutorial has no article text. Two
  short benefit bullets come from `EMAIL_BENEFITS_BY_FEATURE_AREA` (again
  paraphrased from that tutorial's own `goal`/`expected_result`, never
  invented). All 3 required links reuse existing infrastructure rather than
  inventing new logic: the help-article link is `buildCanonicalUrl()` (the
  exact same URL `seo.json`'s `canonicalUrl` uses), the video link is a
  clearly-labeled `TODO:` placeholder (no fake URL), and "You might also
  like" reuses `buildRelatedTutorials()` verbatim — the identical adjacency
  map/fallback `seo.json` uses for its own `relatedTutorials` field, just
  rendered as a short link list instead of JSON (the section is omitted
  entirely for the one theoretical case where a tutorial has no related
  tutorials, rather than rendering an empty heading). Every tutorial ends
  with the same fixed sign-off, "Happy bookkeeping, / The BantooBooks
  Team". The file prints its own body word count
  (`**Word count:** N words`, body only — the subject line isn't counted,
  since it isn't part of what a reader experiences as "the email") so the
  under-250-word budget is independently verifiable; `verify.js` checks
  this line directly rather than re-deriving its own word count.
- **SEO** (`seo.json`) — an enterprise-grade SEO/structured-data package, not
  just a meta title/description pair. Every field below is still a pure
  function of `data`, reusing the same helpers built for the other files
  (`extractKeywords()`, `inferEntityNoun()`, `inferRegionHashtags()`'s
  country-detection pattern, `truncateAtWordBoundary()`,
  `computeYoutubeChapters()`'s timing heuristic) rather than a parallel set
  of SEO-only algorithms:
  - **`metaTitle`** (50-60 chars) — `How to {action} in BantooBooks
    ({modifier})`, where `{modifier}` is picked from a small
    `feature_area`-keyed suffix list (e.g. `(Customer Management Guide)`,
    `(Stock Guide)`), tried longest/most-specific first, keeping the first
    candidate whose *total* length lands in the 50-60 window — so the exact
    suffix is deterministic per tutorial's own title length, not
    hardcoded. Falls back to a generic `(Full Guide)`/`(Guide)` pair for
    any unmapped feature area.
  - **`metaDescription`** (140-160 chars) — `{goal's first sentence}{a
    subtle CTA}`, where the CTA is picked from 2-3 fixed candidates (same
    calm, editorial tone established for `linkedin.md`, never a hard
    sell) tried longest-first so the pairing lands in the 140-160 window;
    always a complete sentence, never a mid-word/mid-clause cut.
  - **`primaryKeyword` / `secondaryKeywords` / `longTailKeywords` /
    `relatedSearchPhrases`** — 4 keyword tiers replacing the old flat
    `keywords` array, built together by `buildKeywordTiers()` so they can
    share one de-dupe set (no phrase repeats across tiers for the same
    tutorial). `primaryKeyword` is `{action} {noun} BantooBooks` (action =
    `tutorial_id`'s own leading verb, noun = a feature-area noun-phrase map
    richer than the single-word `inferEntityNoun()`, e.g. "Sales Invoice").
    `secondaryKeywords` combines that action+noun pair, one phrase grounded
    in an actual step (via `summarizeStepForChapter()`, reused from
    `youtube.md`'s chapter titles rather than a new phrase algorithm), and
    2 feature-area topic phrases (e.g. "Accounts Receivable"). `longTailKeywords`
    and `relatedSearchPhrases` are natural-language/fragment-style search
    phrases templated from `goal`/`audience`/a region adjective (same
    country-detection logic as `inferRegionHashtags()`, e.g. "Cameroonian").
    Every tier falls back to a small generic-but-still-BantooBooks-grounded
    phrase pool if de-duping would otherwise leave it under 3 items — no
    tier is ever empty.
  - **`canonicalUrl`** — `https://www.bantoobooks.com/help/<slug>`, where
    `<slug>` drops `tutorial_id`'s leading filler verb phrase
    (`create-a-`/`add-`/`record-`/...), e.g. `create-a-customer` ->
    `.../help/customer`, `record-customer-receipt` ->
    `.../help/customer-receipt` (see `canonicalSlug()`'s doc comment for
    the exact prefix list). Reused verbatim — never re-invented — as
    `openGraph.url` and `jsonLd.url`.
  - **`openGraph`** / **`twitterCard`** — `type: "article"` (this URL is the
    written help-center article seo.json describes; the YouTube upload gets
    its own metadata + real hosted-video URL from `youtube.md` once
    published, which is the right place for a `video.*` OG type) with a
    clearly-labeled `TODO:`-prefixed image placeholder (never a blank
    string) shared by both blocks and by the JSON-LD's own `image`.
  - **`jsonLd`** — the original `HowTo` + `step[]` mapping, extended with
    `totalTime` (ISO 8601 duration, converted from the *same*
    `computeYoutubeChapters()` timing estimate used for `youtube.md`'s
    title/chapters — not a second estimate), `supply[]` (short noun phrases
    derived from `prerequisites` by stripping parentheticals/connective
    clauses), `tool[]` (`"BantooBooks"` plus any specific
    account/record/feature actually named in `prerequisites`, e.g. `"Bank
    or cash account"` for the receipt tutorial — pattern-matched, never
    invented), `publisher` (a real `Organization` with BantooBooks' real
    verified app URL + a placeholder logo), and `url` (the canonical URL).
  - **`aiSearchOptimization`** — `summaryParagraph` (goal + the expected
    result's first sentence, dense and fact-only), `retrievalAnswer` (a
    self-contained "To {action} {a/an} {noun} in BantooBooks, ..." paragraph
    suitable as a standalone RAG/chat answer), and `keyFacts` (4-6 short
    bullets: step count + estimated time + required/optional field counts,
    always available, plus feature-area-specific facts — e.g. "New
    inventory items start at 0 units on hand" — that are only ever added
    when this tutorial's own `expected_result`/steps text actually states
    them, via small pattern-matched fact builders, never invented).
  - **`richSnippet`** — `estimatedTime` (same timing heuristic, phrased as
    "Under N minutes"), `difficulty` (`"Beginner"` for tutorials with ≤10
    steps, `"Intermediate"` above that — see `DIFFICULTY_STEP_THRESHOLD`),
    plus `audience`/`featureArea` verbatim from frontmatter.
  - **`relatedTutorials`** — a small hand-curated `RELATED_TUTORIALS_MAP`
    (explicit rather than a generic algorithm, since 5 tutorials is small
    enough to sequence sensibly by hand, e.g. create-a-customer ->
    create-a-sales-invoice -> record-customer-receipt), resolved to
    `{tutorial_id, title, canonicalUrl}` via a small, independent
    tutorials/*.md index (`getTutorialIndex()`) built solely for this
    cross-referencing — it doesn't touch or depend on
    `generate-tutorial-assets.js`'s own discovery/writing loop. A future
    tutorial not yet added to the map falls back to "other tutorials in the
    same `feature_area`," and to an empty array (the task's own documented
    "no suggestions" outcome) if even that finds nothing.
- **Metadata**: `suggestedThumbnailTitle` strips filler ("How to " /
  " in BantooBooks") from `short_youtube_title` and upper-cases it;
  `suggestedCTA` is a single generic template built directly from `goal` —
  deliberately *not* a per-`feature_area` lookup table, so it keeps working
  for any future `feature_area` value without code changes. `files[]` is
  built from `ASSET_TYPES` (see below) rather than a separately hand-kept
  list, so it can't go stale. `generatedAt` is preserved across
  regenerations whenever nothing else in the file would change — see
  "Determinism & idempotency" below.

## How to extend this

**Add a new tutorial** — just drop `006-your-slug.md` into `tutorials/`
following the existing `NNN-slug.md` naming convention and schema. The
generator's file filter (`/^\d{3}-[a-z0-9-]+\.md$/`) picks it up
automatically on the next run; no code change needed. (`TEMPLATE.md`,
`README.md`, and `schema.json` are deliberately excluded by that same
pattern.)

**Add a new output type** — add a `buildYourThing(data)` function to
`generator/lib/builders.js` (pure function: takes the parsed frontmatter
object, returns a string or a plain object), then add one entry to the
`ASSET_TYPES` array in the same file: `{ file: "your-thing.md", kind:
"markdown" | "json", build: buildYourThing, description: "..." }`. That's
the *only* place you need to register it — `generate-tutorial-assets.js`'s
file-writing loop, `verify.js`'s `EXPECTED_FILES` list, and every
`metadata.json`'s `files[]` table of contents are all derived from
`ASSET_TYPES`, so they update automatically and can't drift out of sync with
what's actually written to disk. (`metadata.json` itself is deliberately not
in `ASSET_TYPES` — it can't very well list itself.)

**Add a new frontmatter field to the schema** — update
`tutorials/schema.json`, then either read `data.your_field` directly in a
builder (no parser change needed for a new *top-level scalar or block
string field* using the existing grammar), or extend
`generator/lib/frontmatter.js` if the new field needs a YAML shape not
already supported (see the parser's own doc comment for the exact supported
grammar).

## Determinism & idempotency

Every builder in `generator/lib/builders.js` is a pure function of the
parsed frontmatter — no `Math.random()`, no reading the system clock, no
network or filesystem reads beyond the tutorial file itself. The **only**
place a timestamp is read is `metadata.json.generatedAt`, and it's passed in
as an explicit, overridable argument (`generate({ generatedAtIso })`)
specifically so tests can hold it fixed.

`generatedAt` itself is idempotent, not just deterministic-when-fixed:
`generate-tutorial-assets.js`'s `resolveMetadata()` reads the tutorial's
existing `metadata.json` (if any) before writing, and — if every other field
would come out identical to what's already on disk — keeps the old
`generatedAt` instead of overwriting it with the new candidate timestamp.
That means running `npm run generate:tutorials` again with no real change to
any `tutorials/*.md` file produces a **completely diff-free** re-run (not
just "everything except the timestamp"), while a genuine content change
still updates `generatedAt` normally.

`generator/verify.js` proves this by regenerating twice with two different
injected candidate timestamps and asserting every file — including
`metadata.json` in full, timestamp and all — is byte-identical across both
runs and to the original first run, since nothing actually changed. It then
simulates a real content change (by tampering with one tutorial's on-disk
`metadata.json` directly) and confirms `generatedAt` *does* update to the
next injected timestamp in that case, and that the new value then sticks
through a further no-op regeneration. It also asserts every tutorial
produced exactly the expected 12 files and that every `.json` output parses.
Because steps 3-4 above deliberately mutate `generated/tutorials/`, it
finishes by restoring the exact original bytes captured right after the very
first (real-timestamp) run, so the working tree isn't left with fake
2020/2030 dates or tampered content.

## Files in this folder

```
generator/
  README.md                      This file.
  generate-tutorial-assets.js    Main script (also exports generate() for verify.js).
  verify.js                      Self-checks: file counts, JSON validity, determinism.
  lib/
    frontmatter.js                Hand-rolled parser for tutorials/*.md's YAML subset.
    text-utils.js                 Word counts, truncation, keyword/hashtag extraction, etc.
    builders.js                   One pure function per generated output.
```

(`package.json` at the repo root just wires `npm run generate:tutorials` /
`npm run verify:tutorials` to the two scripts above — see "Why a root
`package.json`" earlier in this file.)
