# Context voor nieuwe Claude Code chat — Niva Liften Dashboard

## Wie ben ik
Ik ben een automation builder / freelancer. Ik gebruik Claude Code (of andere IDE's) om technische taken direct uit te voeren (API calls, code deployen). Ik geef hoog-niveau instructies en verwacht dat Claude de technische uitvoering doet — niet uitleggen wat ik zelf moet doen, maar het direct doen.

Communiceer in het **Nederlands**.

---

## Bestaand project: Niva Liften AI Voice Gateway

### Wat is dit?
Een AI-gestuurde noodknop-automatisering voor liften (NEN-EN 81-28 compliant). Wanneer iemand in een lift vastzit, belt de lift automatisch. Twilio ontvangt de call, stuurt door naar een Retell AI voice agent, die het gesprek afhandelt en escalation beslissingen neemt. Dit kan dan daadwerkelijk nood zijn of een test call van een monteur.

### Tech stack
- **Twilio Studio** — ontvangt inkomende calls van lifttelefoons
- **Retell AI** — AI voice agent voert het gesprek
- **n8n** — automatisering/orkestratie (workflows)
- **Supabase** — database + file storage

---

## n8n Instantie
- **URL:** https://n8n.reflowautomations.nl
- **API Key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTNmNTI0NS1kYTZjLTQzMjktYTM0Yi03NmZkNWQ5ZDU2YjAiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNGU2NTYzMWItZDI1NS00YjEzLWI2ZmQtOTkxNzc3NWUzZGM5IiwiaWF0IjoxNzczNzQ4OTYzLCJleHAiOjE3ODE0NzQ0MDB9.83j9thTJe0qmTk2NAGl27eKqJslM_MN2Vz81_O2TD0o
- Hosted op Hostinger VPS via Coolify

---

## Supabase Project
- **Project URL:** https://qsdqiexuqxtcozqqgzhh.supabase.co
- **Dashboard:** https://supabase.com/dashboard/project/qsdqiexuqxtcozqqgzhh
- **Storage bucket:** `recordings` (bevat opgenomen gespreksaudio als .wav bestanden)
- In n8n zijn Supabase credentials aangemaakt onder de naam: **"Niva liften"** (credential ID: `9shOtHXgW1WGI81i`)

---

## Supabase Database Schema

### Tabel: `lifts`
| Kolom | Type | Omschrijving |
|-------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `phone_number` | TEXT | Telefoonnummer van de lift (zonder +, bijv. `3197044514712`) |
| `address` | TEXT | Adres van de lift (bijv. `Blanckenberghofstraat 1 t/m 28`) |
| `bedrijf` | TEXT | Naam van het bedrijf/gebouw (bijv. `MAASTRICHT - app. Blanckenberghofstraat`) |
| `postcode` | TEXT | Postcode (bijv. `6227 XN`) |
| `stad` | TEXT | Stad (bijv. `MAASTRICHT`) |
| `is_active` | BOOLEAN | Of de lift actief is |
| `last_test_at` | TIMESTAMPTZ | Tijdstip van laatste succesvolle test |
| `created_at` | TIMESTAMPTZ | Aanmaakdatum |

**Voorbeeld record:**
```json
{
  "id": "0034c19b-0116-4a5f-8905-095a52b5427b",
  "phone_number": "3197044514712",
  "address": "Blanckenberghofstraat 1 t/m 28",
  "bedrijf": "MAASTRICHT - app. Blanckenberghofstraat",
  "postcode": "6227 XN",
  "stad": "MAASTRICHT",
  "is_active": true,
  "last_test_at": null,
  "created_at": "2026-03-16 13:47:47+00"
}
```

---

### Tabel: `call_logs`
| Kolom | Type | Omschrijving |
|-------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `lift_id` | UUID (FK → lifts.id) | Welke lift |
| `call_sid` | TEXT (UNIQUE) | Twilio Call SID (bijv. `CAdf664966ef7a54ffbb9e53d4f1a6df5d`) |
| `retell_call_id` | TEXT | Retell's eigen call ID |
| `trace_id` | TEXT | Interne trace |
| `call_type` | TEXT | `test_automatisch`, `test`, `noodoproep`, `onbekend` |
| `status` | TEXT | `test_succes`, `noodoproep_actief`, `mens_geescaleerd`, `ai_afgehandeld`, `onbekend` |
| `from_number` | TEXT | Beller telefoonnummer |
| `start_time` | TIMESTAMPTZ | Start van het gesprek |
| `end_time` | TIMESTAMPTZ | Einde van het gesprek |
| `duration_seconds` | INTEGER | Gespreksduur in seconden |
| `transcript` | TEXT | Volledige gespreks-transcript |
| `audio_url` | TEXT | URL naar opname in Supabase Storage bucket `recordings` |
| `summary` | TEXT | AI-gegenereerde samenvatting van het gesprek |
| `sentiment` | TEXT | Emotie van de beller (bijv. `Kalm`, `Gestrest`) |
| `language` | TEXT | Gedetecteerde taal (bijv. `Nederlands`) |
| `occupancy` | TEXT | Aantal personen in de lift |
| `call_cost_usd` | NUMERIC(10,3) | Kosten van het gesprek in USD |
| `fallback_reason` | TEXT | Reden voor doorverbinden (bijv. `agent_hangup`) |
| `model_llm_version` | TEXT | Gebruikte LLM (bijv. `GPT 4.1 mini`) |
| `is_anonymized` | BOOLEAN | Of het gesprek geanonimiseerd is |
| `anonymized_at` | TIMESTAMPTZ | Wanneer geanonimiseerd |
| `queue_time_ms` | INTEGER | Wachttijd in milliseconden |
| `avg_confidence_score` | NUMERIC | Gemiddelde ASR confidence |
| `created_at` | TIMESTAMPTZ | Record aanmaakdatum |

**Voorbeeld record:**
```json
{
  "id": "3e313567-7992-485b-97e0-7fee16e9beb9",
  "lift_id": "390a7222-a5b3-4c2e-9ec0-473c30efc3fe",
  "call_sid": "CAdf664966ef7a54ffbb9e53d4f1a6df5d",
  "call_type": "test",
  "status": "test_succes",
  "start_time": "2026-03-17 15:54:00+00",
  "end_time": null,
  "duration_seconds": 32,
  "transcript": "Agent: U spreekt met de digitale assistent...",
  "audio_url": "https://qsdqiexuqxtcozqqgzhh.supabase.co/storage/v1/object/public/recordings/CAdf664966ef7a54ffbb9e53d4f1a6df5d.wav",
  "summary": "De gebruiker voerde een testgesprek...",
  "sentiment": "Kalm",
  "language": "Nederlands",
  "occupancy": "onbekend",
  "call_cost_usd": "0.063",
  "fallback_reason": "agent_hangup"
}
```

---

### Tabel: `noodoproepen`
| Kolom | Type | Omschrijving |
|-------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `locatie` | TEXT | Adres van de noodoproep |
| `datum` | TIMESTAMPTZ | Tijdstip van de noodoproep |
| `created_at` | TIMESTAMPTZ | Record aanmaakdatum |

---

## n8n Workflows (allemaal gebouwd en actief)

### 1. ⚡Niva liften - supabase updates - deel 1 - twillio
**Doel:** Wanneer Twilio een call ontvangt → zoek de lift op en maak een `call_logs` record aan.

**Flow:**
```
Webhook POST /twilio-start
  ├──> Respond 200 OK (direct)
  └──> Supabase: GET lifts WHERE phone_number = $body.lift_phone_number
         └──> Supabase: INSERT call_logs {call_sid, lift_id, start_time, call_type="onbekend", status="onbekend"}
```

---

### 2. ⚡Niva liften - supabase updates - deel 2 - retell - status update test en nood
**Doel:** Retell roept tijdens het gesprek een custom function aan om het call_type te updaten.

**Flow:**
```
Webhook POST /retell-triage
  ├──> Respond 200 OK (direct)
  └──> Supabase: UPDATE call_logs SET call_type=$body.call_type WHERE call_sid=$body.call_sid
```

**Inkomende payload:**
```json
{
  "call_sid": "CAdf664966ef7a54ffbb9e53d4f1a6df5d",
  "call_type": "noodoproep"  // of "test_automatisch"
}
```

---

### 3. ⚡Niva liften - supabase updates - deel 3 - retell - post call data
**Doel:** Na afloop van het gesprek stuurt Retell alle data → opslaan + audio uploaden naar Supabase Storage.

**Flow:**
```
Webhook POST /retell-post-call (Retell post-call webhook)
  ├──> Respond 200 OK (direct)
  └──> Code (JS): Parse Retell data
       {call_sid, retell_call_id, from_number, recording_url, transcript,
        duration_seconds, disconnection_reason, summary, sentiment,
        language, occupancy, call_cost_usd}
         └──> HTTP Request: GET Retell API /v2/get-call/{retell_call_id}
                └──> HTTP Request: Download audio van recording_url
                       └──> [UPLOAD AUDIO → Supabase Storage bucket "recordings"]  ← NOG TE BOUWEN
                              └──> Supabase UPDATE call_logs SET alle velden + audio_url
```

**Let op:** Het audio-upload stuk naar Supabase Storage is nog niet volledig geïmplementeerd. De download werkt al, maar de upload naar de bucket en het opslaan van de storage URL ontbreekt nog.

**Retell API credential:** Bearer token opgeslagen in n8n als "niva liften retell" (credential ID: `u24neHpOQUXjUdgj`)

---

### 4. ⚡Niva liften - supabase updates - deel 4 - twilio - call ended (ID: uKiCOt6cOUCclFFb)
**Doel:** Na afloop van het gesprek stuurt Twilio Studio end-of-call data.

**Flow:**
```
Webhook POST /twilio-call-ended-niva
  ├──> Respond 200 OK (direct)
  └──> Code (JS): Parse Twilio Studio data
         └──> Supabase: UPDATE call_logs SET end_time=$now, status=$final_triage_status
              WHERE call_sid=$call_sid
```

**Inkomende payload van Twilio Studio:**
```json
{
  "event": "studio_flow_ended",
  "call_sid": "{{trigger.call.CallSid}}",
  "from_number": "{{trigger.call.From}}",
  "ai_dial_status": "{{widgets.AI_agent.DialCallStatus}}",
  "ai_duration_seconds": "{{widgets.AI_agent.DialCallDuration}}",
  "final_triage_status": "{{widgets.check-alarm-status.parsed.status}}"
}
```

**Webhook URL:** `https://n8n.reflowautomations.nl/webhook/twilio-call-ended-niva`

---

### 5. ⚡Niva Liften noodknop workflows (ID: Tr3w1F24QIvqQEAl)
**Doel:** Centrale hub voor alle realtime events tijdens een gesprek. 4 webhook paden:

| Webhook pad | Actie |
|------------|-------|
| Pad 1: Get info | Retell vraagt lift-info op → Respond met bedrijf + adres |
| Pad 2: Registreer test | Update `lifts.last_test_at` = now |
| Pad 3: Doorverbinden mislukt | Zoek lift → Slack alert naar Rogier + Gmail naar Rogier & Mario |
| Pad 4: Noodoproep registratie | Zoek lift → insert in `noodoproepen` tabel |

---

## Volledige call lifecycle

```
[Lift belt]
    → Twilio Studio ontvangt call
    → Twilio stuurt naar n8n deel 1 (maak call_log aan)
    → Twilio verbindt door naar Retell AI agent
        → Retell AI voert gesprek
        → Retell roept n8n deel 2 aan (update call_type: test/noodoproep)
        → Retell roept noodknop workflows aan (get info, registreer test, etc.)
    → Retell hangt op
    → Retell stuurt post-call data naar n8n deel 3 (archiveer transcript + audio)
    → Control terug naar Twilio Studio
    → Twilio stuurt end-call data naar n8n deel 4 (sla end_time + status op)
```

---

## Wat nog moet worden gedaan

1. **Dashboard bouwen** — het grote volgende project (zie hieronder)

---

## Het nieuwe project: Niva Liften Dashboard

We gaan een **management dashboard** bouwen voor Niva Liften. Dit dashboard geeft inzicht in alle liftoproepen, test-statussen, noodoproepen, en kosten. Ook moet er een slim overzichtelijk lijst van alle liften en hun statusen etc.

Het dashboard moet de data uit Supabase ophalen en visualiseren.

**Technologie:** nog te bepalen (React/Next.js, of een no-code tool als Retool/Softr, of een custom HTML/JS dashboard)

**Gewenste views (initieel idee):**
- Overzicht alle liften + status laatste test (`last_test_at`)
- Call log overzicht (filter op call_type, status, datum)
- Noodoproepen overzicht
- Audio afspelen vanuit dashboard
- Kosten overzicht (call_cost_usd per periode)
- Transcript inzien per gesprek

---

## Werkwijze voor Claude (of andere IDE) in de nieuwe chat

- **Voer alles direct uit** via API calls (n8n API, Supabase REST, etc.) — geef geen instructies die ik zelf moet uitvoeren tenzij het echt niet anders kan
- **Communiceer in het Nederlands**
- **Gebruik altijd de nieuwste node versies** in n8n
- Als je n8n workflows maakt: gebruik curl naar `https://n8n.reflowautomations.nl/api/v1/workflows` met de API key hierboven
- Als je Supabase queries/schema aanpassingen nodig hebt die niet via API kunnen: geef me de SQL en ik run die in de Supabase SQL Editor

## Hier variabelen die je nodig zal hebben (voor .env)

anon supabase key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZHFpZXh1cXh0Y296cXFnemhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NTk2NzgsImV4cCI6MjA4OTIzNTY3OH0.zab4zv0P3cVdSXiZ90AT9695WuDc-NYQL9oLmf7Aa08

supabase url: https://qsdqiexuqxtcozqqgzhh.supabase.co


## 🔒 Authenticatie, RLS & Storage (Cruciale regels voor de frontend)

Omdat we met privacygevoelige data en audio werken, gelden de volgende harde eisen voor de applicatie:

1. **Inloggen vereist (Supabase Auth):** Het dashboard mag niet openbaar toegankelijk zijn. Bouw een simpele login-pagina via Supabase Auth (Email/Password). je kan via de app geen profiel aanmaken dit moet handmatig door de maker.
2. **Row Level Security (RLS):** Momenteel is de database en de storage bucket volledig dichtgetimmerd (alleen `service_role` heeft toegang voor de n8n webhooks). 
   - **Jouw taak:** Schrijf de benodigde SQL RLS-policies zodat gebruikers met de rol `authenticated` de data in `lifts`, `call_logs` en `noodoproepen` mogen lezen (`SELECT`). Geef mij de SQL-code, dan voer ik die uit in de editor.
3. **Audio afspelen (Private Bucket):** De bucket `recordings` staat op `public: false`. Om de .wav bestanden in de browser af te spelen, MOET je de Supabase `createSignedUrl` methode gebruiken via de frontend client.

---



## 🛠️ Tech Stack & Uitvoering Dashboard

We gaan het custom bouwen met code (geen no-code tool). 

- **Framework:** Next.js (App Router) met TypeScript.
- **Styling & UI:** Tailwind CSS + shadcn/ui componenten. Gebruik Recharts of Tremor voor simpele grafieken (zoals kosten of aantal calls per week).
- **Hosting:** Focus op een schone, dockerize-bare build. Ik host het later zelf via Coolify op mijn VPS.

**Jouw eerste stap:** Zet het Next.js project op, installeer de basis dependencies (Supabase, Tailwind, shadcn), configureer de Supabase client en bouw een simpele inlogpagina. Let's go!

## 🚀 Deployment Instructies voor Claude Code

Ik wil dat jij (Claude) de deployment volledig voor me afhandelt. Ik wil zelf niet in server-configuraties duiken. 

**Locatie:** We deployen naar mijn Hostinger VPS waar Coolify op draait (NIET de Hetzner Asterisk server).

**Jouw taken voor deployment:**
1. Zorg dat het project een werkende `Dockerfile` en `.dockerignore` heeft die geschikt is voor een Next.js productie-build.
2. Ik geef je in de chat mijn SSH-commando (bijv. `ssh root@123.45.67.89`). Jij mag dit gebruiken om in de server in te loggen.
3. Zet de code op de server (via git clone of scp) en configureer de container of vertel me exact welk knopje ik in mijn Coolify-dashboard moet indrukken als je het via GitHub doet. (Voorkeur: push de code naar mijn GitHub repo en vertel me hoe ik die koppel in Coolify, dat is de schoonste manier).
4. Zorg dat de `.env` variabelen correct op de productie-omgeving terechtkomen.