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
- `/api/odds` i `/api/health` se rewrite-uju na Netlify Functions preko `netlify.toml`.

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
- `PINNACLE_USE_LEAGUES_LOOKUP` default `false`; na Netlify ostavi `false` jer Pinnacle `leagues` endpoint moze vratiti 403, dok direktni `odds/league` radi preko `PINNACLE_LEAGUE_CODE`.
- `PINNACLE_ODDS_TYPE`, `PINNACLE_VERSION`, `PINNACLE_SPECIAL_VERSION` default `1`, `0`, `0`.
- `FEED_TIMEOUT_MS` default `4000`; kratak timeout pomaze da Netlify Function vrati parcijalne podatke umesto 502 kada neki feed visi.

## Golovi

Prikaz golova prati Pinnacle liniju po mecu: prvo se koristi 2.5 ako Pinnacle ima over i under, a ako nema 2.5 pokusava se fallback na 3.5. Kladionice se porede samo na izabranoj liniji za taj mec.

## No-vig kolona

Prva kolona u tabeli je `Pinnacle no-vig`. Server uzima Pinnacle kvote i skida marginu Shin metodom za 1X2 i izabranu liniju golova. Ta kolona je referenca za bojenje kvota, nije kladionica i ne ulazi u racunanje najbolje kladionicarske kvote ili margine.

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

## Normalizacija imena timova

Kladionice salju razlicite oblike istog imena (`Man Utd`, `Manchester Utd`, `Manchester United FC`).
Spajanje ponuda radi `public/shared/teams.js`, koji koristi i server i browser, u cetiri sloja:

1. `canonicalizeTeam` - mala slova, skidanje dijakritika i interpunkcije.
2. `ALIAS_ENTRIES` - rucna tabela za imena koja se ne mogu izvesti algoritmom
   (egzonimi tipa `holandija` -> Netherlands).
3. `teamTokens` - skidanje klupskih prefiksa (`FC`, `AFC`, `VfB`, godine tipa `04`)
   i sirenje skracenica (`utd` -> `united`). Ovaj sloj pokriva vecinu varijanti.
4. `teamSimilarity` - fuzzy poredjenje za ostatak.

Utakmica se spaja tek kada **oba** tima predju prag (`0.72`), i odbija se kada su dva
kandidata preblizu (`margin 0.08`). Spajanje pogresnih meceva bi prikazalo tudje kvote
u istom redu, sto je gore nego da reda nema.

Kada oba imena postoje u `ALIAS_ENTRIES` a razlicita su, tretiraju se kao razliciti timovi.
To je jedini nacin da se razdvoje `Guinea` / `Guinea-Bissau` od `Nottingham` / `Nottingham Forest` -
strukturno su isti slucaj, pa rucna tabela mora da presudi.

Ponude koje se ne uparе vracaju se u `unmatched` polju `/api/odds` i prikazuju se
ispod tabele, da bi imena koja nedostaju bila vidljiva umesto da tiho nestanu.

```bash
npm test
```

## Struktura

```text
server.js               Node HTTP server, proxy/fetch i normalizacija kvota
netlify.toml            Netlify build, functions i API rewrite konfiguracija
netlify/functions       Serverless API entrypoint za Netlify
public/index.html       App shell
public/app.js           Dashboard logika i renderovanje
public/shared/teams.js  Normalizacija imena i uparivanje meceva (server + browser)
public/styles.css       UI stilovi
test/                   node:test testovi
```

## Sledeci koraci

- Dodati market switch za pobednika SP i grupne faze.
- Dodati cache sloj za feedove da se smanji broj spoljasnjih requestova.
- Dodati debug endpoint za proveru sirovih bookmaker payloadova.
