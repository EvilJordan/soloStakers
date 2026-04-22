# Solo Staker List

Node + SQLite + Bash

## .env Setup -- *REQUIRED*
```bash
ADDRESS=0x00000000219ab540356cbb839cbe05303d7705fa # Beacon Chain deposit contract
ETHERSCANAPIKEY=YOUR_ETHERSCAN_API_KEY # optional if not using a local RPC node
DATABASE=soloStakers.db # SQLite DB filename
STARTBLOCK=11184523 # first mainnet block containing a deposit
VALIDATORS=validators.json # local filename to store current validator set temporarily
CLRPCADDRESS=http://localhost # consensus layer RPC address
CLRPCPORT=5051 # consensus layer RPC port
ELRPCADDRESS=http://localhost # execution layer RPC address
ELRPCPORT=8552 # execution layer RPC port
```
---
## Execution

`npm init` - this will install required dependencies

`node deposits.js` - retreive Beacon Chain deposits using Ethersan's API (1400x faster than a local RPC node) and import into SQLite table. Should take around 10 minutes. If execution stalls or fails, run again. Built-in de-duping removes duplicate entries due to overlapping start blocks. Optionally, run: `node deposits.js --reset` to wipe the database and start from the first environmentally set `STARTBLOCK`.

alternatively: `node deposits-RPC.js` - retrieve Beacon Chain deposits by scanning an RPC node block-by-block and extracting transactions to the Beacon Chain contract (takes about 10 days using a local RPC node... trust, but verify!) and import into SQLite table

make sure `validators.sh` is set to executable (`chmod +x validators.sh`)

`./validators.sh` - retrieve a JSON list of validators from the consensus layer, parse out the requisite information, format as CSV, import into SQLite table

This will result in a near-gigabyte `soloStakers.db` SQLite database with two tables: `validators` and `deposits`. 