# Solo Staker List

Node, Bash, jq, sqlite3

## .env Setup -- *REQUIRED*
```bash
ADDRESS=0x00000000219ab540356cbb839cbe05303d7705fa # Beacon Chain deposit contract
ETHERSCANAPIKEY=YOUR_ETHERSCAN_API_KEY # optional if not using a local RPC node
DATABASE=soloStakers.db # local SQLite DB filename
STARTDEPOSITBLOCK=11184523 # first mainnet block containing a deposit
STARTCONSENSUSBLOCK=15537394 # first mainnet block post-merge
STARTCONSENSUSSLOT=4700013 # first mainnet slot post-merge
CLRPCADDRESS=http://localhost # consensus layer RPC address
CLRPCPORT=5051 # consensus layer RPC port
ELRPCADDRESS=http://localhost # execution layer RPC address
ELRPCPORT=8552 # execution layer RPC port
```
---
## Execution

1. `npm init` - this will install required dependencies

2. `node deposits.js` - retreive Beacon Chain deposits up to run-time using Etherscan's API (1400x faster[^1] than a local RPC node) and import into SQLite table `deposits`. Should take around 10 minutes. If execution stalls or fails, run again. Built-in de-duping removes duplicate entries due to overlapping start blocks on re-run. Optionally, run: `node deposits.js --reset` to wipe the database and start from the first environmentally set `STARTDEPOSITBLOCK`.

alternatively: `node deposits-RPC.js` - retrieve Beacon Chain deposits up to run-time by scanning an RPC node block-by-block and extracting deposits to the Beacon Chain contract (takes about 10 days using a local RPC node... _trust, but verify!_) and import into SQLite table `deposits`.

make sure `validators.sh` is set to executable (`chmod +x validators.sh`)

3. `./validators.sh` - retrieve a JSON list of validators from the consensus layer, parse out the requisite information, format as CSV, import into SQLite table `validators`.

This will result in a near-gigabyte `soloStakers.db` SQLite database with two tables: `validators` and `deposits`. 

make sure `index.sh` is set to executable (`chmod +x index.sh`)

4. `./index.sh` - create indexes on `soloStakers.db` tables.

This will add about 500megs worth of indexes to the database, but enables extremely fast queries.

5. `node queries.js` - build a JSON lookup object (with `deposit_address` as the primary key), and write to disk as `deposits.json`

6. There does not exist a publicly available or efficient method to pull graffiti per slot from any block explorer or third-party. Therefore, we have created a custom fork of Teku that writes out all requisite slot data to a JSON file during sync, backfill, and regular operation. Additionally, a new RPC endpoint (`/teku/v1/beacon/proposer_graffiti/{block_id}`) allows for querying of the same data to fill gaps where necessary.

[^1]: Etherscan has already indexed the blockchain so we don't have to process block-by-block, looking at every transaction within every block. We can use their `txlist` endpoint combined with `page` and `startblock` params to page through and reliably retrieve all data. The free API tier is sufficient to retrieve all deposits, though there is a strict rate limit of three calls per second. The code has built-in back-off logic.