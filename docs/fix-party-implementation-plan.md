# Fix Party Implementation Plan

## Goal

Add server-scoped fixed parties of up to eight people, managed through `/fix-party` slash commands. Each party has one leader, party-specific leader and member roles, and a roster that records join time, class, and type.

## Commands

- `/fix-party info` — show all fix-party commands and a brief description of each.
- `/fix-party list` — show all parties in the server. List the leader first, then members, show empty slots up to eight, and include each member's class and type.
- `/fix-party create [name]` — any server member may create one party. The optional text name sets the party name; when omitted, use `<display name>'s Fixed Party`. Assign the creator the shared `Fix Party Leader` role, creating it if needed, and create party-specific leader and member roles.
- `/fix-party add [name:@user] [class] [type]` — party leader only. `name` is a required Discord user option, selected using Discord's server user picker rather than free-text matching. `class` is required: `Swordsman`, `Brawler`, `Archer`, or `Shaman`. `type` is required: `Pow`, `Dex`, or `Int`.
- `/fix-party remove [name:@user]` — party leader only. Use Discord's user picker, then verify the selected user is still in the server and belongs to the leader's party.
- `/fix-party leave` — let a party leader or member leave. If a leader leaves while members remain, promote the earliest-joined member. If no members remain, automatically disband the party.
- `/fix-party disband` — party leader only. Remove role assignments and delete the party-specific leader and member roles.

## Rules and validations

- A user may belong to at most one fixed party per server.
- A party may contain at most eight people total: one leader plus up to seven members. `/fix-party add` must reject an add once all seven member slots are filled.
- Only the party leader can add or remove members, or disband their party.
- Add and remove use Discord user options, which provide the server's user picker; they do not search arbitrary display-name text. Resolve the selection as a current guild member at execution time and report clearly if the user cannot be found or has left the server.
- Validate add values at runtime as well as declaring Discord option choices. Reject missing, malformed, or unsupported values; reject bot accounts, the leader, existing members, and users belonging to any other party in that server.
- Check leader authorization, party existence, target guild membership, and available party role before changing roles or data.
- Enforce membership uniqueness and the eight-person total limit again inside the serialized store update, so concurrent add commands cannot bypass validation.
- If role assignment succeeds but persistence fails, attempt to remove the newly assigned role. Report both the original and any rollback failure; never claim an add succeeded unless both updates succeed.
- Record each member's join timestamp, class, and type. Store a leader join timestamp too. Promote the earliest-joined member on leader departure and break timestamp ties deterministically.
- Remove the shared `Fix Party Leader` role when a user stops leading their party.
- Always show the leader first and include empty slots until eight positions are displayed.
- Make role and persistence failures visible; never return a success-shaped response when an operation failed.

## Implementation

1. Register `/fix-party` with all seven subcommands and the required class/type choices.
2. Extend the existing JSON store and validation/default data with server-scoped party records while preserving compatibility with existing data files.
3. Implement party domain operations and roster formatting with focused unit tests.
4. Add interaction handlers using the existing Discord REST helper for role lookup, creation, assignment, removal, and deletion. Check permissions and hierarchy errors explicitly.
5. Document commands, role permissions, and setup requirements in the README and this command reference.
6. Register updated slash commands with `npm run register`, restart the bot, and run tests.

## Data to persist

Each party record includes its name, leader user ID, party-specific leader and member role IDs, and member records. Member records include user ID, display name, join timestamp, class, and type. Store the leader's join timestamp as well.

## Discord requirements

The bot needs Manage Roles, and its highest role must be above the roles it creates and manages.

## Tests

- Existing JSON data loads unchanged when no party data exists; malformed party data is rejected safely.
- Command definitions include all seven subcommands and required class/type choices.
- Creation applies the default name, creates/uses the shared leader role, creates party roles, and prevents duplicate party membership.
- Add validates leader authorization, guild membership, non-bot target, no self/duplicate/cross-party membership, class/type allowlists, and a maximum of seven non-leader members (eight people total including the leader), including concurrency. It records join metadata and assigns the role; failures are explicit and safely roll back a role assignment when persistence fails.
- Remove validates party membership and removes the role.
- Leave removes a member; leader leave promotes the earliest-joined member; a leader leaving an empty party disbands it.
- Disband removes role assignments and deletes party-specific roles.
- List shows the leader first, members in a stable order, member class/type, and all remaining empty slots.
- Discord and storage failures are reported without false success confirmations.
