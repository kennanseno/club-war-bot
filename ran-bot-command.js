export const RAN_BOT_COMMAND = Object.freeze({
  name: 'ran-bot',
  description: 'Show Ran Online club and guild bot commands',
  type: 1,
  options: [
    {
      type: 1,
      name: 'info',
      description: 'Show current bot commands, schedule, and server settings',
    },
  ],
  integration_types: [0],
  contexts: [0],
});
