import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const GUILD_FUND_DATA_FILE = join(
  process.cwd(),
  'data',
  'guild-fund-data.json',
);

const EMPTY_DATA = Object.freeze({
  version: 1,
  guildFunds: {},
});

function validateData(data, filePath) {
  if (
    !data ||
    data.version !== 1 ||
    !data.guildFunds ||
    typeof data.guildFunds !== 'object' ||
    Array.isArray(data.guildFunds) ||
    Object.entries(data.guildFunds).some(
      ([guildId, fund]) =>
        !guildId ||
        !fund ||
        typeof fund !== 'object' ||
        Array.isArray(fund) ||
        ['ep', 'gold', 'php', 'channelId'].some(
          (key) => fund[key] !== undefined && typeof fund[key] !== 'string',
        ),
    )
  ) {
    throw new Error(`Invalid guild fund data in ${filePath}; refusing to overwrite it.`);
  }
  return data;
}

export function createGuildFundStore(filePath = GUILD_FUND_DATA_FILE) {
  let writeQueue = Promise.resolve();

  async function read() {
    let content;
    try {
      content = await readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return structuredClone(EMPTY_DATA);
      throw new Error(`Unable to read guild fund data file ${filePath}: ${error.message}`, {
        cause: error,
      });
    }

    let data;
    try {
      data = JSON.parse(content);
    } catch (error) {
      throw new Error(`Unable to parse guild fund data file ${filePath}: ${error.message}`, {
        cause: error,
      });
    }
    return validateData(data, filePath);
  }

  async function write(data) {
    const directory = dirname(filePath);
    const temporaryPath = join(directory, `.guild-fund-data-${randomUUID()}.tmp`);
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      await rename(temporaryPath, filePath);
    } catch (error) {
      throw new Error(`Unable to save guild fund data file ${filePath}: ${error.message}`, {
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

const store = createGuildFundStore();

export const readGuildFundData = store.read;
export const updateGuildFundData = store.update;
