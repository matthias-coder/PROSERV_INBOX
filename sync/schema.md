# Data model

The board keeps its data in the artifact's database. Documents are JSON objects at `collection/id`.
Fields written by the sync and fields written by the team live in separate documents, so the sync
never overwrites what a person entered.

## Who writes what

| Path | Written by | Read by | Purpose |
|---|---|---|---|
| `opps/<id>` | sync (Editor level) | everyone | one opportunity as read from the mails |
| `assign/<id>` | Contributors | everyone | the team's values for the opportunity with the same id |
| `corrections/<id>` | Contributors | everyone | a grouping fix for the next sync |
| `threads/<key>` | sync | everyone | which Outlook conversation belongs to which opportunity |
| `config/people` | Editors | everyone | the PS team: roles and people |
| `config/regions` | Editors | everyone | regions, countries and the default owners per region |
| `sync/state` | sync | everyone | result of the last run |

Access rules of the published page: the root keeps the defaults (read `view`, write `interact`);
`opps`, `threads`, `config` and `sync` raise write to `admin`. Viewers never write.

## `opps/<id>`

`<id>` is `opp-` plus a four-digit running number (`opp-0001`).

| Field | Type | Notes |
|---|---|---|
| `id` | string | same as the document id |
| `title` | string | short, without RE/FW and without reference numbers |
| `customer` | string | end customer, or the partner with "(partner)" |
| `countries` | string[] | ISO 3166-1 alpha-2 codes of the sites; the service region follows from them |
| `salesRegions` | string[] | region ids of the sales side: where the requester or the account sits |
| `refs` | `{type, value}[]` | `type` is `SF PS`, `IFS VC` or the name of another CRM |
| `summary` | string | three sentences at most: what is asked, where it stands, what blocks it |
| `stakeholders` | `{name, company, role, side}[]` | `side` is `customer`, `sales`, `proserv` or `partner` |
| `timeline` | `{date, text}[]` | `date` as `YYYY-MM-DD`, oldest first, future dates allowed |
| `deadline` | string or null | `YYYY-MM-DD`, only a date someone named in a mail |
| `deadlineNote` | string | where the deadline comes from |
| `nextAction` | `{text, due}` or null | the sync's suggestion; the team's own value is in `assign` |
| `suggest` | `{salesPm, sa, pm, reason}` | person ids from `config/people`, empty where the region has nobody |
| `mails` | `{date, from, subject, link}[]` | newest first, at most 50; `link` only if it starts with `https://` |
| `mailCount`, `firstMailAt`, `lastMailAt` | number, ISO date-time | over all mails, not only the stored 50 |
| `needsReview`, `reviewNote` | boolean, string | set when the sync was not sure about the grouping |

## `assign/<id>`

| Field | Type | Notes |
|---|---|---|
| `salesPm`, `sa`, `pm` | string | person id, empty for none |
| `salesRegion` | string | region id; empty means "as the sync read it from the mails" |
| `serviceRegions` | string[] | region ids; empty means "follow the countries" |
| `stage` | string | stage id from the table below; no document means `1` |
| `outcome` | string | empty while open, `lost` (lost or declined) or `done` (completed) |
| `nextAction` | `{text, who, due}` | empty text means "show the sync's suggestion" |
| `note` | string | |
| `updatedAt`, `updatedBy` | ISO date-time, viewer id | set by the page |

### Stages

| Phase | Stage ids |
|---|---|
| Pre-sales | `1` Creation, `2` Qualification, `3.1-3.2` Request and Go/No-Go, `3.3` Quote cycle, `3.4` Lines, costs, margins, `4` Negotiation, `5` Waiting for PO, `6` Closed |
| Delivery | `7` Handover, `8` Set-up, `9` Kick-off, `10` Delivery, `11` Closure |
| Finance | `12` Customer billing, `13` Partner costs, `14` Project P&L |

An opportunity is open while `outcome` is empty. It "needs an owner" while it is open and
is in pre-sales without a Sales PM or Solution Architect, or in delivery without a Project Manager.
The phase names and this rule are the board's own; the stage numbers and names are the PS process.

## `corrections/<id>`

`{mergeInto, note, status, at, by}`. `<id>` is the opportunity the fix is about, `mergeInto` the id of
the opportunity it should be merged into (or empty), `status` is `open` until the sync has applied it.
The sync deletes a correction after applying it.

## `threads/<key>`

`{oppId, conversationId, subject, lastSeenAt}`. `<key>` is the first 32 hex characters of the SHA-256
of the Outlook conversation id, because database ids allow only letters, digits and `_ - . ~ : @ +`.

## `config/people`

`{roles: [{id, name}], people: [{id, name, role, region, team, country, head}]}`.
`role` is a role id; the board offers people with `sales-pm`, `sa` and `pm` as owners and shows all
others only on the team page. `region` is a region id or `global`, `team` a team inside the region
(for example `UK` in AMU) or empty, `country` an ISO code, `head` true for the head of the unit.

## `config/regions`

`{regions: [{id, name, long, teams}], countries: [{code, name, region, team, rateRegion}], defaults: [{region, salesPm, sa, pm}]}`.
The regions are the PS regions `swe`, `nece`, `noram`, `latam` and `amu`; sales and service region use the same list.
`rateRegion` is `emea`, `apac`, `americas` or `latam` and only decides the colour of a country tag,
as the TITANIA design system asks.

## `sync/state`

`{mode, lastRunAt, lastRunStatus, mailsRead, note}`. `mode` is `demo` while the board shows invented
data and `live` once the mailbox is connected. `lastRunStatus` is `ok` or `failed`.
