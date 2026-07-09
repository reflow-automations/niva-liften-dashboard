# AI Risk Management Plan - Reflow AI-Voice Agent Emergency Triage System

**Versie:** 1.3 (living document, aangeleverd door Rogier op 2026-07-09, geannoteerd door Claude)
**Kader:** EU AI Act (Annex III cat. 5d: evaluatie/prioritering van noodoproepen = hoog risico), NEN-EN 81-28:2022, AVG
**Provider:** Reflow Automations | **Klant:** Niva Liften B.V. (KVK 17182246)

---

## LET OP: implementatiestatus (toegevoegd 2026-07-09, actueel houden!)

Herkomst: dit dossier is grotendeels afkomstig uit Gemini-chats van maanden vóór juli 2026; verifieer elke claim tegen de actuele implementatie voordat het aan een auditor wordt gegeven. Dit dossier beschrijft deels de GEWENSTE eindstaat, niet overal de gebouwde realiteit. Voor een audit (Notified Body / AI Act) mag dit document alleen gebruikt worden nadat onderstaande discrepanties zijn opgelost of de tekst is afgezwakt naar wat er echt staat. Claimen wat niet bestaat is bij een audit schadelijker dan een eerlijke "gepland"-status.

| Dossier-claim | Werkelijke status 2026-07-09 |
|---|---|
| Pre-AI DTMF Intercept ("The Trap") | GEBOUWD: `gather_test_dtmf` in Twilio Studio (5s, keypress → log naar n8n → ACK `w*#` → hangup). P100/DTMF-'D'-specifieke handshake-details niet geverifieerd. |
| Dead Man Switch als mid-call media-watchdog met 4,5s latentiegrens en audio-stream-injectie | NIET zo gebouwd. Realiteit: Retell `end_call_after_silence_ms` = 15s (stilte-hangup) + Twilio Studio `fail`/`hangup`-transities naar noodcentrale + Hetzner hangup-propagation ~10s. Functioneel vergelijkbaar vangnet, technisch andere werking. Tekst aanpassen of feature bouwen. |
| R-02 Audio Energy Detection (>-40 dB meting vóór handshake) | NIET gebouwd (geen WebSocket audio-energy-meting bekend). WEL gebouwd (bevestigd door Rogier 2026-07-09): digitale microfoon- en speaker-boost via de Hetzner-server, voor verstaanbaarheid. Dat is een ander mechanisme dan energy-detectie; dossiertekst hierop aanpassen. |
| Systemic Kill Switch met MFA | DEELS: killswitch bestaat (Twilio-flow checkt `check-killswitch` + dashboard `/api/killswitch`), maar dashboard-login is wachtwoord, geen MFA. |
| R-06 Fallback on Unintelligibility (na 2 pogingen escaleren) | Gedrag zit deels in de Retell conversation flow; niet als harde regel geverifieerd. |
| R-07 Rate limiting 'High Traffic' per Lift-ID | NIET gebouwd. |
| 90 dagen auto-delete audio/transcripts | NIET gebouwd (geen retentiescript bekend). |
| 7 jaar beslissingslogs, AES-256 at rest | Supabase versleutelt at rest; een expliciet 7-jaars retentie/immutability-beleid is NIET ingericht. |
| Openingszin "U spreekt met de automatische assistent van Niva Liften..." | Agent zegt werkelijk: "U spreekt met de digitale assistent van de noodcentrale. Ik verbind u door. Vertel maar wat er aan de hand is." Gelijktrekken (transparantie-eis Art. 50). |
| Menselijke meldkamer Niva als fallback, Prio 1-protocol | NIEUW per 2026-07-09: "onbekend"-oproepen (bevestigde stille calls, Retell `inactivity`) gaan tijdens kantooruren naar het Niva-dashboard (oranje gloed + geluid + gecontroleerd-vinkje, herinnering na 5 min). Al het andere → noodcentrale (fail-safe). Buiten kantooruren alles → noodcentrale. |
| Auto-escalatie: onopgemerkte dashboard-melding escaleert na X min alsnog naar noodcentrale | BEWUST NIET GEBOUWD (besluit Rogier 2026-07-09): de oorspronkelijke oproep is dan al beëindigd en kan niet worden doorverbonden, en bij het volume aan onbekend-calls zou automatisch nabellen niet werkbaar zijn. In plaats daarvan: 3 geluidssignalen (binnenkomst, +5 min, +10 min) en een contractuele actieve opvolgplicht bij Niva (protocolafspraak art. 4/7). Escalatie na melding is de rol van Niva; Reflow heeft daar geen zicht op. |

Verzekering: personenschade voor AI-agent-werk gedekt, hoedanigheid "AI-agents" op polis SBZ76571, geverifieerd 2026-07-09 (bron: second-brain/context/niva-liften-verzekering-en-protocol.md).

---

## Origineel dossier (v1.3, ongewijzigd bewaard)

**Systeem Naam:** Reflow AI-Voice Agent Emergency Triage System
**Beoogd Doel (Intended Purpose):** Eerste-lijns spraaktriage en classificatie van noodoproepen vanuit personenliften.
**Risicoclassificatie:** Hoog Risico (EU AI Act Annex III, Categorie 5d: Systems to evaluate and prioritize emergency calls).
**Geharmoniseerde Normen:** NEN-EN 81-28:2022, NEN-EN 81-70 (Toegankelijkheid), EU spraak- en privacywetgeving (AVG/GDPR).

### DEEL 1: De Fail-Safe Architectuur (The Switches)

Om de inherente onvoorspelbaarheid van een Large Language Model (LLM) volledig te elimineren, is het systeem ontworpen volgens het strikte principe van Hardware & Telecom Superioriteit. De AI heeft nooit absolute controle over de lijn; de telecomlaag (Twilio) fungeert als de onafhankelijke, hard-coded toezichthouder.

**1. Pre-AI DTMF Intercept ("The Trap")**
Risicomitigatie: systeemvervuiling, databaseverstopping en kostenbloeding door de verplichte 3-daagse hardwaretesten. Twilio Studio heeft een initiële luisterfase (Gather Input, 5 seconden) die uitsluitend naar DTMF-machinecodes luistert. Een geautomatiseerde NEN-EN 81-28-test met DTMF-handshake wordt op telecomniveau afgevangen, gelogd via webhook in Supabase, beantwoord met een ACK-toon en afgesloten. De AI-engine en de meldkamer worden volledig omzeild.

**2. De "Dead Man Switch" (Mid-Call Watchdog)**
Risicomitigatie: mid-call LLM-freezes, netwerk-jitter, wegvallende verbindingen met de AI-centrale. Wettelijk kader: EU AI Act Art. 14 (menselijk toezicht). Als de AI-verbinding hapert of wegvalt, wordt de beller doorgeschakeld naar het noodnummer, zodat de passagier altijd verbonden blijft met een live hulplijn.

**3. De "Systemic Kill Switch" (Centrale Noodrem)**
Risicomitigatie: algoritmische hallucinaties na model-updates of grootschalige cloud-storingen. Wettelijk kader: EU AI Act Art. 15 (robuustheid). Een centrale kill switch in het beheer-dashboard deactiveert de volledige SIP-routering naar de AI; 100% van het liftverkeer gaat dan op telecomniveau naar de menselijke centrale.

### DEEL 2: Risicomatrix (samenvatting)

| ID | Risico | Kans | Ernst | Mitigatie | Status |
|---|---|---|---|---|---|
| R-01 | LLM-hallucinatie: echt noodgeval geclassificeerd als test/storing | Laag | Kritiek | Deterministic prompting; AI mag nooit zelf sluiten bij twijfel; default = transfer naar mens | Gemitigeerd |
| R-02 | Audio silent failure: SIP 200 OK maar geen output-geluid | Laag | Hoog | Audio energy detection vóór handshake (zie statusannotatie: niet gebouwd) | OPEN |
| R-03 | Infrastructuur-crash Retell/LLM-endpoints | Medium | Kritiek | Twilio 'fail'-transities → directe bypass naar PSTN/noodcentrale | Gemitigeerd |
| R-04 | Kostenbloeding door 3-daagse autotesten van ~800 liften | Hoog | Medium | Pre-AI DTMF Intercept | Gemitigeerd |
| R-05 | Akoestische feedbackloop (AI hoort eigen echo) | Hoog | Medium | Anti-echo prompting, negeren van herhalingen < 1200 ms | Gemitigeerd |
| R-06 | Taal-/spraakbarrière of onverstaanbare beller | Medium | Kritiek | Na 2 mislukte pogingen direct escaleren naar mens | Deels open |
| R-07 | Voorzienbaar misbruik (vandalisme, kinderen) | Hoog | Laag | Rate limiting per Lift-ID + versnelde escalatieroute | OPEN |
| R-08 (nieuw 2026-07-09) | Stille call ("onbekend") bereikt geen mens doordat dashboard onbemand is | Medium | Kritiek | Dashboard-melding met geluid + herinnering; contractuele bemannings- en opvolgplicht Niva; AANBEVOLEN: auto-escalatie naar noodcentrale na X min zonder vinkje | Deels open |

### DEEL 3: Data Governance & Transparantie (Art. 10, 12, 13, 50 / AVG)

1. **Privacy by design:** ruwe audio en transcripts (herleidbaar/biometrisch) na maximaal 90 dagen automatisch en definitief vernietigen, tenzij wettelijke vordering. (Statusannotatie: script nog inrichten.)
2. **Traceerbaarheid:** technische beslissingslogs, gespreksduren, API-responstijden, storingen en DTMF-testregistraties (geen persoonsgegevens) 7 jaar bewaren, versleuteld at rest. (Statusannotatie: retentiebeleid nog formaliseren.)
3. **Transparantieplicht:** de AI opent elk gesprek met een gestandaardiseerde melding dat het een automatische assistent betreft. (Statusannotatie: huidige openingszin wijkt af van dossiertekst; gelijktrekken.)

### DEEL 4: Menselijk Toezicht & Training (Art. 14)

1. **Monteurs-override:** monteurs kunnen zich met vooraf gedefinieerde trefwoorden identificeren; het systeem registreert "Onderhoud" en pauzeert escalatie.
2. **Menselijk fallback-protocol:** de menselijke meldkamer is de ultieme back-stop. Oproepen via de fallback-routes krijgen intern de hoogste prioriteit (Prio 1), omdat het om een potentieel niet-communicatieve beller of kritieke storing gaat.
3. **Nieuw per 2026-07-09, dashboard-protocol "onbekend":** bevestigde stille calls gaan tijdens kantooruren naar het Niva-dashboard. Niva treedt daarbij zelf op als hulpverleningsdienst: melding beoordelen (audio/transcript), opvolgen, afvinken. Harde eis uit het overleg met Mario (2026-07-08): een mens beslist, nooit de AI alleen.

---

Gerelateerd: `second-brain/context/niva-liften-verzekering-en-protocol.md` (verzekering + protocolafspraken), `twilio-flow-backup/` (flow-definities), wiki [[Niva liften dashboard liften]] en [[Niva liften retell agent]].
