# Walkie POC

Walkie experiment with SIP / WebRTC

## Installation

Install depedendencies

```
$ npm install
```

Requirements:

 - Node JS

To build the project type:

```
$ npm run build
```

To run the server type:

```
$ npm start
```

## Configuration

In order to configure this module, you have to set the following environment variables:

| Variable Name | Description |
|---|---|
| LOG_MODE | Log Mode. values: DEFAULT, SILENT, DEBUG |
| GROUPS_CONFIG_FILE | Path to the walkie configuration file |

The walkie configuration file must be a json file with an array.
 - `id` - Walkie group unique ID
 - `ws` - Websocket connection URL
 - `uri` - SIP URI
 - `password` - SIP password
 - `members` - List of phone numbers in the group

Example:

```json
[
    {
        "id": "group-1",
        "ws": "wss://???.???.???.???:8089/ws",
        "uri": "sip:sip-user@your-domain.bwapp.bwsip.io",
        "password": "password",
        "members": ["111-111-1111", "222-222-2222", "333-333-3333"]
    }
]
```
