# SP Kvote

Web dashboard za poredjenje kvota srpskih kladionica za FIFA World Cup 2026.

App trenutno povlaci fudbalske kvote iz aktivnih sportsbook feedova, filtrira samo World Cup meceve i prikazuje ih u OddsPortal-style tabeli sa najboljim kvotama po ishodu.
Pinnacle je primarni katalog meceva kada je feed omogucen: ostale kladionice se kace samo na meceve koje Pinnacle vrati za World Cup.

## Pokretanje

Potreban je Node.js 18 ili noviji.

```bash
npm install
npm run dev
```

Lokalne kredencijale mozes drzati u `.env` fajlu. `.env` je ignorisan u git-u; koristi `.env.example` kao sablon.

Zatim otvori:

```text
http://localhost:3000
```

Ako je port 3000 vec zauzet, pokreni na drugom portu:

```bash
PORT=3001 npm run dev
```

## Netlify deploy

Repo je spreman za Netlify:

- Build command: `npm run build`
- Publish directory: `public`
- Functions directory: `netlify/functions`
- `/api/*` se rewrite-uje na Netlify Function preko `netlify.toml`.

U Netlify environment variables dodaj iste vrednosti koje koristis lokalno u `.env`, ako menjas default-e. Za trenutni setup je obicno dovoljan:

```text
PINNACLE_LEAGUE_CODE=fifa-world-cup
```

## Pinnacle feed

Opcioni parametri:

- `PINNACLE_API_BASE` default `https://www.pinnacle888.com/sports-service/sv/euro`
- `PINNACLE_SPORT_ID` default `29` za soccer
- `PINNACLE_LOCALE` default `en_US`
- `PINNACLE_LEAGUE_IDS` comma-separated lista liga; kada je prazno, server trazi World Cup ligu iz Pinnacle `leagues` feeda.
- `PINNACLE_LEAGUE_CODE` default `fifa-world-cup` za `odds/league` endpoint.
- `PINNACLE_ODDS_TYPE`, `PINNACLE_VERSION`, `PINNACLE_SPECIAL_VERSION` default `1`, `0`, `0`.

## No-vig kolona

Prva kolona u tabeli je `Pinnacle no-vig`. Server uzima Pinnacle kvote i skida marginu Shin metodom za 1X2 i 2.5 golove. Ta kolona je referenca za bojenje kvota, nije kladionica i ne ulazi u racunanje najbolje kladionicarske kvote ili margine.

Primer `.env`:

```text
PINNACLE_LEAGUE_CODE=fifa-world-cup
```

## API

### `GET /api/health`

Vraca osnovni status servera.

### `GET /api/odds`

Vraca normalizovane World Cup kvote, status feedova, najbolje kvote i value signale.

## Kladionice

Aktivni normalizatori:

- Pinnacle
- MerkurXtip
- MaxBet
- SoccerBet
- Superbet
- BalkanBet

## Struktura

```text
server.js          Node HTTP server, proxy/fetch i normalizacija kvota
netlify.toml       Netlify build, functions i API rewrite konfiguracija
netlify/functions  Serverless API entrypoint za Netlify
public/index.html  App shell
public/app.js      Dashboard logika i renderovanje
public/styles.css  UI stilovi
```

## Sledeci koraci

- Dodati market switch za pobednika SP i grupne faze.
- Dodati cache sloj za feedove da se smanji broj spoljasnjih requestova.
- Dodati debug endpoint za proveru sirovih bookmaker payloadova.
