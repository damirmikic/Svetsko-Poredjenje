# Fudbal Kvote

Web dashboard za poredjenje kvota srpskih kladionica na fudbalskim takmicenjima.

Povlaci kvote iz aktivnih sportsbook feedova, filtrira mece po izabranom takmicenju i prikazuje ih u
OddsPortal-style tabeli sa najboljim kvotama po ishodu, value signalima i uporedjivanjem sa Pinnacle no-vig referencom.

## Takmicenja

Prebacivanje izmedju takmicenja klikom na tab u gornjoj traci:

| ID | Naziv |
|----|-------|
| `world-cup` | FIFA World Cup 2026 |
| `epl` | England – Premier League |
| `bundesliga` | Germany – Bundesliga |
| `ligue-1` | France – Ligue 1 |
| `serie-a` | Italy – Serie A |
| `laliga` | Spain – LaLiga |
| `champions-league` | UEFA Champions League |
| `europa-league` | UEFA Europa League |
| `conference-league` | UEFA Conference League |

## Prikazi (tabovi)

| Tab | Opis |
|-----|------|
| **1X2** | Konacni ishod — home / draw / away |
| **Danasnji mecevi** | Danasnji mecevi sa 1X2 i golovima 2.5 zajedno |
| **Golovi** | Over/Under 2.5 (ili 3.5 kao fallback po mecu) |
| **Ide dalje** | Nokaut faza — kvote ko prolazi dalje |
| **Mnozenje kvota** | Akumulator: najboljih X meca po favoritu ili golovima |
| **Neuparene** | Mecevi koje sistem nije mogao da upari, grupisani po kladionici |

## Kladionice

| ID | Naziv | Tip |
|----|-------|-----|
| `pinnacle` | Pinnacle | Primarni katalog meceva i referenca (no-vig) |
| `merkurxtip` | MerkurXtip | Dualsoft |
| `maxbet` | MaxBet | Dualsoft |
| `mozzartbet` | Mozzart | Mozzartbet |
| `superbet` | Superbet | Superbet |
| `balkanbet` | BalkanBet | NSoft |
| `soccerbet` | SoccerBet | Dualsoft |
| `betinasia` | BetInAsia | Oddsmath |
| `betfair_lay` | Betfair Lay | Oddsmath (referenca) |

Kladionice se mogu ukljuciti/iskljuciti toggle-ima u levom panelu.

## Caching i Performanse

Kako bi se sprecilo preopterecenje eksternih sportsbook API-ja i osigurali trenutni odzivi za frontend:

- **Feed-level Cache (60s)**: Svih 9 feedova (Pinnacle, MerkurXtip, MaxBet, SoccerBet, Mozzart, Superbet, BalkanBet, BetInAsia, Betfair Lay) se kesiraju na serveru po takmicenju na 60 sekundi.
- **Deduplikacija u toku (Request Coalescing)**: Vise istovremenih zahteva ka istom feedu dele jedan jedini aktivni HTTP poziv ka eksternom API-ju.
- **Asinhrono osvezavanje takmicenja (Fire-and-forget)**: Provera dostupnosti takmicenja (`refreshStaleCompetitionAvailability`) se izvrsava u pozadini, bez blokiranja `/api/odds` odgovora koji se iz memorije vraca za **<5 ms**.

## Pokretanje

Potreban je **Node.js 18** ili noviji.

```bash
npm install
npm run dev
```

Zatim otvori:

```
http://localhost:3000
```

Ako je port 3000 vec zauzet:

```bash
PORT=3001 npm run dev
```

## Netlify deploy

Repo je spreman za Netlify:

- **Build command**: `npm run build`
- **Publish directory**: `public`
- **Functions directory**: `netlify/functions`
- `/api/odds` i `/api/health` se rewrite-uju na Netlify Functions putem `netlify.toml`

Lokalne kredencijale drzi u `.env` fajlu. `.env` je ignorisan u git-u; koristi `.env.example` kao sablon.

## Konfiguracija (`.env`)

### Pinnacle

| Promenljiva | Default | Opis |
|-------------|---------|------|
| `PINNACLE_API_BASE` | `https://www.pinnacle888.com/sports-service/sv/euro` | Base URL za Pinnacle API |
| `PINNACLE_SPORT_ID` | `29` | Sport ID (29 = soccer) |
| `PINNACLE_LOCALE` | `en_US` | Locale za Pinnacle odgovore |
| `PINNACLE_LEAGUE_CODE` | `fifa-world-cup` | Liga za `odds/league` endpoint |
| `PINNACLE_LEAGUE_IDS` | *(prazno)* | Comma-separated lista liga; kada je prazno, koristi `PINNACLE_LEAGUE_CODE` |
| `PINNACLE_USE_LEAGUES_LOOKUP` | `false` | Ukljuci da server trazi ligu iz Pinnacle `leagues` feeda; ostavi `false` na Netlify jer `leagues` moze da vrati 403 |
| `PINNACLE_ODDS_TYPE` | `1` | Tip kvota |
| `PINNACLE_VERSION` | `0` | Version parametar |
| `FEED_TIMEOUT_MS` | `4000` (lokalno) / `6000` (Netlify) | Timeout po feedu |

### PS3838 (opcioni, za direktni Pinnacle API)

| Promenljiva | Default | Opis |
|-------------|---------|------|
| `PS3838_ENABLED` | `false` | Ukljuci PS3838 feed |
| `PS3838_API_BASE` | `https://api.ps3838.com` | API base |
| `PS3838_USERNAME` | — | API korisnik |
| `PS3838_PASSWORD` | — | API lozinka |
| `PS3838_SPORT_ID` | `29` | Sport ID |
| `PS3838_LEAGUE_IDS` | — | Comma-separated lista liga |
| `PS3838_ODDS_FORMAT` | `Decimal` | Format kvota |

## API

### `GET /api/health`

Vraca osnovni status servera i broj kladionica.

### `GET /api/odds?competition=<id>`

Parametar `competition` je opcion (default: `world-cup`).

Odgovor sadrzi:

| Polje | Opis |
|-------|------|
| `matches` | Lista meceva sa kvotama, best/margin, kickoff vreme |
| `feeds` | Status svakog feeda (ok/error), `cached` fleg, broj meceva |
| `unmatched` | Ponude koje nisu mogle biti uparene |
| `opportunities` | Value bets (kvota iznad Pinnacle no-vig praga) |
| `filter.fixtureSource` | Koja kladionica je bila master za listu meceva |
| `filter.note` | Upozorenje ako Pinnacle nije bio dostupan |

## No-vig kolona

Prva kolona tabele (`Pinnacle no-vig`) prikazuje Pinnacle kvote ociscene od margine
**Shin metodom**. Ona je referenca za bojenje vrednih kvota — nije kladionica i ne ulazi
u racunanje `best` kolone ni margine.

## Golovi

Prikaz golova prati Pinnacle liniju po mecu:

- Primarna linija: **2.5**
- Fallback: **3.5** (ako Pinnacle nema 2.5 za taj mec)

Kladionice se porede samo na liniji koju je Pinnacle odredio za taj mec.

## Mnozenje kvota (Akumulator)

Tab bira narednih X meceva i prikazuje:

- **Leaderboard** — koja kladionica ima najveci product kvota
- **Tabela legova** — svaki mec sa kvotama po kladionici, favorit i Pinnacle referenca

Parametri u levom panelu:

- **Broj meceva (X)**: 2–15
- **Tip opklade**: Favorit (1X2) ili Over 2.5 (golovi)

## Neuparene utakmice

Tab **Neuparene** prikazuje ponude koje sistem nije uspeo da upari, grupisane po izvoru
(kladionici). Broj neuparenih je vidljiv na tab badge-u bez otvaranja taba.

Za svaki neuparen mec prikazuju se:

- Timovi onako kako ih ta kladionica salje
- Kickoff vreme
- Razlog (`no-candidates`, `score-too-low`, `ambiguous`)
- Najblizi kandidat i skor slicnosti

### Dodavanje aliasa

Kada se nepoznato ime pojavi u Neuparenim, dodaj ga u:

```
public/shared/team-aliases.js
```

To je jedini fajl koji treba menjati — alias logika ostaje u `teams.js`.

## Normalizacija imena timova

Kladionice salju razlicite oblike istog imena (`Man Utd`, `Manchester Utd`, `Manchester United FC`).
Spajanje radi `public/shared/teams.js`, koji koriste i server i browser, u cetiri sloja:

1. **`canonicalizeTeam`** — mala slova, skidanje dijakritika i interpunkcije
2. **`TEAM_ALIASES`** — rucna tabela iz `team-aliases.js` za egzonime i nestandardne oblike
3. **`teamTokens`** — skidanje klupskih prefiksa (`FC`, `AFC`, `VfB`, godine `04`)
   i sirenje skracenica (`utd` → `united`, `man` → `manchester`, `spurs` → `tottenham`)
4. **`teamSimilarity`** — fuzzy Jaccard poredjenje za ostatak

Utakmica se spaja tek kada **oba** tima predju prag (`0.72`) i odbija se kada su dva
kandidata preblizu (margin `0.08`). Spajanje pogresnih meceva bi prikazalo tudje kvote
u istom redu — sto je gore nego da reda nema.

## Primarni izvor fixture liste

Pinnacle je primarni `sourceOfTruth` — njegova lista meceva odredjuje koja se takmicenja
prikazuju i kako se timovi zovu u tabeli.

Kada Pinnacle nije dostupan, server automatski pada back na **BetInAsia (Oddsmath)** kao
sekundarni izvor fixture liste (puna engleska imena timova). U tom slucaju frontend prikazuje:

```
⚠ Pinnacle nedostupan — lista meceva od BetInAsia.
```

## Promene kvota

Svakih 30 sekundi se povlaci novi snapshot. Kada se kvota promeni za vise od zadatog praga
(default 3%), prikazuje se modal sa listom promena i smerom kretanja (gore/dole).
Prag se podesava klizacem **Promena kvote** u levom panelu.

## Testovi

```bash
npm test
```

## Struktura projekta

```
server.js                         Node HTTP server, fetch, feed caching i normalizacija kvota
netlify.toml                      Netlify build, functions i API rewrite konfiguracija
netlify/functions/odds.js         Serverless API entrypoint
netlify/functions/health.js       Health check endpoint
public/index.html                 App shell
public/app.js                     Dashboard logika, renderovanje, state
public/styles.css                 UI stilovi
public/shared/teams.js            Uparivanje meceva — logika (server + browser)
public/shared/team-aliases.js     Rucna tabela aliasa — ovde se dodaju nova imena
test/                             node:test testovi (aggregate, teams, cache)
```
