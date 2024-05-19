[![Deno CI](https://github.com/NeKzor/vroomer/actions/workflows/deno.yml/badge.svg)](https://github.com/NeKzor/vroomer/actions/workflows/deno.yml)

# vroomer

Campaign record updates for your Trackmania club!

https://github.com/NeKzor/vroomer/assets/16884507/ce0bb832-b612-45d3-9677-f97fffbd642a

## Features

- Records updates and statistics
- Campaign overview and rankings
- Replay storage
- Can be managed via application commands
- [Deno Deploy](https://deno.com/deploy) support

## Requirements

- [Deno](https://deno.com)
- Trackmania OAuth2 application for resolving display names
- Credentials of Ubisoft account which owns the game
- Optional: Discord application

## Usage

### Single Mode Club

> NOTE: Works on Deno Deploy.

- Create .env file `cp .env.example .env`
- Configure `.env`
- Run `deno task update` for the first time
  - Copy the ID of the campaign ranking message from Discord
  - Modify `DISCORD_CAMPAIGN_UPDATE_MESSAGE_ID` in `.env`
- Rerun `deno task update`

### Bot Mode

- Create .env file `cp .env.example .env`
- Configure `.env`
- Run `deno task update`
- Run `deno task bot:start`

## Notice

- Record updates are scheduled every minute as long as the `deno task update` process runs.
- Ranking updates are only send when there is a change.
- Running in bot mode is optional but obviously cannot run on Deno Deploy.
- Multiple servers are not supported.

## License

[MIT License](./LICENSE)
