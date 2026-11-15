# Club War Attendance Bot

This Discord bot sends club-war reminders and records attendance for wars held every Monday, Wednesday, and Saturday from 8:00 to 9:00 PM Philippines time (`Asia/Manila`).

## What it does

- Sends an initial `@everyone` reminder at 5:00 PM Manila time, preparation reminders at 6:00, 6:30, 7:00, and 7:30 PM, an 8:00 PM gamer-style war-start reminder, a 9:00 PM gamer-style war-end reminder, and a 9:30 PM attendance-close reminder. Every reminder ends by directing members to `/war-info` for command help. The start and end messages remind members to use `/attended` by 9:30 PM or they won't be counted for that war's salary. Other reminders explain member and admin commands.
- On days without a scheduled war, sends a 7:30 PM `@everyone` reminder clarifying there is no war tonight and showing the weekly war schedule and bot usage instructions.
- Reminders emphasize that regroup is at 7:30 PM, offline guild members are kicked at 7:40 PM, and members who will be late should use `/late` and select the war date to notify admins.
- Announces that attendance opens at the 7:30 PM regroup and closes at 9:30 PM.
- Lets members record themselves with `/attended` between 7:30 and 9:30 PM on war days. Replies are private and explain whether attendance was recorded, already existed, or was rejected. On non-war days, the reply includes the regular schedule and next session.
- Lets members use `/late date:DD-MM-YYYY` to privately report in advance that they will be late for a scheduled war. Each member is listed once per war date, and authorized admins can review reports with `/war-admin late date:DD-MM-YYYY`. Today and future war dates are accepted.
- Provides `/war-info` to show member and admin commands, the weekly schedule, attendance window, reminder times, and this server's configured channel and admin roles.
- Reminder messages use bold emphasis and blank lines between sections for readability.
- Posts an ordered, four-pair-per-row attendee table after the 9:30 PM close announcement to keep the roster compact. Names are shown without pinging attendees, and long lists are split into multiple messages.
- Provides `/war-admin` commands to configure the channel and admin roles, view attendance, and manually add a member to a scheduled session.

Schedule defaults and reminder text are centralized in [config.js](./config.js). The bot's server settings and attendance history are stored in `data/club-war-data.json`, which is ignored by Git. Keep a backup of this file if attendance history matters. The bot assumes one running process and a computer with durable project storage.

## Run locally

### 1. Install Node.js and dependencies

Use Node.js 18 or newer (Node.js 20 LTS is recommended). From the project folder, install dependencies:

```sh
npm install
node --version
```

### 2. Configure Discord credentials

Create a Discord application in the [Discord Developer Portal](https://discord.com/developers/applications), add a bot, and copy the application ID, bot token, and public key from the application's settings. Create a `.env` file in the project root based on [.env.sample](./.env.sample):

```env
APP_ID=<YOUR_APP_ID>
DISCORD_TOKEN=<YOUR_BOT_TOKEN>
PUBLIC_KEY=<YOUR_PUBLIC_KEY>
```

Keep `.env` private; it is ignored by Git. Register or update the slash commands:

```sh
npm run register
```

#### Whenever you add or change a slash command

1. Update its definition in `commands.js` and implement its interaction handler in `app.js`.
2. Register the updated command definitions with Discord:

   ```sh
   npm run register
   ```

3. Restart the running bot so it loads the updated code. For a PM2-managed bot:

   ```sh
   pm2 restart club-war-bot
   ```

   If running it in a terminal, stop the old process and start it again with `npm start`. You do not need to restart ngrok unless its tunnel itself is down. If a command does not immediately appear or update in Discord, refresh Discord and check again.

### 3. Start the bot

In one terminal, start the interactions server:

```sh
npm start
```

The server listens on port `3000` by default. Keep it running while using the bot.

### 4. Expose the local server with ngrok

Discord needs a public HTTPS URL to deliver interactions to your local computer. Install [ngrok](https://ngrok.com/download), add your ngrok authtoken once, and use your reserved domain if you have one:

```sh
ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
ngrok http http://localhost:3000 --url https://<your-reserved-domain>
```

If you don't have a reserved domain, start a temporary tunnel instead:

```sh
ngrok http 3000
```

Leave ngrok running. Copy the HTTPS forwarding address printed by ngrok, then in the Discord Developer Portal open your application's **General Information** page and set **Interactions Endpoint URL** to the address followed by `/interactions`, for example:

```text
https://<your-ngrok-domain>/interactions
```

Save the URL. A temporary ngrok URL changes when you restart its tunnel, so update the Discord endpoint each time it changes. A reserved ngrok domain keeps the same URL.

### 5. Invite and configure the bot

Invite the application to your server with the `applications.commands` scope and a bot role that can view and send messages in the reminder channel and mention `@everyone`. In the channel where reminders and admin commands should appear, run `/war-admin setup` and select the initial admin role. The person running initial setup must have Discord's **Manage Server** permission. Run `/war-admin settings` to verify setup.

## Keep it running in the background (optional)

The app and ngrok tunnel both need to stay online. For macOS, [PM2](https://pm2.keymetrics.io/) can run them in the background and restart them if they exit. Install PM2:

```sh
npm install --global pm2
```

From the project directory, start the bot:

```sh
pm2 start npm --name club-war-bot -- start
```

Start ngrok using the executable path reported by `command -v ngrok`. Replace the example reserved domain with your own, or omit the `--url` option to use a temporary domain:

```sh
pm2 start "$(command -v ngrok)" --name club-war-tunnel --interpreter none -- http http://localhost:3000 --url https://<your-reserved-domain>
```

Check status and logs:

```sh
pm2 status
pm2 logs club-war-bot
pm2 logs club-war-tunnel
```

To restart or stop them:

```sh
pm2 restart club-war-bot
pm2 restart club-war-tunnel
pm2 stop club-war-bot club-war-tunnel
```

PM2 keeps processes running after you close Terminal, but your Mac must remain powered on and connected to the internet. To make PM2-managed processes start at login, run `pm2 startup`, follow the command PM2 prints, then run `pm2 save`. Do not start a second copy of the bot or tunnel if it is already managed by PM2.

## Admin and attendance commands

- `/war-info` — show commands, the current war schedule, and server configuration.
- `/attended` — member self check-in during the 7:30–9:30 PM window.
- `/late date:DD-MM-YYYY` — privately report in advance that you will be late for a scheduled war.
- `/war-admin setup` — configure the current channel and initial admin role (requires Manage Server permission, or an already authorized role).
- `/war-admin settings` — view current bot settings.
- `/war-admin role-add` and `/war-admin role-remove` — manage authorized admin roles.
- `/war-admin attendance date:DD-MM-YYYY` — view a scheduled session's attendance (for example, `16-11-2026`).
- `/war-admin late date:DD-MM-YYYY` — view members who reported they will be late for a scheduled war date (past or future).
- `/war-admin add-attendance member:@member date:DD-MM-YYYY` — add a member to any scheduled war date, including a past session. Duplicate entries are reported and not added again.

Attendance and late-report lists are displayed in compact four-column tables, with each member numbered in order. Longer lists are split across multiple private replies.

Admin commands are restricted to configured roles and must be run in the configured channel. A server manager can rerun `/war-admin setup` to change the channel and reset the initial admin role.

Attendance sessions are keyed by their Manila calendar date and roll over automatically; no manual reset is needed. The scheduler checks every ten seconds while the app is running. If the computer or process is offline at a scheduled time, that announcement may be missed.

Run the local tests with `npm test`.
