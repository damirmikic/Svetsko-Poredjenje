# SP Kvote

Web dashboard za poredjenje kvota srpskih kladionica za FIFA World Cup 2026.

App trenutno povlaci fudbalske kvote iz aktivnih sportsbook feedova, filtrira samo World Cup meceve i prikazuje ih u OddsPortal-style tabeli sa najboljim kvotama po ishodu.

## Pokretanje

Potreban je Node.js 18 ili noviji.

```bash
npm install
npm run dev
```

Zatim otvori:

```text
http://localhost:3000
```

Ako je port 3000 vec zauzet, pokreni na drugom portu:

```bash
PORT=3001 npm run dev
```

## API

### `GET /api/health`

Vraca osnovni status servera.

### `GET /api/odds`

Vraca normalizovane World Cup kvote, status feedova, najbolje kvote i value signale.

## Kladionice

Aktivni normalizatori:

- MerkurXtip
- MaxBet
- SoccerBet
- Superbet
- BalkanBet

Konfigurisani endpointi, ali normalizatori jos nisu ukljuceni:

- Mozzart

## Struktura

```text
server.js          Node HTTP server, proxy/fetch i normalizacija kvota
public/index.html  App shell
public/app.js      Dashboard logika i renderovanje
public/styles.css  UI stilovi
```

## Sledeci koraci

- Dodati konkretan normalizator za Mozzart.
- Dodati market switch za pobednika SP i grupne faze.
- Dodati cache sloj za feedove da se smanji broj spoljasnjih requestova.
- Dodati debug endpoint za proveru sirovih bookmaker payloadova.
