# Proserv Board: design

Status: approved by Matthias on 2026-11-24. Nothing is built before step 0 (feasibility test) has passed.

## Context

The shared mailbox "EVX Proserv" shows single mails. Nobody can see in one place which Solution Architect and Project Manager look after a request, or which sales and service regions are responsible. Several threads about the same request run side by side (in the screenshot: 16 mails that belong to 5 opportunities).

The goal is a board, published as a claude.ai artifact: one card per opportunity with SA, PM, sales region, service region(s), status, summary, stakeholders, timeline and next action. The team maintains the assignments in the board. Replies are still written in Outlook.

## Decisions (made by Matthias)

- **Purpose:** overview plus maintenance. No mail is sent from the board.
- **Source for SA/PM/region:** the board itself. Salesforce is not connected.
- **References:** every request gets a Salesforce PS number sooner or later; regional CRMs have their own numbers (e.g. IFS "VC"). One opportunity carries any number of references.
- **Build path A:** a scheduled Claude run syncs mails into the artifact database; the board only displays and edits.
- **Roles:** Matthias is owner, the Proserv team are Contributors (may edit every opportunity, no region lock), Sales and management are Viewers.
- **Design:** the TITANIA Design System (https://claude.ai/artifact/GCBBUDgRx9yU3BsKXV8TC2), the look for Evernex internal tools.
- **Language:** all documentation in the repository and the board UI are in English.

## Approaches considered

- **A, background sync (chosen):** fast, one shared truth, only one account needs mailbox access; up to a few hours of delay.
- **B, live in the browser:** every person would need the connector and mailbox rights; slow; people could see different groupings.
- **C, SharePoint list as store:** only needed if customer content must not leave the tenant. Kept as fallback.

## Assumptions and gaps (please check)

1. **Every user has a claude.ai seat in the Evernex organisation.** Without a login nobody sees data. If not: path C.
2. **Compliance:** summaries of customer mails are stored in claude.ai and readable by everyone the board is shared with.
3. **The Microsoft 365 connector is not fully connected** (state `connect_incomplete`). Matthias finishes this in the claude.ai connector settings.
4. **Unknown whether the connector can read the shared mailbox**, and whether a scheduled run may use the connector and the artifact database. Step 0 settles this before anything is built.
5. **Usage:** the account's weekly limit currently shows a warning. Start with 4 runs per working day instead of hourly.
6. **Master data is missing:** list of SAs and PMs, sales regions, mapping country → service region. Matthias provides it in step 2.
7. **Service regions:** proposal to reuse TITANIA's rate-card regions (EMEA, APAC, AMERICAS, LATAM), which already have tag colours. Sales regions get neutral tags.
8. **Tokens come from the design system artifact** (`project/tokens.json`, `project/components/bundle.css`), because the TITANIA repository is not attached to this session. If the repository should be the source, it has to be added.

## Design

### Data (artifact database)

AI fields and team fields live in separate documents, so the sync never overwrites manual maintenance.

| Path | Written by | Content |
|---|---|---|
| `opps/<id>` | sync only (admin) | title, customer, countries, references `[{type, value}]`, summary, stakeholders (name, company, role), timeline, detected deadline, suggested next action, suggested SA/PM/region with reason, latest mails (sender, date, subject, Outlook link; max. 50), `lastMailAt`, `needsReview` |
| `assign/<id>` | Contributors | SA, PM, sales region, service regions[], status, next action (text, who, due), note |
| `corrections/<id>` | Contributors | "merge with X", "mail Y does not belong here"; applied by the next sync |
| `threads/<key>` | sync only | mapping Outlook conversation → opportunity |
| `config/people`, `config/regions` | Editors | master data and the rule table country → region → default SA/PM |
| `sync/state` | sync only | last run, result, counters |

Access rules: root read `view`, write `admin`; `assign` and `corrections` write `interact`.

Status values (my proposal): New, Qualifying, Quote in progress, Waiting for reply, Won / handed over, Closed.

### Sync

A scheduled task, a fresh session per run, connector "Microsoft 365" only, four times per working day (Europe/Berlin). Each run:

1. Reads mails since `sync/state.lastRunAt`.
2. Assigns each mail, in this order: known reference number in subject or body → known Outlook conversation → cleaned subject (without RE/FW/AW/WG and reference suffix) matches an open opportunity → the model's judgement from customer, site and participants. If unsure: a new opportunity marked `needsReview`.
3. Attaches new reference numbers; two opportunities with the same number are merged.
4. Applies `corrections`.
5. Rewrites summary, stakeholders, timeline and next action for changed opportunities and suggests SA/PM/region from the rule table.
6. Writes `sync/state`.

Mail content is foreign data: the run never treats it as an instruction, has no send access and writes only to the board's database.

### Board (one HTML page, TITANIA look)

A TITANIA **work page** (`<main class="workbench work">`, at most 1920px): dark top bar and tool band (stage), light workbench below that follows the viewer's theme.

```
[TITANIA top bar]
[Band]  VAS & PS · Proserv Board          Last sync 23 min ago · 14 open
[Service region v] [Sales region v] [SA v] [PM v] [Status v] [Mine]

 Unassigned · 2
 BDx RFQ 0008003569   [SF IFERH20261124-250551]  [SG · APAC]
 SA –   PM –   Sales –          Due 27 Nov   New   3 mails · today
 Next: review RFQ document (Word file unreadable)

 Assigned · 12
 Geneva + Keokuk deployments 2027   SA …  PM …  [CH · EMEA] [US · AMERICAS]
```

- Filters in one row; all controls 44px; every size and colour from a token, light and dark.
- Countries as `.tag` in the region colour (tooltip "Germany · EMEA"); references and status as tags; reserved colours (partner blue, error red, done green) keep their meaning.
- A click on a row opens the detail as a side panel on the right (`w-aside`, 480px): summary, stakeholders, timeline, mail list with Outlook links, the editable fields, the AI suggestion with "Apply", and "Merge with …". Escape closes and returns focus.
- Viewers see everything without input fields. The page has no main button; save actions are secondary buttons.
- No hub, no hexagons, no picture strip: this is a standalone page in the TITANIA look, not part of the TITANIA app. It could later become the planned "PS Dashboard" tile; that is out of scope here.
- Components to reuse from the design system: Button, Field, Segment, Tag, TagGroups, ToolBand, TypeBadge.

## Implementation steps

0. **Feasibility test (blocker).** Matthias connects Microsoft 365. Test in a session: read 10 mails from EVX Proserv and check the available fields (conversation id, link, body). Then a trial run as a scheduled task that reads the connector and writes one test document into a throwaway artifact database. If the mailbox fails: mirror mails into a SharePoint list with Power Automate. If the scheduled run fails: start the sync by hand in a session.
1. Commit the design as `docs/superpowers/specs/2026-11-24-proserv-board-design.md` (English).
2. Collect master data with Matthias → `config/seed/people.json`, `config/seed/regions.json`.
3. Read the design system (`project/README.md` in full, `tokens.json`, `bundle.css`, the component READMEs named above). Build `board/index.html` with capabilities `db` (rules above) and `user`. Publish privately.
4. Write the sync instruction `sync/prompt.md` and the data model `sync/schema.md`. Run once by hand over the last 30 days, review the grouping together and tune it.
5. Create the scheduled task, watch it for a week, then share the board with the team.
6. `README.md`: what the board is, how the sync works, how to change master data.

The repository is empty; there is no existing code. All files are new.

## Verification

- **Grouping:** the 16 mails from the screenshot give exactly 5 opportunities (BDx RFQ 3 mails incl. both subject variants, Rouen 3, Geneva/Keokuk 4, Aus/NZ 5, Persistent H&F 1).
- **Manual maintenance survives:** set `assign/<id>`, run the sync, value unchanged.
- **Reference merge:** a thread without a number later gets an SF number and lands in the existing opportunity.
- **Rights:** with `ArtifactData` and `as_level: "view"` nothing is writable; with `"interact"` only `assign` and `corrections`, not `opps` or `config`.
- **Rendering:** render the page locally with Playwright (capability stub), light and dark, at 1920px, laptop width and 390px without sideways scroll; text contrast 4.5:1.
- **Empty state and sync failure:** the board shows "No data yet", and the age of the last run is clearly visible.
