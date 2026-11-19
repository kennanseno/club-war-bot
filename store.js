import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FIX_PARTY_CLASSES, FIX_PARTY_TYPES } from './fix-party.js';

export const DATA_FILE = join(process.cwd(), 'data', 'club-war-data.json');

const EMPTY_DATA = Object.freeze({
  version: 1,
  guilds: {},
  fixParties: {},
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
  if (data.fixParties === undefined) data.fixParties = {};
  if (
    !data.fixParties ||
    typeof data.fixParties !== 'object' ||
    Array.isArray(data.fixParties)
  ) {
    throw new Error(`Invalid fixed-party records in ${filePath}; refusing to overwrite it.`);
  }
  for (const [guildId, parties] of Object.entries(data.fixParties)) {
    const userIds = new Set();
    const partyIds = new Set();
    const roleIds = new Set();
    if (!guildId || !Array.isArray(parties)) {
      throw new Error(`Invalid fixed-party records in ${filePath}; refusing to overwrite it.`);
    }
    for (const party of parties) {
      const members = party?.members;
      const leader = party?.leader;
      const validPerson = (person) =>
        person &&
        typeof person.userId === 'string' &&
        person.userId.length > 0 &&
        typeof person.displayName === 'string' &&
        typeof person.joinedAt === 'string' &&
        !Number.isNaN(Date.parse(person.joinedAt));
      if (
        !party ||
        typeof party.id !== 'string' ||
        !party.id ||
        typeof party.name !== 'string' ||
        !party.name.trim() ||
        party.name.length > 80 ||
        /[\u0000-\u001f\u007f]/.test(party.name) ||
        typeof party.leaderRoleId !== 'string' ||
        !party.leaderRoleId ||
        typeof party.memberRoleId !== 'string' ||
        !party.memberRoleId ||
        party.leaderRoleId === party.memberRoleId ||
        !validPerson(leader) ||
        ((leader.className !== undefined || leader.type !== undefined) &&
          (!FIX_PARTY_CLASSES.includes(leader.className) ||
            !FIX_PARTY_TYPES.includes(leader.type))) ||
        !Array.isArray(members) ||
        members.length > 7 ||
        members.some(
          (member) =>
            !validPerson(member) ||
            !FIX_PARTY_CLASSES.includes(member.className) ||
            !FIX_PARTY_TYPES.includes(member.type),
        )
      ) {
        throw new Error(`Invalid fixed-party records in ${filePath}; refusing to overwrite it.`);
      }
      if (partyIds.has(party.id)) {
        throw new Error(`Duplicate fixed-party ID in ${filePath}; refusing to overwrite it.`);
      }
      partyIds.add(party.id);
      for (const roleId of [party.leaderRoleId, party.memberRoleId]) {
        if (roleIds.has(roleId)) {
          throw new Error(`Duplicate fixed-party role in ${filePath}; refusing to overwrite it.`);
        }
        roleIds.add(roleId);
      }
      for (const person of [leader, ...members]) {
        if (userIds.has(person.userId)) {
          throw new Error(`Duplicate fixed-party member in ${filePath}; refusing to overwrite it.`);
        }
        userIds.add(person.userId);
      }
    }
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
