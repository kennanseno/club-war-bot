export async function recordAttendance(update, record) {
  return update((data) => {
    const existing = data.attendance.find(
      (entry) =>
        entry.guildId === record.guildId &&
        entry.sessionDate === record.sessionDate &&
        entry.userId === record.userId,
    );
    if (existing) return 'duplicate';
    data.attendance.push({
      ...record,
      source: 'self',
      recordedAt: new Date().toISOString(),
    });
    return 'recorded';
  });
}

export async function addAttendanceManually(update, record) {
  return update((data) => {
    const existing = data.attendance.find(
      (entry) =>
        entry.guildId === record.guildId &&
        entry.sessionDate === record.sessionDate &&
        entry.userId === record.userId,
    );
    if (existing) return 'duplicate';
    data.attendance.push({
      ...record,
      source: 'admin',
      addedBy: record.addedBy,
      recordedAt: new Date().toISOString(),
    });
    return 'added';
  });
}

export async function recordLateReport(update, record) {
  return update((data) => {
    const existing = data.lateReports.find(
      (entry) =>
        entry.guildId === record.guildId &&
        entry.sessionDate === record.sessionDate &&
        entry.userId === record.userId,
    );
    if (existing) return 'duplicate';
    data.lateReports.push({
      ...record,
      recordedAt: new Date().toISOString(),
    });
    return 'recorded';
  });
}
