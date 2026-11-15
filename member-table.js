const MAX_MESSAGE_LENGTH = 1800;
const COLUMN_COUNT = 4;
const TABLE_HEADER = `${'|  '.repeat(COLUMN_COUNT)}|\n${'| --- '.repeat(COLUMN_COUNT)}|`;

function escapeTableCell(value) {
  return value
    .replace(/[\r\n]/g, ' ')
    .replace(/([\\*_`~|>])/g, '\\$1');
}

function formatRows(members) {
  const rows = [];
  for (let index = 0; index < members.length; index += COLUMN_COUNT) {
    const cells = members
      .slice(index, index + COLUMN_COUNT)
      .map((member, offset) => `${index + offset + 1}. ${escapeTableCell(member)}`);
    while (cells.length < COLUMN_COUNT) cells.push('');
    rows.push(`| ${cells.join(' | ')} |`);
  }
  return rows;
}

export function formatMemberTableMessages(title, members, emptyMessage) {
  if (members.length === 0) return [`${title}\n${emptyMessage}`];

  const rows = formatRows(members);
  const messages = [];
  let content = `${title}\n${TABLE_HEADER}`;

  for (const row of rows) {
    const next = `${content}\n${row}`;
    if (next.length > MAX_MESSAGE_LENGTH && content !== `${title}\n${TABLE_HEADER}`) {
      messages.push(content);
      content = `${title} (continued)\n${TABLE_HEADER}\n${row}`;
    } else {
      content = next;
    }
  }

  messages.push(content);
  return messages;
}
