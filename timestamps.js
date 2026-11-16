const manilaTimestampFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function getManilaTimestamp(date = new Date()) {
  const parts = Object.fromEntries(
    manilaTimestampFormatter
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatManilaTimestamp(timestamp) {
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(timestamp);
  if (localMatch) {
    const [, year, month, day, hour, minute] = localMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day) &&
      Number(hour) < 24 &&
      Number(minute) < 60
    ) {
      return `${year}-${month}-${day} ${hour}:${minute}`;
    }
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid recorded timestamp: ${timestamp}`);
  }
  const parts = Object.fromEntries(
    manilaTimestampFormatter
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
