const MAX_MESSAGE_LENGTH = 1800;
const COLUMN_COUNT = 4;

function escapeTableCell(value) {
  return value
    .replace(/[\r\n]/g, ' ')
    .replace(/`/g, "'")
    .replace(/\|/g, '\\|');
}

function formatRows(members) {
  const rows = [];
  for (let index = 0; index < members.length; index += COLUMN_COUNT) {
    const cells = members
      .slice(index, index + COLUMN_COUNT)
      .map((member, offset) => `${index + offset + 1}. ${escapeTableCell(member)}`);
    while (cells.length < COLUMN_COUNT) cells.push('');
    rows.push(cells);
  }
  return rows;
}

function formatTable(rows) {
  const widths = Array(COLUMN_COUNT).fill(0);
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index], cell.length);
    });
  }

  const border = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
  const formattedRows = rows.map(
    (row) =>
      `| ${row.map((cell, index) => cell.padEnd(widths[index])).join(' | ')} |`,
  );
  return [border, ...formattedRows, border].join('\n');
}

function formatMessage(title, rows) {
  return `${title}\n\`\`\`\n${formatTable(rows)}\n\`\`\``;
}

export function formatMemberTableMessages(title, members, emptyMessage) {
  if (members.length === 0) return [`${title}\n${emptyMessage}`];

  const rows = formatRows(members);
  const messages = [];
  let pageRows = [];

  for (const row of rows) {
    const candidateRows = [...pageRows, row];
    const pageTitle = messages.length === 0 ? title : `${title} (continued)`;
    if (
      formatMessage(pageTitle, candidateRows).length > MAX_MESSAGE_LENGTH &&
      pageRows.length > 0
    ) {
      messages.push(formatMessage(pageTitle, pageRows));
      pageRows = [row];
    } else {
      pageRows = candidateRows;
    }
  }

  const pageTitle = messages.length === 0 ? title : `${title} (continued)`;
  const finalMessage = formatMessage(pageTitle, pageRows);
  if (finalMessage.length > MAX_MESSAGE_LENGTH) {
    throw new Error('A member table row exceeds the Discord message length limit.');
  }
  messages.push(finalMessage);
  return messages;
}
