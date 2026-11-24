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
| `config/people` | Editors | everyone | Solution Architects and Project Managers |
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
| `countries` | string[] | ISO 3166-1 alpha-2 codes of the sites |
| `refs` | `{type, value}[]` | `type` is `SF PS`, `IFS VC` or the name of another CRM |
| `summary` | string | three sentences at most: what is asked, where it stands, what blocks it |
| `stakeholders` | `{name, company, role, side}[]` | `side` is `customer`, `sales`, `proserv` or `partner` |
| `timeline` | `{date, text}[]` | `date` as `YYYY-MM-DD`, oldest first, future dates allowed |
| `deadline` | string or null | `YYYY-MM-DD`, only a date someone named in a mail |
| `deadlineNote` | string | where the deadline comes from |
| `nextAction` | `{text, due}` or null | the sync's suggestion; the team's own value is in `assign` |
| `suggest` | `{sa, pm, reason}` | person ids from `config/people` |
| `mails` | `{date, from, subject, link}[]` | newest first, at most 50; `link` only if it starts with `https://` |
| `mailCount`, `firstMailAt`, `lastMailAt` | number, ISO date-time | over all mails, not only the stored 50 |
| `needsReview`, `reviewNote` | boolean, string | set when the sync was not sure about the grouping |

## `assign/<id>`

| Field | Type | Notes |
|---|---|---|
| `sa`, `pm` | string | person id, empty for none |
| `salesRegion` | string | region id; empty means "follow the countries" |
| `serviceRegions` | string[] | region ids; empty means "follow the countries" |
| `status` | string | `new`, `qualifying`, `quoting`, `waiting`, `won`, `closed`; no document means `new` |
| `nextAction` | `{text, who, due}` | empty text means "show the sync's suggestion" |
| `note` | string | |
| `updatedAt`, `updatedBy` | ISO date-time, viewer id | set by the page |

An opportunity is open while its status is `new`, `qualifying`, `quoting` or `waiting`.
It "needs an owner" while it is open and has no SA or no PM.

## `corrections/<id>`

`{mergeInto, note, status, at, by}`. `<id>` is the opportunity the fix is about, `mergeInto` the id of
the opportunity it should be merged into (or empty), `status` is `open` until the sync has applied it.
The sync deletes a correction after applying it.

## `threads/<key>`

`{oppId, conversationId, subject, lastSeenAt}`. `<key>` is the first 32 hex characters of the SHA-256
of the Outlook conversation id, because database ids allow only letters, digits and `_ - . ~ : @ +`.

## `config/people`

`{people: [{id, name, role, region}]}` with `role` `SA` or `PM` and `region` a service region id.

## `config/regions`

`{serviceRegions: [{id, name}], salesRegions: [{id, name}], countries: [{code, name, serviceRegion, salesRegion}], defaults: [{serviceRegion, sa, pm}]}`.
Service region ids are `emea`, `apac`, `americas`, `latam`: these four have tag colours in the TITANIA design system.

## `sync/state`

`{mode, lastRunAt, lastRunStatus, mailsRead, note}`. `mode` is `demo` while the board shows invented
data and `live` once the mailbox is connected. `lastRunStatus` is `ok` or `failed`.
