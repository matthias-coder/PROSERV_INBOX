#!/usr/bin/env python3
"""Write the demo seed for the Proserv Board, one JSON file per database document.

Everything here is invented: people, customers, reference numbers and mails. The team follows the
shape of the PS organisation (regions, roles, head count per role), with random names.
The files mirror the database paths (seed/<collection>/<doc id>.json), so they can be
written to the artifact database one to one.
Run from the repository root:  python3 scripts/make_demo_seed.py
"""
import json
import pathlib
import re
import shutil
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEED = ROOT / "seed"

ROLES = [
    {"id": "vp", "name": "VP Group Professional Services"},
    {"id": "head-ps", "name": "Head of PS"},
    {"id": "head-sa", "name": "Head of Solution Architects & new services"},
    {"id": "head-delivery", "name": "COO, Head of PS Delivery"},
    {"id": "head-service-delivery", "name": "Head of Service Delivery"},
    {"id": "sales-pm", "name": "Sales PM"},
    {"id": "sa", "name": "Solution Architect"},
    {"id": "pm", "name": "Project Manager"},
    {"id": "sales-coord", "name": "Sales Coordinator"},
    {"id": "service-delivery", "name": "Service Delivery"},
    {"id": "resourcing", "name": "Vendor Management / Resourcing"},
]

# PS regions; "global" holds the group functions
REGIONS = [
    {"id": "swe", "name": "SWE", "long": "South West Europe", "teams": []},
    {"id": "nece", "name": "NECE", "long": "North, East and Central Europe", "teams": []},
    {"id": "noram", "name": "NORAM", "long": "NORAM & ITAD Americas", "teams": ["NORAM", "ITAD Americas"]},
    {"id": "latam", "name": "LATAM", "long": "Latin America", "teams": []},
    {"id": "amu", "name": "AMU", "long": "APAC, MEA, UK", "teams": ["APAC", "MEA", "UK"]},
]

# name, role, region, team, country, head of the unit
TEAM = [
    ("Étienne Marchais", "vp", "global", "", "FR", True),
    ("Cormac Whitby", "head-sa", "global", "", "GB", True),
    ("Fiona Harrow", "head-delivery", "global", "", "GB", True),
    ("Gareth Linley", "head-service-delivery", "global", "Service Delivery", "GB", False),
    ("Duncan Pryce", "resourcing", "global", "Resourcing", "GB", False),
    ("Mei Suan Lau", "service-delivery", "global", "Resourcing", "MY", False),
    ("Kofi Baptiste", "service-delivery", "global", "Resourcing", "AE", False),
    ("Aisyah Rahman", "sales-coord", "global", "Admin", "MY", False),
    ("Yasmine Ouali", "sales-coord", "global", "Admin", "MA", False),

    ("Imogen Radcliffe", "head-ps", "amu", "", "GB", True),
    ("Zara Qureshi", "sales-pm", "amu", "APAC", "PK", False),
    ("Jun Wei Ong", "sa", "amu", "APAC", "MY", False),
    ("Tariq Haddad", "sa", "amu", "MEA", "AE", False),
    ("Helen Ashdown", "sales-pm", "amu", "UK", "GB", False),
    ("Priscilla Moorcroft", "sales-pm", "amu", "UK", "GB", False),

    ("Henrik Solbach", "head-ps", "nece", "", "DE", True),
    ("Jonas Pfeiffer", "sales-pm", "nece", "", "DE", False),
    ("Lukas Brandauer", "sales-pm", "nece", "", "AT", False),
    ("Katrin Wendel", "pm", "nece", "", "DE", False),
    ("Sabine Röttger", "pm", "nece", "", "DE", False),
    ("Reto Amstutz", "pm", "nece", "", "CH", False),
    ("Milan Dvořák", "pm", "nece", "", "DE", False),
    ("Florian Achterberg", "sa", "nece", "", "DE", False),

    ("Douglas Merriweather", "head-ps", "noram", "", "US", True),
    ("Curtis Halloran", "sales-pm", "noram", "NORAM", "US", False),
    ("Melissa Ortega", "pm", "noram", "NORAM", "US", False),
    ("Bradley Whitcomb", "pm", "noram", "NORAM", "US", False),
    ("Trevor Lindgren", "sa", "noram", "NORAM", "US", False),
    ("Angela Kowalski", "sa", "noram", "NORAM", "US", False),
    ("Teresa Villanueva", "pm", "noram", "ITAD Americas", "US", False),
    ("Hector Salgado", "sales-pm", "noram", "ITAD Americas", "US", False),
    ("Camila Restrepo", "sales-pm", "noram", "ITAD Americas", "US", False),
    ("Luciana Prado", "pm", "noram", "ITAD Americas", "US", False),
    ("Renata Fuentes", "pm", "noram", "ITAD Americas", "US", False),

    ("Thibault Vermeulen", "head-ps", "swe", "", "FR", True),
    ("Clémence Aubry", "sales-coord", "swe", "", "FR", False),
    ("Margaux Tessier", "sales-coord", "swe", "", "FR", False),
    ("Julien Carpentier", "pm", "swe", "", "FR", False),
    ("Aurélie Fontaine", "pm", "swe", "", "FR", False),
    ("Baptiste Morel", "pm", "swe", "", "FR", False),
    ("Solène Garnier", "service-delivery", "swe", "", "FR", False),
    ("Mathieu Roussel", "service-delivery", "swe", "", "FR", False),
    ("Karim Benali", "sa", "swe", "", "FR", False),
    ("Yannick Le Goff", "sa", "swe", "", "FR", False),

    ("Rodrigo Albuquerque", "head-ps", "latam", "", "BR", True),
]


def slug(name):
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")


PEOPLE = [{"id": slug(n), "name": n, "role": r, "region": g, "team": t, "country": c, "head": h} for n, r, g, t, c, h in TEAM]

# code, name, PS region, team inside the region, rate-card region (decides the tag colour)
COUNTRIES = [
    ("DE", "Germany", "nece", "", "emea"), ("AT", "Austria", "nece", "", "emea"), ("CH", "Switzerland", "nece", "", "emea"),
    ("NL", "Netherlands", "nece", "", "emea"), ("PL", "Poland", "nece", "", "emea"), ("CZ", "Czechia", "nece", "", "emea"),
    ("SE", "Sweden", "nece", "", "emea"), ("NO", "Norway", "nece", "", "emea"), ("DK", "Denmark", "nece", "", "emea"),
    ("FI", "Finland", "nece", "", "emea"),
    ("FR", "France", "swe", "", "emea"), ("ES", "Spain", "swe", "", "emea"), ("PT", "Portugal", "swe", "", "emea"),
    ("IT", "Italy", "swe", "", "emea"), ("BE", "Belgium", "swe", "", "emea"), ("LU", "Luxembourg", "swe", "", "emea"),
    ("GB", "United Kingdom", "amu", "UK", "emea"), ("IE", "Ireland", "amu", "UK", "emea"),
    ("AE", "United Arab Emirates", "amu", "MEA", "emea"), ("SA", "Saudi Arabia", "amu", "MEA", "emea"),
    ("ZA", "South Africa", "amu", "MEA", "emea"), ("MA", "Morocco", "amu", "MEA", "emea"),
    ("SG", "Singapore", "amu", "APAC", "apac"), ("AU", "Australia", "amu", "APAC", "apac"), ("NZ", "New Zealand", "amu", "APAC", "apac"),
    ("JP", "Japan", "amu", "APAC", "apac"), ("IN", "India", "amu", "APAC", "apac"), ("HK", "Hong Kong", "amu", "APAC", "apac"),
    ("MY", "Malaysia", "amu", "APAC", "apac"), ("PK", "Pakistan", "amu", "APAC", "apac"),
    ("US", "United States", "noram", "NORAM", "americas"), ("CA", "Canada", "noram", "NORAM", "americas"),
    ("MX", "Mexico", "latam", "", "latam"), ("BR", "Brazil", "latam", "", "latam"), ("CL", "Chile", "latam", "", "latam"),
    ("AR", "Argentina", "latam", "", "latam"), ("CO", "Colombia", "latam", "", "latam"),
]

# default owners per PS region: the Sales PM follows the sales region, SA and PM the first service region
DEFAULTS = [
    {"region": "swe", "salesPm": "", "sa": "karim-benali", "pm": "julien-carpentier"},
    {"region": "nece", "salesPm": "jonas-pfeiffer", "sa": "florian-achterberg", "pm": "katrin-wendel"},
    {"region": "noram", "salesPm": "curtis-halloran", "sa": "angela-kowalski", "pm": "melissa-ortega"},
    {"region": "latam", "salesPm": "hector-salgado", "sa": "trevor-lindgren", "pm": "teresa-villanueva"},
    {"region": "amu", "salesPm": "helen-ashdown", "sa": "jun-wei-ong", "pm": ""},
]


def mail(date, sender, subject):
    return {"date": date, "from": sender, "subject": subject}


def who(name, company, role, side):
    return {"name": name, "company": company, "role": role, "side": side}


def step(date, text):
    return {"date": date, "text": text}


OPPS = [
    {
        "id": "opp-0001",
        "title": "RFQ 0008114502: rack and stack, Singapore data hall",
        "customer": "Halvorsen Data Centres",
        "countries": ["SG"], "salesRegions": ["amu"],
        "refs": [{"type": "SF PS", "value": "TWIER20261124-250611"}],
        "summary": "Sales asks Proserv to quote a rack-and-stack RFQ for a new data hall in Singapore. The regular contact is out of office, so the request came to the shared mailbox. The attached Word document with the scope cannot be opened; a readable copy has been requested.",
        "stakeholders": [
            who("Tomasz Wierzbicki", "Evernex", "Business Development, requester", "sales"),
            who("Priscilla Moorcroft", "Evernex", "Sales PM, asked for a readable file", "proserv"),
            who("Wei Ling Tan", "Halvorsen Data Centres", "Procurement", "customer"),
        ],
        "timeline": [
            step("2026-11-24", "RFQ forwarded to Proserv, marked urgent."),
            step("2026-11-24", "Salesforce PS reference added to the thread."),
            step("2026-11-24", "Word document reported as unreadable; new copy requested."),
            step("2026-11-27", "Deadline for submission."),
        ],
        "deadline": "2026-11-27", "deadlineNote": "Submission deadline named by Sales",
        "nextAction": {"text": "Get a readable copy of the RFQ document, then decide who quotes", "due": "2026-11-25"},
        "suggest": {"salesPm": "helen-ashdown", "sa": "jun-wei-ong", "pm": "", "reason": "Sales and site in AMU: default Sales PM and Solution Architect of AMU. AMU has no Project Manager yet."},
        "mails": [
            mail("2026-11-24T10:05:00+01:00", "Priscilla Moorcroft", "FW: HDC - Request for Quotation - 0008114502 - SF ref: TWIER20261124-250611"),
            mail("2026-11-24T06:45:00+01:00", "Tomasz Wierzbicki", "RE: HDC - Request for Quotation - 0008114502 - SF ref: TWIER20261124-250611"),
            mail("2026-11-24T06:27:00+01:00", "Tomasz Wierzbicki", "RE: HDC - Request for Quotation - 0008114502"),
        ],
    },
    {
        "id": "opp-0002",
        "title": "International deployments 2027: Geneva and Des Moines",
        "customer": "Aldermoor Pharma",
        "countries": ["CH", "US"], "salesRegions": ["swe"],
        "refs": [],
        "summary": "Two-site deployment programme for 2027. The customer accepts delivery through subcontractors on one condition: everyone on site presents themselves as working for Evernex. Proserv confirmed a single-layer subcontractor model with consultants paid directly. No reference number yet.",
        "stakeholders": [
            who("Corinne Halter", "Aldermoor Pharma", "IT infrastructure lead", "customer"),
            who("Emeka Sorensen", "Evernex", "Account manager", "sales"),
            who("Angela Kowalski", "Evernex", "Solution Architect NORAM", "proserv"),
            who("Douglas Merriweather", "Evernex", "Head of PS NORAM, subcontractor model", "proserv"),
        ],
        "timeline": [
            step("2026-11-19", "Proserv explains that both sites are served through directly contracted subcontractors."),
            step("2026-11-20", "Confirmed: single-layer subcontracting, consultants paid directly."),
            step("2026-11-20", "Customer accepts, on condition that subcontractors appear as Evernex on site."),
        ],
        "deadline": None,
        "nextAction": {"text": "Confirm the on-site condition in writing and request a Salesforce PS number", "due": "2026-11-27"},
        "suggest": {"salesPm": "", "sa": "florian-achterberg", "pm": "katrin-wendel", "reason": "First site Geneva: default owners of NECE. SWE, the sales region, has no Sales PM. The second site is in NORAM."},
        "mails": [
            mail("2026-11-20T16:07:00+01:00", "Corinne Halter", "RE: SERVICES GENEVA (Site 1) - DES MOINES (Site 2) - USA / INTERNATIONAL DEPLOYMENTS 2027"),
            mail("2026-11-20T10:07:00+01:00", "Emeka Sorensen", "RE: SERVICES GENEVA (Site 1) - DES MOINES (Site 2) - USA / INTERNATIONAL DEPLOYMENTS 2027"),
            mail("2026-11-20T00:13:00+01:00", "Douglas Merriweather", "RE: SERVICES GENEVA (Site 1) - DES MOINES (Site 2) - USA / INTERNATIONAL DEPLOYMENTS 2027"),
            mail("2026-11-19T20:01:00+01:00", "Angela Kowalski", "RE: SERVICES GENEVA (Site 1) - DES MOINES (Site 2) - USA / INTERNATIONAL DEPLOYMENTS 2027"),
        ],
    },
    {
        "id": "opp-0003",
        "title": "Break-fix with short SLAs in Australia and New Zealand",
        "customer": "Brightwater Logistics",
        "countries": ["AU", "NZ"], "salesRegions": ["amu"],
        "refs": [],
        "summary": "Opportunity with short on-site SLAs. The usual partners are not a fit, so a local partner is needed. The regional director pointed to two local contacts; one was reached, one has not answered. A third partner will be tried.",
        "stakeholders": [
            who("Graham Tindall", "Evernex", "Sales ANZ", "sales"),
            who("Olivier Sauvage", "Evernex", "Regional director ANZ and South East Asia", "sales"),
            who("Trevor Lindgren", "Evernex", "Solution Architect NORAM, asked for local partners", "proserv"),
            who("Jun Wei Ong", "Evernex", "Solution Architect APAC, out this week", "proserv"),
        ],
        "timeline": [
            step("2026-11-19", "Proserv asks for local partner recommendations: the go-to partners cannot meet the SLAs."),
            step("2026-11-20", "A further partner is suggested as best placed."),
            step("2026-11-20", "One local contact reached, one silent; a third partner will be tried."),
        ],
        "deadline": None,
        "nextAction": {"text": "Follow up with Sales ANZ on which local partner answered", "due": "2026-11-26"},
        "suggest": {"salesPm": "helen-ashdown", "sa": "jun-wei-ong", "pm": "", "reason": "Sales and sites in AMU: default Sales PM and Solution Architect of AMU."},
        "mails": [
            mail("2026-11-20T09:05:00+01:00", "Graham Tindall", "RE: Opportunity in Aus and NZ"),
            mail("2026-11-20T02:49:00+01:00", "Olivier Sauvage", "RE: Opportunity in Aus and NZ"),
            mail("2026-11-20T00:06:00+01:00", "Trevor Lindgren", "RE: Opportunity in Aus and NZ"),
            mail("2026-11-19T16:35:00+01:00", "Jun Wei Ong", "RE: Opportunity in Aus and NZ"),
            mail("2026-11-19T16:25:00+01:00", "Trevor Lindgren", "RE: Opportunity in Aus and NZ"),
        ],
    },
    {
        "id": "opp-0004",
        "title": "Wi-Fi survey request, Rouen",
        "customer": "Plumeria Networks (partner)",
        "countries": ["FR"], "salesRegions": ["swe"],
        "refs": [],
        "summary": "A partner that normally supports Evernex with Wi-Fi surveys asked Evernex for help at a site in Rouen. Declined: the company is registered as a partner, not as a customer, and would have to be set up as a customer first.",
        "stakeholders": [
            who("Henri Castaing", "Plumeria Networks", "Business development manager", "partner"),
            who("Cormac Whitby", "Evernex", "Head of Solution Architects, answered the partner", "proserv"),
        ],
        "timeline": [
            step("2026-11-19", "Proserv takes the request and contacts the partner."),
            step("2026-11-23", "Partner asks again whether there is interest."),
            step("2026-11-23", "Declined for now: registration as a customer would be needed first."),
        ],
        "deadline": None, "nextAction": None,
        "suggest": {"salesPm": "", "sa": "karim-benali", "pm": "", "reason": "Site in France: default Solution Architect of SWE. The request was declined, so no owner may be needed."},
        "mails": [
            mail("2026-11-23T10:43:00+01:00", "Cormac Whitby", "RE: Service request 76100 Rouen FR"),
            mail("2026-11-23T10:24:00+01:00", "Henri Castaing", "RE: Service request 76100 Rouen FR"),
            mail("2026-11-19T15:30:00+01:00", "Cormac Whitby", "RE: Service request 76100 Rouen FR"),
        ],
    },
    {
        "id": "opp-0005",
        "title": "Hardware and facilities opportunity, indicative price",
        "customer": "Norvane Bank",
        "countries": ["IN"], "salesRegions": ["amu"],
        "refs": [{"type": "SF PS", "value": "RMEHR20261117-248690"}],
        "summary": "Sales received an indicative price and thanked Proserv. The customer can be asked for whatever is still missing to turn the indication into a commercial offer.",
        "stakeholders": [
            who("Rohan Mehrotra", "Evernex", "Sales director", "sales"),
            who("Zara Qureshi", "Evernex", "Sales PM, sent the indicative price", "proserv"),
        ],
        "timeline": [
            step("2026-11-17", "Request opened with a Salesforce PS reference."),
            step("2026-11-20", "Indicative price acknowledged; Sales offers to collect missing details."),
        ],
        "deadline": None,
        "nextAction": {"text": "Send Sales the list of details needed for a firm offer", "due": "2026-11-26"},
        "suggest": {"salesPm": "helen-ashdown", "sa": "jun-wei-ong", "pm": "", "reason": "Customer site in India: default owners of AMU."},
        "mails": [
            mail("2026-11-20T06:25:00+01:00", "Rohan Mehrotra", "Re: PS # RMEHR20261117-248690 : H&F opp - Norvane"),
        ],
    },
    {
        "id": "opp-0006",
        "title": "Decommissioning of two server rooms, Frankfurt and Vienna",
        "customer": "Quintara Insurance",
        "countries": ["DE", "AT"], "salesRegions": ["nece"],
        "refs": [{"type": "SF PS", "value": "LBRAN20261110-247302"}, {"type": "IFS VC", "value": "VC-104512"}],
        "summary": "Decommissioning with certified data erasure and asset buyback for about 180 servers and 12 storage systems in two rooms. Site surveys are done; the customer wants one price per site and a weekend option for Vienna.",
        "stakeholders": [
            who("Lena Brandt", "Evernex", "Account manager DACH", "sales"),
            who("Georg Haidinger", "Quintara Insurance", "Head of data centre operations", "customer"),
            who("Florian Achterberg", "Evernex", "Solution Architect", "proserv"),
        ],
        "timeline": [
            step("2026-11-10", "Request opened in Salesforce."),
            step("2026-11-13", "Site survey Frankfurt."),
            step("2026-11-18", "Site survey Vienna; weekend work requested as an option."),
            step("2026-12-04", "Customer expects the offer."),
        ],
        "deadline": "2026-12-04", "deadlineNote": "Offer date agreed with the customer",
        "nextAction": {"text": "Finish the effort estimate for Vienna including the weekend option", "due": "2026-11-27"},
        "suggest": {"salesPm": "jonas-pfeiffer", "sa": "florian-achterberg", "pm": "katrin-wendel", "reason": "Germany and Austria: default owners of NECE."},
        "mails": [
            mail("2026-11-21T14:12:00+01:00", "Lena Brandt", "AW: Quintara Decom FRA/VIE - SF ref: LBRAN20261110-247302"),
            mail("2026-11-18T17:40:00+01:00", "Georg Haidinger", "AW: Quintara Decom FRA/VIE - Begehung Wien"),
            mail("2026-11-13T11:02:00+01:00", "Florian Achterberg", "RE: Quintara Decom FRA/VIE - survey notes Frankfurt"),
            mail("2026-11-10T09:15:00+01:00", "Lena Brandt", "Quintara Decom FRA/VIE - SF ref: LBRAN20261110-247302"),
        ],
    },
    {
        "id": "opp-0007",
        "title": "Smart hands for a network refresh in 14 stores",
        "customer": "Marlow & Finch Retail",
        "countries": ["GB", "IE"], "salesRegions": ["amu"],
        "refs": [{"type": "SF PS", "value": "HPELL20261105-246118"}],
        "summary": "Switch and access point replacement in 14 stores, evenings only. The quote was sent on 14 November. The customer has not replied since; Sales chased once.",
        "stakeholders": [
            who("Harriet Pell", "Evernex", "Account manager UK", "sales"),
            who("Owen Sandford", "Marlow & Finch Retail", "Network manager", "customer"),
            who("Tariq Haddad", "Evernex", "Solution Architect", "proserv"),
        ],
        "timeline": [
            step("2026-11-05", "Request opened in Salesforce."),
            step("2026-11-14", "Quote sent."),
            step("2026-11-20", "Sales chased the customer; no reply yet."),
        ],
        "deadline": None,
        "nextAction": {"text": "Ask Sales whether the customer has a decision date", "due": "2026-11-28"},
        "suggest": {"salesPm": "helen-ashdown", "sa": "jun-wei-ong", "pm": "", "reason": "United Kingdom and Ireland: default owners of AMU."},
        "mails": [
            mail("2026-11-20T15:20:00+01:00", "Harriet Pell", "RE: M&F store refresh - quote - SF ref: HPELL20261105-246118"),
            mail("2026-11-14T16:48:00+01:00", "Tariq Haddad", "RE: M&F store refresh - quote - SF ref: HPELL20261105-246118"),
            mail("2026-11-05T10:31:00+01:00", "Harriet Pell", "M&F store refresh - SF ref: HPELL20261105-246118"),
        ],
    },
    {
        "id": "opp-0008",
        "title": "Storage migration, Sao Paulo and Santiago",
        "customer": "Solvik Energy",
        "countries": ["BR", "CL"], "salesRegions": ["latam"],
        "refs": [{"type": "SF PS", "value": "RCAST20261112-247744"}],
        "summary": "Migration of two storage systems to new arrays, with Portuguese- and Spanish-speaking engineers on site. The scope call has taken place. Two threads were merged here because both carry the same Salesforce reference; one of them is about a licence question and may belong to a separate request.",
        "stakeholders": [
            who("Rafael Castanho", "Evernex", "Account manager Latin America", "sales"),
            who("Marina Oyarzun", "Solvik Energy", "Storage team lead", "customer"),
        ],
        "timeline": [
            step("2026-11-12", "Request opened in Salesforce."),
            step("2026-11-19", "Scope call with the customer."),
            step("2026-11-23", "Licence question raised in a second thread with the same reference."),
        ],
        "deadline": "2026-12-01", "deadlineNote": "Customer asked for a budget figure by this date",
        "nextAction": {"text": "Write the migration approach and the budget figure", "due": "2026-11-28"},
        "suggest": {"salesPm": "hector-salgado", "sa": "trevor-lindgren", "pm": "teresa-villanueva", "reason": "Brazil and Chile: default owners of LATAM, who sit in the NORAM team."},
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
        "countries": ["DE", "NL", "BE", "PL"], "salesRegions": ["nece"],
        "refs": [{"type": "SF PS", "value": "LBRAN20261002-241960"}],
        "summary": "Staging in the warehouse and on-site installation of 600 routers in four countries. The customer signed in mid November; the project has been handed over to delivery and is being set up.",
        "stakeholders": [
            who("Lena Brandt", "Evernex", "Account manager DACH", "sales"),
            who("Pieter Vandenberg", "Kestrel Mobility", "Program lead", "customer"),
            who("Katrin Wendel", "Evernex", "Project manager", "proserv"),
        ],
        "timeline": [
            step("2026-10-02", "Request opened in Salesforce."),
            step("2026-10-23", "Offer sent."),
            step("2026-11-16", "Customer signed."),
            step("2026-11-18", "Handover to delivery."),
            step("2026-12-02", "Kick-off planned."),
        ],
        "deadline": None,
        "nextAction": {"text": "Agree the kick-off agenda with the customer", "due": "2026-11-30"},
        "suggest": {"salesPm": "jonas-pfeiffer", "sa": "florian-achterberg", "pm": "katrin-wendel", "reason": "First country Germany: default owners of NECE."},
        "mails": [
            mail("2026-11-18T09:20:00+01:00", "Katrin Wendel", "RE: Kestrel router rollout - handover - SF ref: LBRAN20261002-241960"),
            mail("2026-11-16T13:55:00+01:00", "Lena Brandt", "RE: Kestrel router rollout - signed - SF ref: LBRAN20261002-241960"),
        ],
    },
    {
        "id": "opp-0010",
        "title": "Data centre relocation, Lyon",
        "customer": "Cassiopée Assurances",
        "countries": ["FR"], "salesRegions": ["swe"],
        "refs": [{"type": "SF PS", "value": "NDELA20260804-233571"}],
        "summary": "Relocation of 46 racks between two sites in Lyon, finished in October. The final invoice is with the customer; two partner invoices are still open.",
        "stakeholders": [
            who("Nadège Delacroix", "Evernex", "Account manager France", "sales"),
            who("Bertrand Achard", "Cassiopée Assurances", "Infrastructure manager", "customer"),
            who("Julien Carpentier", "Evernex", "Project manager", "proserv"),
        ],
        "timeline": [
            step("2026-08-04", "Request opened in Salesforce."),
            step("2026-10-18", "Relocation weekend."),
            step("2026-10-29", "Acceptance signed by the customer."),
            step("2026-11-12", "Final invoice sent."),
        ],
        "deadline": None,
        "nextAction": {"text": "Chase the two open partner invoices", "due": "2026-11-28"},
        "suggest": {"salesPm": "", "sa": "karim-benali", "pm": "julien-carpentier", "reason": "Site in France: default owners of SWE."},
        "mails": [
            mail("2026-11-19T11:44:00+01:00", "Julien Carpentier", "RE: Cassiopée déménagement Lyon - factures partenaires - SF ref: NDELA20260804-233571"),
            mail("2026-11-12T15:02:00+01:00", "Nadège Delacroix", "RE: Cassiopée déménagement Lyon - facture finale - SF ref: NDELA20260804-233571"),
        ],
    },
    {
        "id": "opp-0011",
        "title": "Tape library replacement, Dallas",
        "customer": "Redwater Freight",
        "countries": ["US"], "salesRegions": ["noram"],
        "refs": [{"type": "SF PS", "value": "GWHIT20261028-244903"}],
        "summary": "Replacement of two tape libraries including media migration. The purchase order arrived on 21 November. Sales asks who will run the project.",
        "stakeholders": [
            who("Gwen Whitaker", "Evernex", "Account manager US South", "sales"),
            who("Marcus Dellinger", "Redwater Freight", "Backup administrator", "customer"),
            who("Curtis Halloran", "Evernex", "Sales PM", "proserv"),
        ],
        "timeline": [
            step("2026-10-28", "Request opened in Salesforce."),
            step("2026-11-11", "Quote sent."),
            step("2026-11-21", "Purchase order received."),
            step("2026-11-23", "Sales asks for the project manager."),
        ],
        "deadline": None,
        "nextAction": {"text": "Name the project manager and plan the handover call", "due": "2026-11-26"},
        "suggest": {"salesPm": "curtis-halloran", "sa": "angela-kowalski", "pm": "melissa-ortega", "reason": "Site in the United States: default owners of NORAM."},
        "mails": [
            mail("2026-11-23T22:10:00+01:00", "Gwen Whitaker", "RE: Redwater tape libraries - PO received - SF ref: GWHIT20261028-244903"),
            mail("2026-11-21T20:35:00+01:00", "Marcus Dellinger", "RE: Redwater tape libraries - PO 4500871223"),
            mail("2026-11-11T17:20:00+01:00", "Curtis Halloran", "RE: Redwater tape libraries - quote - SF ref: GWHIT20261028-244903"),
        ],
    },
]


def assign(stage, sales_pm="", sa="", pm="", outcome="", note="", next_text="", next_who="", next_due=""):
    return {"salesPm": sales_pm, "sa": sa, "pm": pm, "salesRegion": "", "serviceRegions": [], "stage": stage, "outcome": outcome,
            "nextAction": {"text": next_text, "who": next_who, "due": next_due}, "note": note}


ASSIGN = {
    "opp-0002": assign("2", sa="florian-achterberg", note="Sales PM open: SWE has none, to be agreed with NORAM."),
    "opp-0004": assign("6", outcome="lost", note="Declined: the company is a partner, not a customer."),
    "opp-0005": assign("3.3", sales_pm="zara-qureshi", sa="jun-wei-ong"),
    "opp-0006": assign("3.4", sales_pm="jonas-pfeiffer", sa="florian-achterberg",
                       next_text="Finish the effort estimate for Vienna including the weekend option", next_who="florian-achterberg", next_due="2026-11-27"),
    "opp-0007": assign("4", sales_pm="helen-ashdown", sa="tariq-haddad"),
    "opp-0008": assign("3.1-3.2", sales_pm="hector-salgado", sa="trevor-lindgren"),
    "opp-0009": assign("8", sales_pm="jonas-pfeiffer", sa="florian-achterberg", pm="katrin-wendel"),
    "opp-0010": assign("12", sa="karim-benali", pm="julien-carpentier"),
    "opp-0011": assign("7", sales_pm="curtis-halloran", sa="angela-kowalski"),
}

SYNC_STATE = {
    "mode": "demo",
    "lastRunAt": "2026-11-24T10:15:00+01:00",
    "lastRunStatus": "ok",
    "mailsRead": 33,
    "note": "Demo data. The mailbox is not connected yet; people, customers, reference numbers and mails are invented.",
}


def write(path, doc):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    ids = {p["id"] for p in PEOPLE}
    assert len(ids) == len(PEOPLE), "duplicate person id"
    for d in DEFAULTS + [o["suggest"] for o in OPPS] + list(ASSIGN.values()):
        for key in ("salesPm", "sa", "pm"):
            assert not d.get(key) or d[key] in ids, f"unknown person {d[key]}"
    if SEED.exists():
        shutil.rmtree(SEED)
    write(SEED / "config" / "people.json", {"roles": ROLES, "people": PEOPLE})
    write(SEED / "config" / "regions.json", {
        "regions": REGIONS,
        "countries": [{"code": c, "name": n, "region": r, "team": t, "rateRegion": rate} for c, n, r, t, rate in COUNTRIES],
        "defaults": DEFAULTS,
    })
    for opp in OPPS:
        doc = dict(opp)
        doc.setdefault("needsReview", False)
        doc["mailCount"] = len(opp["mails"])
        doc["lastMailAt"] = max(m["date"] for m in opp["mails"])
        doc["firstMailAt"] = min(m["date"] for m in opp["mails"])
        write(SEED / "opps" / f"{opp['id']}.json", doc)
    for opp_id, doc in ASSIGN.items():
        write(SEED / "assign" / f"{opp_id}.json", {**doc, "updatedAt": "2026-11-24T10:15:00+01:00", "updatedBy": "seed"})
    write(SEED / "sync" / "state.json", SYNC_STATE)
    print(f"wrote {len(OPPS)} opportunities, {len(ASSIGN)} assignments, {len(PEOPLE)} people and sync state to seed/")


if __name__ == "__main__":
    main()
