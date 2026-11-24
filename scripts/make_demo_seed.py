#!/usr/bin/env python3
"""Write the demo seed for the Proserv Board, one JSON file per database document.

Everything here is invented: people, customers, reference numbers and mails.
The files mirror the database paths (seed/<collection>/<doc id>.json), so they can be
written to the artifact database one to one.
Run from the repository root:  python3 scripts/make_demo_seed.py
"""
import json
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEED = ROOT / "seed"

PEOPLE = [
    {"id": "mara-lindqvist", "name": "Mara Lindqvist", "role": "SA", "region": "emea"},
    {"id": "tobias-arnesen", "name": "Tobias Arnesen", "role": "SA", "region": "emea"},
    {"id": "priya-raghavan", "name": "Priya Raghavan", "role": "SA", "region": "apac"},
    {"id": "diego-montalvo", "name": "Diego Montalvo", "role": "SA", "region": "americas"},
    {"id": "helena-voss", "name": "Helena Voss", "role": "PM", "region": "emea"},
    {"id": "callum-ferreira", "name": "Callum Ferreira", "role": "PM", "region": "emea"},
    {"id": "naomi-takeda", "name": "Naomi Takeda", "role": "PM", "region": "apac"},
    {"id": "rachel-okafor", "name": "Rachel Okafor", "role": "PM", "region": "americas"},
]

SERVICE_REGIONS = [
    {"id": "emea", "name": "EMEA"},
    {"id": "apac", "name": "APAC"},
    {"id": "americas", "name": "AMERICAS"},
    {"id": "latam", "name": "LATAM"},
]

SALES_REGIONS = [
    {"id": "dach", "name": "DACH"},
    {"id": "france", "name": "France"},
    {"id": "uki", "name": "UK & Ireland"},
    {"id": "south-eu", "name": "Southern Europe"},
    {"id": "north-eu", "name": "Nordics & Benelux"},
    {"id": "mea", "name": "Middle East & Africa"},
    {"id": "north-america", "name": "North America"},
    {"id": "latam", "name": "Latin America"},
    {"id": "apac", "name": "Asia Pacific"},
]

# code, name, service region, sales region
COUNTRIES = [
    ("DE", "Germany", "emea", "dach"), ("AT", "Austria", "emea", "dach"), ("CH", "Switzerland", "emea", "dach"),
    ("FR", "France", "emea", "france"), ("GB", "United Kingdom", "emea", "uki"), ("IE", "Ireland", "emea", "uki"),
    ("ES", "Spain", "emea", "south-eu"), ("IT", "Italy", "emea", "south-eu"), ("PT", "Portugal", "emea", "south-eu"),
    ("NL", "Netherlands", "emea", "north-eu"), ("BE", "Belgium", "emea", "north-eu"), ("SE", "Sweden", "emea", "north-eu"),
    ("NO", "Norway", "emea", "north-eu"), ("DK", "Denmark", "emea", "north-eu"), ("PL", "Poland", "emea", "dach"),
    ("AE", "United Arab Emirates", "emea", "mea"), ("ZA", "South Africa", "emea", "mea"),
    ("US", "United States", "americas", "north-america"), ("CA", "Canada", "americas", "north-america"),
    ("MX", "Mexico", "latam", "latam"), ("BR", "Brazil", "latam", "latam"), ("CL", "Chile", "latam", "latam"),
    ("SG", "Singapore", "apac", "apac"), ("AU", "Australia", "apac", "apac"), ("NZ", "New Zealand", "apac", "apac"),
    ("JP", "Japan", "apac", "apac"), ("IN", "India", "apac", "apac"), ("HK", "Hong Kong", "apac", "apac"),
]

DEFAULTS = [
    {"serviceRegion": "emea", "sa": "mara-lindqvist", "pm": "helena-voss"},
    {"serviceRegion": "apac", "sa": "priya-raghavan", "pm": "naomi-takeda"},
    {"serviceRegion": "americas", "sa": "diego-montalvo", "pm": "rachel-okafor"},
    {"serviceRegion": "latam", "sa": "diego-montalvo", "pm": "rachel-okafor"},
]


def mail(date, sender, subject):
    return {"date": date, "from": sender, "subject": subject}


OPPS = [
    {
        "id": "opp-0001",
        "title": "RFQ 0008114502: rack and stack, Singapore data hall",
        "customer": "Halvorsen Data Centres",
        "countries": ["SG"],
        "refs": [{"type": "SF PS", "value": "JMERC20261124-250611"}],
        "summary": "Sales asks Proserv to quote a rack-and-stack RFQ for a new data hall in Singapore. The regular contact is out of office, so the request came to the shared mailbox. The attached Word document with the scope cannot be opened; a readable copy has been requested.",
        "stakeholders": [
            {"name": "Jonas Mercier", "company": "Evernex", "role": "Business Development, requester", "side": "sales"},
            {"name": "Ines Calloway", "company": "Evernex", "role": "Proserv, asked for a readable file", "side": "proserv"},
            {"name": "Wei Ling Tan", "company": "Halvorsen Data Centres", "role": "Procurement", "side": "customer"},
        ],
        "timeline": [
            {"date": "2026-11-24", "text": "RFQ forwarded to Proserv, marked urgent."},
            {"date": "2026-11-24", "text": "Salesforce PS reference added to the thread."},
            {"date": "2026-11-24", "text": "Word document reported as unreadable; new copy requested."},
            {"date": "2026-11-27", "text": "Deadline for submission."},
        ],
        "deadline": "2026-11-27",
        "deadlineNote": "Submission deadline named by Sales",
        "nextAction": {"text": "Get a readable copy of the RFQ document, then decide who quotes", "due": "2026-11-25"},
        "suggest": {"sa": "priya-raghavan", "pm": "naomi-takeda", "reason": "Site in Singapore: APAC defaults from the rule table."},
        "mails": [
            mail("2026-11-24T10:05:00+01:00", "Ines Calloway", "FW: HDC - Request for Quotation - 0008114502 - SF ref: JMERC20261124-250611"),
            mail("2026-11-24T06:45:00+01:00", "Jonas Mercier", "RE: HDC - Request for Quotation - 0008114502 - SF ref: JMERC20261124-250611"),
            mail("2026-11-24T06:27:00+01:00", "Jonas Mercier", "RE: HDC - Request for Quotation - 0008114502"),
        ],
        "needsReview": False,
    },
    {
        "id": "opp-0002",
        "title": "International deployments 2027: Geneva and Des Moines",
        "customer": "Aldermoor Pharma",
        "countries": ["CH", "US"],
        "refs": [],
        "summary": "Two-site deployment programme for 2027. The customer accepts delivery through subcontractors on one condition: everyone on site presents themselves as working for Evernex. Proserv confirmed a single-layer subcontractor model with consultants paid directly. No reference number yet.",
        "stakeholders": [
            {"name": "Florian Reuter", "company": "Aldermoor Pharma", "role": "IT infrastructure lead", "side": "customer"},
            {"name": "Amadou Keller", "company": "Evernex", "role": "Account manager", "side": "sales"},
            {"name": "Beth Carroway", "company": "Evernex", "role": "Program manager", "side": "proserv"},
            {"name": "Daniel Amsel", "company": "Evernex", "role": "Delivery, subcontractor model", "side": "proserv"},
        ],
        "timeline": [
            {"date": "2026-11-19", "text": "Proserv explains that both sites are served through directly contracted subcontractors."},
            {"date": "2026-11-20", "text": "Confirmed: single-layer subcontracting, consultants paid directly."},
            {"date": "2026-11-20", "text": "Customer accepts, on condition that subcontractors appear as Evernex on site."},
        ],
        "deadline": None,
        "nextAction": {"text": "Confirm the on-site condition in writing and request a Salesforce PS number", "due": "2026-11-27"},
        "suggest": {"sa": "mara-lindqvist", "pm": "helena-voss", "reason": "Lead site Geneva: EMEA defaults. Second site in the US needs AMERICAS support."},
        "mails": [
            mail("2026-11-20T16:07:00+01:00", "Florian Reuter", "RE: SERVICES GENEVA (Site 1) - DES MOINES (Site 2) - USA / INTERNATIONAL DEPLOYMENTS 2027"),
            mail("2026-11-20T10:07:00+01:00", "Amadou Keller", "RE: SERVICES GENEVA (Site 1) - DES MOINES (Site 2) - USA / INTERNATIONAL DEPLOYMENTS 2027"),
            mail("2026-11-20T00:13:00+01:00", "Daniel Amsel", "RE: SERVICES GENEVA (Site 1) - DES MOINES (Site 2) - USA / INTERNATIONAL DEPLOYMENTS 2027"),
            mail("2026-11-19T20:01:00+01:00", "Beth Carroway", "RE: SERVICES GENEVA (Site 1) - DES MOINES (Site 2) - USA / INTERNATIONAL DEPLOYMENTS 2027"),
        ],
        "needsReview": False,
    },
    {
        "id": "opp-0003",
        "title": "Break-fix with short SLAs in Australia and New Zealand",
        "customer": "Brightwater Logistics",
        "countries": ["AU", "NZ"],
        "refs": [],
        "summary": "Opportunity with short on-site SLAs. The usual partners are not a fit, so a local partner is needed. The regional director pointed to two local contacts; one was reached, one has not answered. A third partner will be tried.",
        "stakeholders": [
            {"name": "Scott Calder", "company": "Evernex", "role": "Sales ANZ", "side": "sales"},
            {"name": "Alexis Duval", "company": "Evernex", "role": "Regional director ANZ and South East Asia", "side": "sales"},
            {"name": "Beth Carroway", "company": "Evernex", "role": "Program manager", "side": "proserv"},
            {"name": "Yann Lefort", "company": "Evernex", "role": "Proserv, out this week", "side": "proserv"},
        ],
        "timeline": [
            {"date": "2026-11-19", "text": "Proserv asks for local partner recommendations: the go-to partners cannot meet the SLAs."},
            {"date": "2026-11-20", "text": "A further partner is suggested as best placed."},
            {"date": "2026-11-20", "text": "One local contact reached, one silent; a third partner will be tried."},
        ],
        "deadline": None,
        "nextAction": {"text": "Follow up with Sales ANZ on which local partner answered", "due": "2026-11-26"},
        "suggest": {"sa": "priya-raghavan", "pm": "naomi-takeda", "reason": "Australia and New Zealand: APAC defaults from the rule table."},
        "mails": [
            mail("2026-11-20T09:05:00+01:00", "Scott Calder", "RE: Opportunity in Aus and NZ"),
            mail("2026-11-20T02:49:00+01:00", "Alexis Duval", "RE: Opportunity in Aus and NZ"),
            mail("2026-11-20T00:06:00+01:00", "Beth Carroway", "RE: Opportunity in Aus and NZ"),
            mail("2026-11-19T16:35:00+01:00", "Yann Lefort", "RE: Opportunity in Aus and NZ"),
            mail("2026-11-19T16:25:00+01:00", "Beth Carroway", "RE: Opportunity in Aus and NZ"),
        ],
        "needsReview": False,
    },
    {
        "id": "opp-0004",
        "title": "Wi-Fi survey request, Rouen",
        "customer": "Plumeria Networks (partner)",
        "countries": ["FR"],
        "refs": [],
        "summary": "A partner that normally supports Evernex with Wi-Fi surveys asked Evernex for help at a site in Rouen. Sales declined: the company is registered as a partner, not as a customer, and would have to be set up as a customer first.",
        "stakeholders": [
            {"name": "Oren Petrakis", "company": "Plumeria Networks", "role": "Business development manager", "side": "partner"},
            {"name": "Valentin Elias", "company": "Evernex", "role": "Partner management", "side": "sales"},
        ],
        "timeline": [
            {"date": "2026-11-19", "text": "Partner management takes the request and contacts the partner."},
            {"date": "2026-11-23", "text": "Partner asks again whether there is interest."},
            {"date": "2026-11-23", "text": "Declined for now: registration as a customer would be needed first."},
        ],
        "deadline": None,
        "nextAction": None,
        "suggest": {"sa": "mara-lindqvist", "pm": "helena-voss", "reason": "Site in France: EMEA defaults. The request was declined, so no assignment may be needed."},
        "mails": [
            mail("2026-11-23T10:43:00+01:00", "Valentin Elias", "RE: Service request 76100 Rouen FR"),
            mail("2026-11-23T10:24:00+01:00", "Oren Petrakis", "RE: Service request 76100 Rouen FR"),
            mail("2026-11-19T15:30:00+01:00", "Valentin Elias", "RE: Service request 76100 Rouen FR"),
        ],
        "needsReview": False,
    },
    {
        "id": "opp-0005",
        "title": "Hardware and facilities opportunity, indicative price",
        "customer": "Norvane Bank",
        "countries": ["IN"],
        "refs": [{"type": "SF PS", "value": "DSHAN20261117-248690"}],
        "summary": "Sales received an indicative price and thanked Proserv. The customer can be asked for whatever is still missing to turn the indication into a commercial offer.",
        "stakeholders": [
            {"name": "Devika Shankar", "company": "Evernex", "role": "Sales director", "side": "sales"},
            {"name": "Sara Whitlow", "company": "Evernex", "role": "Proserv, sent the indicative price", "side": "proserv"},
        ],
        "timeline": [
            {"date": "2026-11-17", "text": "Request opened with a Salesforce PS reference."},
            {"date": "2026-11-20", "text": "Indicative price acknowledged; Sales offers to collect missing details."},
        ],
        "deadline": None,
        "nextAction": {"text": "Send Sales the list of details needed for a firm offer", "due": "2026-11-26"},
        "suggest": {"sa": "priya-raghavan", "pm": "naomi-takeda", "reason": "Customer site in India: APAC defaults from the rule table."},
        "mails": [
            mail("2026-11-20T06:25:00+01:00", "Devika Shankar", "Re: PS # DSHAN20261117-248690 : H&F opp - Norvane"),
        ],
        "needsReview": False,
    },
    {
        "id": "opp-0006",
        "title": "Decommissioning of two server rooms, Frankfurt and Vienna",
        "customer": "Quintara Insurance",
        "countries": ["DE", "AT"],
        "refs": [{"type": "SF PS", "value": "LBRAN20261110-247302"}, {"type": "IFS VC", "value": "VC-104512"}],
        "summary": "Decommissioning with certified data erasure and asset buyback for about 180 servers and 12 storage systems in two rooms. Site surveys are done; the customer wants one price per site and a weekend option for Vienna.",
        "stakeholders": [
            {"name": "Lena Brandt", "company": "Evernex", "role": "Account manager DACH", "side": "sales"},
            {"name": "Georg Haidinger", "company": "Quintara Insurance", "role": "Head of data centre operations", "side": "customer"},
            {"name": "Mara Lindqvist", "company": "Evernex", "role": "Solution architect", "side": "proserv"},
        ],
        "timeline": [
            {"date": "2026-11-10", "text": "Request opened in Salesforce."},
            {"date": "2026-11-13", "text": "Site survey Frankfurt."},
            {"date": "2026-11-18", "text": "Site survey Vienna; weekend work requested as an option."},
            {"date": "2026-12-04", "text": "Customer expects the offer."},
        ],
        "deadline": "2026-12-04",
        "deadlineNote": "Offer date agreed with the customer",
        "nextAction": {"text": "Finish the effort estimate for Vienna including the weekend option", "due": "2026-11-27"},
        "suggest": {"sa": "mara-lindqvist", "pm": "helena-voss", "reason": "Germany and Austria: EMEA defaults from the rule table."},
        "mails": [
            mail("2026-11-21T14:12:00+01:00", "Lena Brandt", "AW: Quintara Decom FRA/VIE - SF ref: LBRAN20261110-247302"),
            mail("2026-11-18T17:40:00+01:00", "Georg Haidinger", "AW: Quintara Decom FRA/VIE - Begehung Wien"),
            mail("2026-11-13T11:02:00+01:00", "Mara Lindqvist", "RE: Quintara Decom FRA/VIE - survey notes Frankfurt"),
            mail("2026-11-10T09:15:00+01:00", "Lena Brandt", "Quintara Decom FRA/VIE - SF ref: LBRAN20261110-247302"),
        ],
        "needsReview": False,
    },
    {
        "id": "opp-0007",
        "title": "Smart hands for a network refresh in 14 stores",
        "customer": "Marlow & Finch Retail",
        "countries": ["GB", "IE"],
        "refs": [{"type": "SF PS", "value": "HPELL20261105-246118"}],
        "summary": "Switch and access point replacement in 14 stores, evenings only. The quote was sent on 14 November. The customer has not replied since; Sales chased once.",
        "stakeholders": [
            {"name": "Harriet Pell", "company": "Evernex", "role": "Account manager UK", "side": "sales"},
            {"name": "Owen Sandford", "company": "Marlow & Finch Retail", "role": "Network manager", "side": "customer"},
            {"name": "Tobias Arnesen", "company": "Evernex", "role": "Solution architect", "side": "proserv"},
        ],
        "timeline": [
            {"date": "2026-11-05", "text": "Request opened in Salesforce."},
            {"date": "2026-11-14", "text": "Quote sent."},
            {"date": "2026-11-20", "text": "Sales chased the customer; no reply yet."},
        ],
        "deadline": None,
        "nextAction": {"text": "Ask Sales whether the customer has a decision date", "due": "2026-11-28"},
        "suggest": {"sa": "mara-lindqvist", "pm": "helena-voss", "reason": "United Kingdom and Ireland: EMEA defaults from the rule table."},
        "mails": [
            mail("2026-11-20T15:20:00+01:00", "Harriet Pell", "RE: M&F store refresh - quote - SF ref: HPELL20261105-246118"),
            mail("2026-11-14T16:48:00+01:00", "Tobias Arnesen", "RE: M&F store refresh - quote - SF ref: HPELL20261105-246118"),
            mail("2026-11-05T10:31:00+01:00", "Harriet Pell", "M&F store refresh - SF ref: HPELL20261105-246118"),
        ],
        "needsReview": False,
    },
    {
        "id": "opp-0008",
        "title": "Storage migration, Sao Paulo and Santiago",
        "customer": "Solvik Energy",
        "countries": ["BR", "CL"],
        "refs": [{"type": "SF PS", "value": "RCAST20261112-247744"}],
        "summary": "Migration of two storage systems to new arrays, with Portuguese- and Spanish-speaking engineers on site. The scope call has taken place. Two threads were merged here because both carry the same Salesforce reference; one of them is about a licence question and may belong to a separate request.",
        "stakeholders": [
            {"name": "Rafael Castanho", "company": "Evernex", "role": "Account manager Latin America", "side": "sales"},
            {"name": "Marina Oyarzun", "company": "Solvik Energy", "role": "Storage team lead", "side": "customer"},
        ],
        "timeline": [
            {"date": "2026-11-12", "text": "Request opened in Salesforce."},
            {"date": "2026-11-19", "text": "Scope call with the customer."},
            {"date": "2026-11-23", "text": "Licence question raised in a second thread with the same reference."},
        ],
        "deadline": "2026-12-01",
        "deadlineNote": "Customer asked for a budget figure by this date",
        "nextAction": {"text": "Write the migration approach and the budget figure", "due": "2026-11-28"},
        "suggest": {"sa": "diego-montalvo", "pm": "rachel-okafor", "reason": "Brazil and Chile: LATAM defaults from the rule table."},
        "mails": [
            mail("2026-11-23T19:04:00+01:00", "Rafael Castanho", "RE: Solvik - licence transfer question - SF ref: RCAST20261112-247744"),
            mail("2026-11-19T21:30:00+01:00", "Marina Oyarzun", "RE: Solvik storage migration - scope call notes"),
            mail("2026-11-12T18:11:00+01:00", "Rafael Castanho", "Solvik storage migration - SF ref: RCAST20261112-247744"),
        ],
        "needsReview": True,
        "reviewNote": "Two threads share one reference; the licence question may be a separate request.",
    },
    {
        "id": "opp-0009",
        "title": "Rollout of 600 branch routers, staging and installation",
        "customer": "Kestrel Mobility",
        "countries": ["DE", "NL", "BE", "PL"],
        "refs": [{"type": "SF PS", "value": "LBRAN20261002-241960"}],
        "summary": "Staging in the warehouse and on-site installation of 600 routers in four countries. The customer signed in mid November; the project has been handed over to delivery.",
        "stakeholders": [
            {"name": "Lena Brandt", "company": "Evernex", "role": "Account manager DACH", "side": "sales"},
            {"name": "Pieter Vandenberg", "company": "Kestrel Mobility", "role": "Program lead", "side": "customer"},
            {"name": "Callum Ferreira", "company": "Evernex", "role": "Project manager", "side": "proserv"},
        ],
        "timeline": [
            {"date": "2026-10-02", "text": "Request opened in Salesforce."},
            {"date": "2026-10-23", "text": "Offer sent."},
            {"date": "2026-11-16", "text": "Customer signed."},
            {"date": "2026-11-18", "text": "Handover to delivery."},
        ],
        "deadline": None,
        "nextAction": None,
        "suggest": {"sa": "mara-lindqvist", "pm": "helena-voss", "reason": "Lead country Germany: EMEA defaults from the rule table."},
        "mails": [
            mail("2026-11-18T09:20:00+01:00", "Callum Ferreira", "RE: Kestrel router rollout - handover - SF ref: LBRAN20261002-241960"),
            mail("2026-11-16T13:55:00+01:00", "Lena Brandt", "RE: Kestrel router rollout - signed - SF ref: LBRAN20261002-241960"),
        ],
        "needsReview": False,
    },
]

ASSIGN = {
    "opp-0002": {"sa": "mara-lindqvist", "pm": "", "salesRegion": "", "serviceRegions": [], "status": "qualifying",
                 "nextAction": {"text": "", "who": "", "due": ""}, "note": "PM to be named once the US scope is clear."},
    "opp-0004": {"sa": "", "pm": "", "salesRegion": "", "serviceRegions": [], "status": "closed",
                 "nextAction": {"text": "", "who": "", "due": ""}, "note": "Declined by partner management."},
    "opp-0005": {"sa": "priya-raghavan", "pm": "naomi-takeda", "salesRegion": "", "serviceRegions": [], "status": "waiting",
                 "nextAction": {"text": "", "who": "", "due": ""}, "note": ""},
    "opp-0006": {"sa": "mara-lindqvist", "pm": "helena-voss", "salesRegion": "", "serviceRegions": [], "status": "quoting",
                 "nextAction": {"text": "Finish the effort estimate for Vienna including the weekend option", "who": "mara-lindqvist", "due": "2026-11-27"}, "note": ""},
    "opp-0007": {"sa": "tobias-arnesen", "pm": "callum-ferreira", "salesRegion": "", "serviceRegions": [], "status": "waiting",
                 "nextAction": {"text": "", "who": "", "due": ""}, "note": ""},
    "opp-0008": {"sa": "diego-montalvo", "pm": "rachel-okafor", "salesRegion": "", "serviceRegions": [], "status": "qualifying",
                 "nextAction": {"text": "", "who": "", "due": ""}, "note": ""},
    "opp-0009": {"sa": "tobias-arnesen", "pm": "callum-ferreira", "salesRegion": "", "serviceRegions": [], "status": "won",
                 "nextAction": {"text": "", "who": "", "due": ""}, "note": ""},
}

SYNC_STATE = {
    "mode": "demo",
    "lastRunAt": "2026-11-24T10:15:00+01:00",
    "lastRunStatus": "ok",
    "mailsRead": 28,
    "note": "Demo data. The mailbox is not connected yet; people, customers, reference numbers and mails are invented.",
}


def write(path, doc):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    if SEED.exists():
        shutil.rmtree(SEED)
    write(SEED / "config" / "people.json", {"people": PEOPLE})
    write(SEED / "config" / "regions.json", {
        "serviceRegions": SERVICE_REGIONS,
        "salesRegions": SALES_REGIONS,
        "countries": [{"code": c, "name": n, "serviceRegion": s, "salesRegion": r} for c, n, s, r in COUNTRIES],
        "defaults": DEFAULTS,
    })
    for opp in OPPS:
        doc = dict(opp)
        doc["mailCount"] = len(opp["mails"])
        doc["lastMailAt"] = max(m["date"] for m in opp["mails"])
        doc["firstMailAt"] = min(m["date"] for m in opp["mails"])
        write(SEED / "opps" / f"{opp['id']}.json", doc)
    for opp_id, doc in ASSIGN.items():
        write(SEED / "assign" / f"{opp_id}.json", {**doc, "updatedAt": "2026-11-24T10:15:00+01:00", "updatedBy": "seed"})
    write(SEED / "sync" / "state.json", SYNC_STATE)
    print(f"wrote {len(OPPS)} opportunities, {len(ASSIGN)} assignments, config and sync state to seed/")


if __name__ == "__main__":
    main()
