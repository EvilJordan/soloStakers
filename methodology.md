# Project Goal

The goal of this project is to determine how many Ethereum validators are solo stakers by gathering data and filtering it through a list of exclusion criteria.

---

## General Information

- The staking deposit contract address is `0x00000000219ab540356cbb839cbe05303d7705fa`
- The staking deposit contract ABI is `[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"bytes","name":"pubkey","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"withdrawal_credentials","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"amount","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"signature","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"index","type":"bytes"}],"name":"DepositEvent","type":"event"},{"inputs":[{"internalType":"bytes","name":"pubkey","type":"bytes"},{"internalType":"bytes","name":"withdrawal_credentials","type":"bytes"},{"internalType":"bytes","name":"signature","type":"bytes"},{"internalType":"bytes32","name":"deposit_data_root","type":"bytes32"}],"name":"deposit","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"get_deposit_count","outputs":[{"internalType":"bytes","name":"","type":"bytes"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"get_deposit_root","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes4","name":"interfaceId","type":"bytes4"}],"name":"supportsInterface","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"pure","type":"function"}]`
- The staking deposit contract was deployed on block `11052985`
- The first deposits to the staking deposit contract starts at block `11184524`
- A deposit address is the address that deposited ETH to the staking deposit contract
- The Ethereum execution layer JSON RPC API documentation is here: https://ethereum.github.io/execution-apis/
- The Ethereum consensus layer JSON RPC API documentation is here: https://ethereum.github.io/beacon-APIs/#/Beacon 
- Use the dRPC RPC API (https://drpc.org/docs/ethereum-api) to make execution layer calls
- Use the Quicknode RPC API (https://www.quicknode.com/docs/ethereum/) to make consensus layer calls via the Beacon API

---

## Project Requirements

- Write the program in Python
- Use the Python standard library where possible
- Avoid using the pandas package
- Prioritize code simplicity and readability
- Use comments to explain code logic/functionality
- Looping RPC calls should be done asynchronously, grouped into batches
- Each RPC/API base URL should have it's own global rate limit variable
- Always respect RPC/API call rate limits
- Use `scripts/.env` for all API keys/secrets and RPC base urls
- Never change existing `scripts/.env` values
- Use sqlite3 for database needs
- Ensure thorough error handling/reporting
- Log everything to log file with the datetime as the filename; create a new log file every time the program is run
- Maintain simple markdown documentation, updated with every change

---

### Project Organization

- Put all scripts in the `/scripts` folder
- Use `scripts/main.py` for the main business logic
- Use `scripts/utilities.py` for all reusable functions
- Put all saved files/databases in the `/data` folder
- Put all logs in the `/logs` folder
- Put all documentation in the `/documentation` folder

---

## Step 1

This step downloads a snapshot of active Ethereum validators. This should be a standalone script `scripts/get_validator_snapshot.py`.

- Use the Beacon API `beacon/states/head/validators` endpoint to get a list of all active validators (this will return a very large json file)
- Save this file with the name `validators_yyyy_mm_dd` where `yyyy` is the current year, `mm` is the current month, and `dd` is the current day
- Put this file in `/validator_snapshots`

---

## Step 2

This step collects a list of deposits made to the Ethereum deposit contract and save it to a database, along with some transaction and block metadata.

- Check if database `data/deposits.db` exists, if not then create it with the following attributes/fields: 
    - `deposit_address` (TEXT) = the address that sent a transaction depositing ETH to the deposit contract, in lowercase
    - `timestamp` (INTEGER) = the timestamp of block the deposit transaction happened in
    - `pubkey` (TEXT) = from the deposit transaction input data, as hex value with `0x` prepended
    - `withdrawal_credentials` (TEXT) = from the deposit transaction input data, as hex value with `0x` prepended
    - `block_number` (INTEGER) = the block the deposit transaction happened in
    - `tx_hash` (TEXT)  = the deposit transaction `hash` value
    - `tx_from` (TEXT) = the deposit transaction `from` value
    - `tx_to` (TEXT) = the deposit transaction `to` value
    - `tx_value` (TEXT) = the deposit transaction `value` value
- Get every successful transaction that has deposited to the staking deposit contract between blocks `11366511` and `22427813`, the start/end blocks should be set by global variables `START_BLOCK` and `END_BLOCK`
- If any RPC call for a block fails, save the block ID to `data/missed_blocks.txt` and come back to it until all calls are successful
- If any RPC call for a transaction fails, save the transaction ID to `data/missed_transactions.txt` and come back to it until all calls are successful
- If any RPC call for a transaction receipt fails, save the transaction ID to `data/data/missed_tx_receipts.txt` and come back to it until all calls are successful
- If any other RPC calls fails, save them in a similar manner and come back to it until all calls are successful
- For every successful transaction, attempt to decode the transaction input data
- Only if the input data contains `pubkey`, `withdrawal_credentials`, and `signature` then get the hex values (with the 0x prefix) and save to `data/deposits.db` along with the information required by the other fields

---

## Step 3

- Check if database `data/deposit_addresses.db` exists, if not then create it with the following attributes/fields: 
    - `deposit_address` (TEXT PRIMARY KEY)
    - `solo_staker` (TEXT)
    - `manually_added` (TEXT)
    - `pubkeys` (TEXT, JSON array)
    - `withdrawal_addresses` (TEXT, JSON array)
    - `staked_eth` (TEXT)
    - `assoc_staked_eth` (TEXT)
    - `total_staked_eth` (TEXT)
    - `assoc_deposit_addresses` (TEXT, JSON array)
    - `assoc_pubkeys` (TEXT)
    - `total_incoming_txs` (INTEGER)
    - `total_outgoing_txs` (INTEGER)
    - `eth_in` (TEXT)
    - `eth_out` (TEXT)
    - `incoming_addresses` (INTEGER)
    - `outgoing_addresses` (INTEGER)
    - `graffiti_tags` (TEXT, JSON array)
    - `avg_raver` (TEXT)
    - `std_raver` (TEXT)
    - `earliest_tx_date` (TEXT)
    - `address_age` (INTEGER)
    - `cluster_id` (TEXT)
    - `cluster_size` (INTEGER)
- Select all rows in `data/deposits.db` where the `block_number` is greater than or equal to `START_BLOCK`
- For each row check if there's an row in `data/deposit_addresses.db` with the same `deposit_address`
- If a row with the same `deposit_address` is not found, create a new row using the `deposit_address` as the primary key
- Add the `pubkey` from `data/deposits.db` to the JSON list in `data/deposit_addresses.db`; if values already exist, append the new value to the list
- Extract the validator withdrawal address from `withdrawal_credential` in `data/deposits.db` and save it to the `withdrawal_addresses` JSON list in `data/deposit_addresses.db`; if values already exist, append the new value to the list

---

## Step 4

This step filters out deposit addresses explicitely known to be associated with professional validators.

# uses private Rated endpoint

---

## Step 5

This step collects a list of block proposal graffiti tags used by validators and adds it to the `graffiti_tags` JSON list in `data/deposit_addresses.db` for every row containing the corresponding pubkey in `pubkeys`.

---

## Step 6

This step filters out deposit addresses with graffiti tags associated with professional operators.

---

## Step 7

This step excludes deposit addresses with >10,000 transactions.

---

## Step 8

This step excludes deposit addresses with >9,000 ETH in outgoing value.

---

## Step 9

This step excludes deposit addresses with >100 outgoing transactions, all of which have 0 ETH value.

---

## Step 10

This step collects a list of associated deposit addresses and pubkeys for each `deposit_address` based on shared withdrawal addresses.

# seems like this should take a few passes, but I think rated only did one pass

---

## Step 11

This step totals the balance of all validators with a pubkey listed in the `pubkeys` and `assoc_pubkeys` JSON lists.

---

## Step 12

This step excludes deposit addresses with more than 2560 ETH staked in `total_staked_eth`.

---

## Step 13

This step collects the age of each deposit address based on the first outgoing transaction and populates `earliest_tx_date` and `address_age` (in days).

---

## Step 14-XX

This step excludes deposit addresses based on performance clustering:
- Group addresses created within 5 days of each other
- Cluster addresses within ±0.5% of group average RAVER and ±0.1 RAVER std dev
- Excluded addresses in clusters of >5 and with >320 ETH