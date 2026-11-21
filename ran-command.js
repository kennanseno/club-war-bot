export const RAN_COMMAND = Object.freeze({
  name: 'ran',
  description: 'Show Ran Online club and guild commands for members',
  type: 1,
  options: [
    {
      type: 1,
      name: 'info',
      description: 'Show member commands and the club-war schedule',
    },
  ],
  integration_types: [0],
  contexts: [0],
});
