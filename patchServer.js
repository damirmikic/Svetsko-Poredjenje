import fs from 'fs';

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const kickOffTime = event\.time \? new Date\(event\.time \+ "Z"\)\.getTime\(\) : null;\r?\n\r?\n\s*matches\.push\(\{/,
  `const bfBack = eventData0.Betfair?.live_exchange_back;
        const bfMoneyFlow = bfBack ? {
          home: Number(bfBack.amount_1 || 0),
          draw: Number(bfBack.amount_X || 0),
          away: Number(bfBack.amount_2 || 0)
        } : null;

        const bfBackHistoryRaw = eventData0.Betfair?.history_exchange_back || [];
        const bfMoneyFlowHistory = bfBackHistoryRaw.map(item => ({
          updated: item.updated,
          home: Number(item.amount_1 || 0),
          draw: Number(item.amount_X || 0),
          away: Number(item.amount_2 || 0)
        }));

        const kickOffTime = event.time ? new Date(event.time + "Z").getTime() : null;

        matches.push({
          bfMoneyFlow,
          bfMoneyFlowHistory,`
);

content = content.replace(
  /odds,\r?\n\s*totalsByLine,\r?\n\s*\};\r?\n\s*\}\);/,
  `odds,
      totalsByLine,
      bfMoneyFlow: bookmaker.id === "betfair_lay" ? item.bfMoneyFlow : undefined,
      bfMoneyFlowHistory: bookmaker.id === "betfair_lay" ? item.bfMoneyFlowHistory : undefined,
    };
  });`
);

content = content.replace(
  /updatedAt: offer\.updatedAt,\r?\n\s*externalId: offer\.externalId,\r?\n\s*timeDiff: newDiff,\r?\n\s*\};/,
  `updatedAt: offer.updatedAt,
    externalId: offer.externalId,
    timeDiff: newDiff,
    bfMoneyFlow: offer.bfMoneyFlow,
    bfMoneyFlowHistory: offer.bfMoneyFlowHistory,
  };`
);

fs.writeFileSync(file, content);
