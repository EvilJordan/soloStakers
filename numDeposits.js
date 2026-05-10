// get an updated amount of transactions per deposit address from a local RPC
import dotenv from 'dotenv';
dotenv.config({ path: './.env', quiet: true });
import { ethers } from "ethers";
import Database from 'better-sqlite3';
import cliProgress from 'cli-progress';
const DB = new Database('soloStakers.db');
DB.pragma('journal_mode = WAL');

let sql = '';
if (process.argv[2] === '--reset') { sql = 'DROP TABLE IF EXISTS depositTransactions;'; }
sql += `
CREATE TABLE IF NOT EXISTS depositTransactions (
	deposit_address TEXT NOT NULL,
	firstTXTimestamp INTEGER NULL,
	addressAge INTEGER NULL,
	numTXs INTEGER DEFAULT 0
);`;
DB.exec(sql, (err) => {
	if (err) { throw new Error(err.message); }
});

// prepare depositTransactions data structure and DB multi-call
const DEPOSITDATA = { deposit_address: 1, numTXs: 1 };
const COLUMNS = Object.keys(DEPOSITDATA).join(", ");
const PLACEHOLDERS = Object.keys(DEPOSITDATA).fill('?').join(", ");
const INSERT = DB.prepare('INSERT INTO depositTransactions (' + COLUMNS + ') VALUES (' + PLACEHOLDERS + ')');
const INSERTDEPOSITDATA = DB.transaction(depositDataArray => {
	for (const depositData of depositDataArray) {
		INSERT.run(Object.values(depositData));
	}
});

const PROVIDER = new ethers.JsonRpcProvider(process.env.ELRPCADDRESS + ':' + process.env.ELRPCPORT);

const depositAddresses = DB.prepare("SELECT DISTINCT(deposit_address) AS depositAddress FROM deposits").all();
// const depositAddresses = DB.prepare("SELECT DISTINCT(deposits.deposit_address) AS depositAddress FROM deposits WHERE deposits.deposit_address NOT IN (SELECT DISTINCT(depositTransactions.deposit_address) FROM depositTransactions)").all();
console.log('Unique deposit addresses:', depositAddresses.length);
let progressBar;
progressBar = new cliProgress.SingleBar({ format: 'Retrieving info: [{bar}] {percentage}% || {value}/{total} deposit addresses || ETA: {eta}s' }, cliProgress.Presets.rect);
progressBar.start(depositAddresses.length, 0);

for (let i = 0; i < depositAddresses.length; i++) {
	const numDeposits = await PROVIDER.getTransactionCount(depositAddresses[i].depositAddress);
	INSERTDEPOSITDATA([{ depositAddress: depositAddresses[i].depositAddress, numDeposits: numDeposits }]);
	progressBar.increment();
}

progressBar.stop();
DB.close();
