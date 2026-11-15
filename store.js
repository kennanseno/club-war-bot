import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const DATA_FILE = join(process.cwd(), 'data', 'club-war-data.json');

const EMPTY_DATA = Object.freeze({
  version: 1,
  guilds: {},
  attendance: [],
  lateReports: [],
  announcements: [],
});

function validateData(data, filePath) {
  if (
    !data ||
    data.version !== 1 ||
    !data.guilds ||
    typeof data.guilds !== 'object' ||
    Array.isArray(data.guilds) ||
    !Array.isArray(data.attendance) ||
    !Array.isArray(data.announcements)
  ) {
    throw new Error(`Invalid data structure in ${filePath}; refusing to overwrite it.`);
  }
  if (data.lateReports === undefined) data.lateReports = [];
  if (!Array.isArray(data.lateReports)) {
    throw new Error(`Invalid late-report records in ${filePath}; refusing to overwrite it.`);
  }
  for (const [guildId, settings] of Object.entries(data.guilds)) {
    if (
      !guildId ||
      !settings ||
      typeof settings.channelId !== 'string' ||
      !Array.isArray(settings.adminRoleIds) ||
      settings.adminRoleIds.some((roleId) => typeof roleId !== 'string')
    ) {
      throw new Error(`Invalid server settings in ${filePath}; refusing to overwrite it.`);
    }
  }
  if (
    data.attendance.some(
      (record) =>
        !record ||
        typeof record.guildId !== 'string' ||
        typeof record.sessionDate !== 'string' ||
        typeof record.userId !== 'string' ||
        typeof record.displayName !== 'string',
    ) ||
    data.lateReports.some(
      (record) =>
        !record ||
        typeof record.guildId !== 'string' ||
        typeof record.sessionDate !== 'string' ||
        typeof record.userId !== 'string' ||
        typeof record.displayName !== 'string',
    ) ||
    data.announcements.some((announcement) => typeof announcement !== 'string')
  ) {
    throw new Error(`Invalid attendance, late-report, or announcement records in ${filePath}; refusing to overwrite it.`);
  }
  return data;
}

export function createStore(filePath = DATA_FILE) {
  let writeQueue = Promise.resolve();

  async function read() {
    let content;
    try {
      content = await readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return structuredClone(EMPTY_DATA);
      throw new Error(`Unable to read bot data file ${filePath}: ${error.message}`, {
        cause: error,
      });
    }

    let data;
    try {
      data = JSON.parse(content);
    } catch (error) {
      throw new Error(`Unable to parse bot data file ${filePath}: ${error.message}`, {
        cause: error,
      });
    }
    return validateData(data, filePath);
  }

  async function write(data) {
    const directory = dirname(filePath);
    const temporaryPath = join(directory, `.club-war-data-${randomUUID()}.tmp`);
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      await rename(temporaryPath, filePath);
    } catch (error) {
      throw new Error(`Unable to save bot data file ${filePath}: ${error.message}`, {
        cause: error,
      });
    }
  }

  function update(mutator) {
    const operation = writeQueue.then(async () => {
      const data = await read();
      const result = await mutator(data);
      validateData(data, filePath);
      await write(data);
      return result;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  return { read, update };
}

const store = createStore();

export const readData = store.read;
export const updateData = store.update;
