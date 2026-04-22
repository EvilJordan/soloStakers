// this is the slow way, processing the chain block-by-block using a local node and RPCs. It can take up to ten days to complete
import dotenv from 'dotenv';
dotenv.config({ path: './.env', quiet: true });
import { ethers } from "ethers";
import Database from 'better-sqlite3';
import cliProgress from 'cli-progress';
const DB = new Database('soloStakers.db');
DB.pragma('journal_mode = WAL');
const PROVIDER = new ethers.JsonRpcProvider(process.env.ELRPCADDRESS + ':' + process.env.ELRPCPORT);
const STAKINGCONTRACT = process.env.ADDRESS;
const ABI = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"bytes","name":"pubkey","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"withdrawal_credentials","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"amount","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"signature","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"index","type":"bytes"}],"name":"DepositEvent","type":"event"},{"inputs":[{"internalType":"bytes","name":"pubkey","type":"bytes"},{"internalType":"bytes","name":"withdrawal_credentials","type":"bytes"},{"internalType":"bytes","name":"signature","type":"bytes"},{"internalType":"bytes32","name":"deposit_data_root","type":"bytes32"}],"name":"deposit","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"get_deposit_count","outputs":[{"internalType":"bytes","name":"","type":"bytes"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"get_deposit_root","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes4","name":"interfaceId","type":"bytes4"}],"name":"supportsInterface","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"pure","type":"function"}];
const INTERFACE = new ethers.Interface(ABI);

// set up the database
let sql = `
-- DROP TABLE IF EXISTS deposits;
CREATE TABLE IF NOT EXISTS deposits (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	timestamp INTEGER NOT NULL,
	deposit_address TEXT NOT NULL,
	block INTEGER NOT NULL,
	hash TEXT NOT NULL,
	pubkey TEXT NOT NULL,
	withdrawal_credentials TEXT NOT NULL,
	signature TEXT NOT NULL,
	value TEXT NOT NULL
)`;
DB.exec(sql, (err) => {
	if (err) { throw new Error(err.message); }
});

let LASTBLOCK = DB.prepare('SELECT MAX(block) AS LASTBLOCK FROM deposits').pluck().all();
if (!LASTBLOCK || LASTBLOCK[0] === null || LASTBLOCK[0] === 0) {
	STARTBLOCK = process.env.STARTBLOCK;
} else {
	STARTBLOCK = LASTBLOCK[0];
}
const STARTBLOCK = LASTBLOCK[0] + 1;
const ENDBLOCK = await PROVIDER.getBlockNumber();
let progressBar;
console.log('Start Block:\t', STARTBLOCK);
console.log('End Block:\t', ENDBLOCK);

// prepare desposits data structure
const DEPOSITDATA = { block: 1, deposit_address: 1, hash: 1, timestamp: 1, pubkey: 1, withdrawal_credentials: 1, signature: 1, value: 1 };
const COLUMNS = Object.keys(DEPOSITDATA).join(", ");
const PLACEHOLDERS = Object.keys(DEPOSITDATA).fill('?').join(", ");
const INSERT = DB.prepare('INSERT INTO deposits (' + COLUMNS + ') VALUES (' + PLACEHOLDERS + ')');

const INSERTDEPOSITDATA = DB.transaction(depositDataArray => {
	for (const depositData of depositDataArray) {
		INSERT.run(Object.values(depositData));
	}
});

// get all deposit transactions and requisite data
progressBar = new cliProgress.SingleBar({ format: 'Retrieving deposits: [{bar}] {percentage}% || {value}/{total} Blocks || ETA: {eta}s' }, cliProgress.Presets.rect);
progressBar.start(ENDBLOCK, STARTBLOCK);
for (let i = STARTBLOCK; i <= ENDBLOCK; i++) {
	let thisBlock = await PROVIDER.getBlock(i, true);
	let numTX = 0;
	let depositDataArray = [];
	thisBlock.prefetchedTransactions.forEach(tx => {
		if (tx.to?.toLowerCase() === STAKINGCONTRACT) {
			numTX++
			const decoded = INTERFACE.parseTransaction({ data: tx.data });
			if (decoded?.name === 'deposit') {
				// we have to convert the tx.value from BigInt to a String
				depositDataArray.push({ block: i, deposit_address: tx.from, hash: tx.hash, timestamp: thisBlock.timestamp, pubkey: decoded.args[0], withdrawal_credentials: decoded.args[1], signature: decoded.args[2], value: ethers.toBeHex(tx.value) });
			}
		}
	});
	if (numTX > 0 && depositDataArray.length > 0) {
		INSERTDEPOSITDATA(depositDataArray);
	}
	progressBar.update(i + 1);
}
progressBar.update(ENDBLOCK);
progressBar.stop();
DB.close();
