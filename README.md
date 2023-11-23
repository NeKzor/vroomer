[![Deno CI](https://github.com/NeKzor/vroomer/actions/workflows/deno.yml/badge.svg)](https://github.com/NeKzor/vroomer/actions/workflows/deno.yml)

# vroomer

Campaign world record updates for your Trackmania club!

## Features

- World records updates and statistics
- Campaign overview and rankings

## Requirements

- [Deno](https://deno.com)
- Trackmania OAuth2 application for resolving display names
- Credentials of Ubisoft account which owns the game
- Two Discord webhook URLs
  - First one is for sending world record updates
  - Second one is for updating campaign rankings

## Usage

- Create .env file `cp .env.example .env`
- Configure `.env`
- Run `deno task update` for the first time
  - Copy the ID of the campaign ranking message from Discord
  - Modify `DISCORD_CAMPAIGN_UPDATE_MESSAGE_ID` in `.env`
- Rerun `deno task update`

## Notice

- Record updates are scheduled every minute.
- Ranking updates are only send when there is a change.

## License

[MIT License](./LICENSE)
