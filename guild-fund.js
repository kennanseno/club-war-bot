export function formatGuildFundMessage(fund = {}) {
  return [
    '**Guild Fund**',
    `**EP (E-Points):** ${fund.ep ?? 'Not set'}`,
    `**Gold:** ${fund.gold ?? 'Not set'}`,
    `**PHP (Cash):** ${fund.php ?? 'Not set'}`,
  ].join('\n');
}

export function formatGuildFundInfoMessage() {
  return [
    '**Guild Fund Commands**',
    '`/guild-fund view` — view current EP, Gold, and PHP balances (anyone).',
    '`/war-admin fund ep value:<text>` — update the EP (E-Points) balance (authorized admins).',
    '`/war-admin fund gold value:<text>` — update the Gold balance (authorized admins).',
    '`/war-admin fund php value:<text>` — update the PHP cash balance (authorized admins).',
    '`/war-admin fund channel channel:<channel>` — choose where updates are announced (authorized admins).',
    'After the announcement channel is set, EP, Gold, or PHP updates post all latest balances there and mention `@everyone`.',
  ].join('\n');
}

export function getGuildFundAnnouncement(settings, updatedType) {
  const announcements = {
    ep: {
      title: '**EP fund update!**',
      detail: 'E-Points just got a fresh boost. Here is the latest guild stash:',
    },
    gold: {
      title: '**Gold fund update!**',
      detail: 'The guild Gold fund just got a fresh update. Here is the latest guild stash:',
    },
    php: {
      title: '**PHP cash fund update!**',
      detail: 'The guild cash balance just got a fresh update. Here is the latest guild stash:',
    },
  };
  const announcement = updatedType ? announcements[updatedType] : null;

  return {
    content:
      announcement
        ? `@everyone\n${announcement.title}\n${announcement.detail}\n\n${formatGuildFundMessage(settings)}`
        : `@everyone\n${formatGuildFundMessage(settings)}`,
    allowed_mentions: { parse: ['everyone'] },
  };
}

export function updateGuildFund(update, guildId, changes) {
  return update((data) => {
    data.guildFunds[guildId] ??= {};
    Object.assign(data.guildFunds[guildId], changes);
    return { ...data.guildFunds[guildId] };
  });
}

export async function migrateLegacyGuildFunds(readMainData, updateMainData, updateFundData) {
  const mainData = await readMainData();
  const legacyFunds = Object.entries(mainData.guilds)
    .filter(([, settings]) => settings.guildFund !== undefined)
    .map(([guildId, settings]) => [guildId, settings.guildFund]);

  await updateFundData((data) => {
    for (const [guildId, legacyFund] of legacyFunds) {
      const fund = (data.guildFunds[guildId] ??= {});
      for (const key of ['ep', 'gold', 'php', 'channelId']) {
        if (fund[key] === undefined && legacyFund[key] !== undefined) {
          fund[key] = legacyFund[key];
        }
      }
    }
  });

  if (legacyFunds.length === 0) return;

  await updateMainData((data) => {
    for (const [guildId] of legacyFunds) {
      delete data.guilds[guildId].guildFund;
    }
  });
}
