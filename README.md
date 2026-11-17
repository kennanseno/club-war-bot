# Club War Attendance Bot

This Discord bot sends club-war reminders and records attendance for wars held every Monday, Wednesday, and Saturday from 8:00 to 9:00 PM Philippines time (`Asia/Manila`).

## What it does

- Sends an initial `@everyone` reminder at 5:00 PM Manila time, preparation reminders at 6:00, 6:30, 7:00, and 7:30 PM, a 7:40 PM `@everyone` notice about kicking offline members, an 8:00 PM gamer-style war-start reminder, a 9:00 PM gamer-style war-end reminder, and a 9:30 PM attendance-close reminder. The 7:40 PM notice is followed by the timestamp-ordered list of members who recorded a late notice for that war, using the same single-column table format as `/war-admin attendance`; only those members are kept in the guild instead of being kicked. Every reminder ends by directing members to `/war-info` for command help. The start and end messages remind members to use `/attended` by 9:30 PM or they won't be counted for that war's salary. Other reminders explain member and admin commands.
- On days without a scheduled war, sends a 7:00 PM `@everyone` reminder clarifying there is no war tonight and showing the weekly war schedule and bot usage instructions.
- Reminders emphasize that regroup is from 7:00–8:00 PM, offline guild members without a late notice for that war are kicked at 7:40 PM to make room for others, and members who will be late should use `/late` to notify admins.
- Announces that regroup runs from 7:00–8:00 PM, attendance opens at 7:30 PM, and attendance closes at 9:30 PM.
- Lets members record themselves with `/attended` between 7:30 and 9:30 PM on war days. Its private confirmation is followed by the current attendance list in the same single-column table format as `/war-admin attendance`, ordered by earliest recorded timestamp. Attendance and late-report records store their `recordedAt` timestamp to the minute in Manila local time, without a timezone suffix. Attendance and late-report lists display each record's timestamp; admin-added attendance also stores the adding admin's ID.
- Lets members use `/late [date:MM-DD-YYYY]` to privately report in advance that they will be late for a scheduled war. If the date is omitted, it defaults to today when today is a war day or the next scheduled war date otherwise. Its private confirmation is followed by the current late-notice list, using the same single-column table format as `/war-admin attendance`, ordered by earliest reported timestamp. Each member is listed once per war date, and authorized admins can review reports with `/war-admin late [date:MM-DD-YYYY]`. For explicit member dates, today and future war dates are accepted.
- Provides `/war-info` to show member and admin commands, the weekly schedule, attendance window, reminder times, and this server's configured channel and admin roles.
- Reminder messages use bold emphasis and blank lines between sections for readability.
- At 9:00 PM, posts the current attendance list and reminds members they have 30 minutes to use `/attended` before attendance closes at 9:30 PM. With the 9:30 PM close announcement, posts the final attendee list including any check-ins recorded during that last 30 minutes, ordered from earliest to latest recorded timestamp in a single column. Names are shown without pinging attendees, and long lists are split into multiple messages.
- Provides `/war-admin` commands to configure the reminder channel and admin roles, view attendance, and manually add a member to a scheduled session. All slash commands can be used in any server channel; scheduled reminders go to the configured reminder channel.
- Provides `/guild-fund` for everyone to view the current EP (E-Points), Gold, and PHP (cash) balances. Authorized admins can update each string value with `/war-admin fund ep`, `/war-admin fund gold`, or `/war-admin fund php`, and set the `@everyone` update channel with `/war-admin fund channel`.

Schedule defaults and reminder text are centralized in [config.js](./config.js). Server settings, attendance, and late reports are stored in `data/club-war-data.json`; guild fund values and their announcement channel are stored separately per server in `data/guild-fund-data.json`. Both files are ignored by Git. Keep backups of these files if the data matters. The bot assumes one running process and a computer with durable project storage.

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

Invite the application to your server with the `applications.commands` scope and a bot role that can view and send messages in the selected reminder channels and mention `@everyone`. Run `/war-admin setup war_channel:<channel> fund_channel:<channel> admin_role:<role>` to select separate channels for war reminders and guild fund announcements, and to select the initial admin role. The person running initial setup must have Discord's **Manage Server** permission. Run `/war-admin settings` to verify setup.

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
- `/late [date:MM-DD-YYYY]` — privately report in advance that you will be late; without a date, defaults to today if it is a war day or the next scheduled war date.
- `/war-admin setup war_channel:<channel> fund_channel:<channel> admin_role:<role>` — configure the war-reminder channel, guild-fund announcement channel, and initial admin role (requires Manage Server permission, or an already authorized role).
- `/war-admin settings` — view current bot settings.
- `/war-admin role-add` and `/war-admin role-remove` — manage authorized admin roles.
- `/war-admin attendance [date:MM-DD-YYYY]` — view a scheduled session's attendance (for example, `11-16-2026`); without a date, defaults to today if it is a war day or the most recent prior war date.
- `/war-admin late [date:MM-DD-YYYY]` — view members who reported they will be late for a scheduled war date; without a date, defaults to today if it is a war day or the most recent prior war date.
- `/war-admin add-attendance member:@member date:MM-DD-YYYY` — add a member to any scheduled war date, including a past session. Duplicate entries are reported and not added again.
- `/guild-fund view` — publicly show the current guild EP, Gold, and PHP cash funds (`/guild-fund` without a subcommand also displays them where supported).
- `/guild-fund info` — show all guild fund commands, including admin-only commands.
- `/war-admin fund ep value:<text>`, `/war-admin fund gold value:<text>`, and `/war-admin fund php value:<text>` — update a fund value. If an announcement channel is configured, the bot posts all latest balances and mentions `@everyone`.
- `/war-admin fund channel channel:<channel>` — set the channel for guild fund announcements.

Attendance and late-report lists are displayed in aligned, monospaced single-column lists, with one numbered member per row. Longer lists are split across multiple private replies.

All slash commands can be run in any server channel. Admin commands still require an authorized role, and initial setup requires Manage Server permission. The configured war channel is used for scheduled reminders and attendance rosters; the configured fund channel is used for guild fund announcements. A server manager can rerun `/war-admin setup` to change both channels and reset the initial admin role.

Attendance sessions are keyed by their Manila calendar date and roll over automatically; no manual reset is needed. The scheduler checks every ten seconds while the app is running. If the computer or process is offline at a scheduled time, that announcement may be missed.

Run the local tests with `npm test`.
