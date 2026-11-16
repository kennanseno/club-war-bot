import { formatWarDate } from './schedule.js';
import { formatMemberTableMessages } from './member-table.js';
import { formatManilaTimestamp, sortByRecordedAt } from './timestamps.js';

export function formatAttendanceListMessages(
  sessionDate,
  attendance,
  title,
  emptyMessage = 'No attendance recorded.',
) {
  const formattedDate = formatWarDate(sessionDate);
  const header =
    title ??
    `Attendance for ${formattedDate} (${attendance.length} member${attendance.length === 1 ? '' : 's'}):`;
  const members = sortByRecordedAt(attendance).map(
    (record) =>
      `${record.displayName}${record.source === 'admin' ? ' (added by admin)' : ''} (recorded ${record.recordedAt ? formatManilaTimestamp(record.recordedAt) : 'time unavailable'})`,
  );
  return formatMemberTableMessages(header, members, emptyMessage);
}

export function formatLateListMessages(sessionDate, lateReports) {
  const formattedDate = formatWarDate(sessionDate);
  const members = sortByRecordedAt(lateReports).map(
    (record) =>
      `${record.displayName} (reported ${record.recordedAt ? formatManilaTimestamp(record.recordedAt) : 'time unavailable'})`,
  );
  const header = `Late notices for ${formattedDate} (${members.length} member${members.length === 1 ? '' : 's'}):`;
  return formatMemberTableMessages(
    header,
    members,
    `No members have reported that they will be late for the ${formattedDate} war.`,
  );
}
