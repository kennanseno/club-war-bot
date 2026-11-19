export const FIX_PARTY_MAX_SIZE = 8;
export const FIX_PARTY_LEADER_ROLE_NAME = 'Fix Party Leader';
export const FIX_PARTY_CLASSES = Object.freeze([
  'Swordsman',
  'Brawler',
  'Archer',
  'Shaman',
]);
export const FIX_PARTY_TYPES = Object.freeze(['Pow', 'Dex', 'Int']);

export function getUserParty(parties, userId) {
  for (const party of parties) {
    if (
      party.leader.userId === userId ||
      party.members.some((member) => member.userId === userId)
    ) {
      return party;
    }
  }
  return undefined;
}

export function getPartyLedBy(parties, userId) {
  return parties.find((party) => party.leader.userId === userId);
}

export function validateFixPartyAdd({ parties, party, actorId, user, className, type }) {
  if (!party || party.leader.userId !== actorId) {
    return 'You must be the leader of a fixed party to add members.';
  }
  if (!user?.id) return 'Select a server member to add.';
  if (user.bot) return 'Bot accounts cannot be added to a fixed party.';
  if (user.id === actorId) return 'You are already the leader of this fixed party.';
  if (!FIX_PARTY_CLASSES.includes(className)) {
    return `Choose a valid class: ${FIX_PARTY_CLASSES.join(', ')}.`;
  }
  if (!FIX_PARTY_TYPES.includes(type)) {
    return `Choose a valid type: ${FIX_PARTY_TYPES.join(', ')}.`;
  }
  if (getUserParty(parties, user.id)) {
    return 'That member already belongs to a fixed party in this server.';
  }
  if (1 + party.members.length >= FIX_PARTY_MAX_SIZE) {
    return 'This party is full. A fixed party can have at most 8 people: 1 leader and 7 members.';
  }
  return undefined;
}

export function formatFixPartyList(parties) {
  if (parties.length === 0) return ['There are no fixed parties in this server yet.'];
  return parties.map((party) => {
    const members = [...party.members].sort(
      (left, right) =>
        left.joinedAt.localeCompare(right.joinedAt) ||
        left.userId.localeCompare(right.userId),
    );
    const slots = [
      `1. Party Leader — <@${party.leader.userId}>${party.leader.className && party.leader.type ? ` — ${party.leader.className} / ${party.leader.type}` : ''}`,
      ...members.map(
        (member, index) =>
          `${index + 2}. <@${member.userId}> — ${member.className} / ${member.type}`,
      ),
    ];
    while (slots.length < FIX_PARTY_MAX_SIZE) {
      slots.push(`${slots.length + 1}. Empty slot`);
    }
    return `**${party.name}**\n${slots.join('\n')}`;
  });
}

export function splitDiscordMessages(content, maxLength = 1900) {
  const messages = [];
  let current = '';
  for (const section of content) {
    const next = current ? `${current}\n\n${section}` : section;
    if (next.length > maxLength && current) {
      messages.push(current);
      current = section;
    } else {
      current = next;
    }
  }
  if (current) messages.push(current);
  return messages;
}
