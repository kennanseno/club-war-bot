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
      return `${month}-${day}-${year} ${hour}:${minute}`;
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
  return `${parts.month}-${parts.day}-${parts.year} ${parts.hour}:${parts.minute}`;
}

function getTimestampOrderValue(timestamp) {
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(timestamp);
  if (localMatch) {
    const [, yearText, monthText, dayText, hourText, minuteText] = localMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day ||
      hour >= 24 ||
      minute >= 60
    ) {
      throw new Error(`Invalid recorded timestamp: ${timestamp}`);
    }
    return Date.UTC(year, month - 1, day, hour - 8, minute);
  }

  const orderValue = Date.parse(timestamp);
  if (Number.isNaN(orderValue)) {
    throw new Error(`Invalid recorded timestamp: ${timestamp}`);
  }
  return orderValue;
}

export function sortByRecordedAt(records) {
  return [...records].sort((left, right) => {
    const leftOrder = left.recordedAt
      ? getTimestampOrderValue(left.recordedAt)
      : Number.POSITIVE_INFINITY;
    const rightOrder = right.recordedAt
      ? getTimestampOrderValue(right.recordedAt)
      : Number.POSITIVE_INFINITY;
    return leftOrder - rightOrder;
  });
}
