// get an updated amount of transactions per deposit address from a local RPC
import dotenv from 'dotenv';
dotenv.config({ path: './.env', quiet: true });
import { ethers } from "ethers";
import Database from 'better-sqlite3';
import cliProgress from 'cli-progress';
import fs from 'fs';
const DB = new Database('soloStakers.db');
DB.pragma('journal_mode = WAL');

let sql = '';
if (process.argv[2] === '--reset') { sql = 'DROP TABLE IF EXISTS depositTransactions;'; }
sql += `
CREATE TABLE IF NOT EXISTS depositTransactions (
	deposit_address TEXT NOT NULL,
	firstTXTimestamp INTEGER DEFAULT 0,
	txETHOut TEXT,
	numTXs INTEGER DEFAULT 0,
	numNonETHTXs INTEGER DEFAULT 0
);`;
DB.exec(sql, (err) => {
	if (err) { throw new Error(err.message); }
});

// prepare depositTransactions data structure and DB multi-call
const DEPOSITDATA = { deposit_address: 0, numTXs: 0 };
const COLUMNS = Object.keys(DEPOSITDATA).join(", ");
const PLACEHOLDERS = Object.keys(DEPOSITDATA).fill('?').join(", ");
const INSERT = DB.prepare('INSERT INTO depositTransactions (' + COLUMNS + ') VALUES (' + PLACEHOLDERS + ')');
const INSERTDEPOSITDATA = DB.transaction(depositDataArray => {
	for (const depositData of depositDataArray) {
		INSERT.run(Object.values(depositData));
	}
});

const PROVIDER = new ethers.JsonRpcProvider(process.env.ELRPCADDRESS + ':' + process.env.ELRPCPORT);

const depositData = JSON.parse(fs.readFileSync('./deposits.json', 'utf8'));
const depositAddressesOriginal = Object.keys(depositData);
let depositAddresses = [];
for (let i = 0; i < depositAddressesOriginal.length; i++) {
	const thisDepositAddress = depositData[depositAddressesOriginal[i]];
	if (thisDepositAddress.inactive || !thisDepositAddress.isSolo) { continue; }
	depositAddresses.push(depositAddressesOriginal[i]);
}

// select all existing deposit_address in depositTransactions table
let query = DB.prepare("SELECT GROUP_CONCAT(DISTINCT deposit_address) AS deposit_address FROM depositTransactions").all();
const depositAddressesDB = query[0].deposit_address.split(",");
query = null;

console.log('Unique active deposit addresses:', depositAddresses.length);

// if an address in our depositAddresses array DOES NOT EXIST in the depositTransactions table, insert it, otherwise, skip
const difference = depositAddresses.filter(item => !depositAddressesDB.includes(item));
depositAddresses = difference;

console.log('Active deposit addresses to be inserted:', depositAddresses.length);
let progressBar;
progressBar = new cliProgress.SingleBar({ format: 'Retrieving info: [{bar}] {percentage}% || {value}/{total} deposit addresses || ETA: {eta}s' }, cliProgress.Presets.rect);
progressBar.start(depositAddresses.length, 0);

for (let i = 0; i < depositAddresses.length; i++) {
	const numDeposits = await PROVIDER.getTransactionCount(depositAddresses[i]);
	INSERTDEPOSITDATA([{ depositAddress: depositAddresses[i], numDeposits: numDeposits }]);
	progressBar.increment();
}

progressBar.stop();
DB.close();
