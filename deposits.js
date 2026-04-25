import dotenv from 'dotenv';
dotenv.config({ path: './.env', quiet: true });
import Database from 'better-sqlite3';
import cliProgress from 'cli-progress';
import { ethers } from "ethers";
import fetch from 'node-fetch';
const ABI = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"bytes","name":"pubkey","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"withdrawal_credentials","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"amount","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"signature","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"index","type":"bytes"}],"name":"DepositEvent","type":"event"},{"inputs":[{"internalType":"bytes","name":"pubkey","type":"bytes"},{"internalType":"bytes","name":"withdrawal_credentials","type":"bytes"},{"internalType":"bytes","name":"signature","type":"bytes"},{"internalType":"bytes32","name":"deposit_data_root","type":"bytes32"}],"name":"deposit","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"get_deposit_count","outputs":[{"internalType":"bytes","name":"","type":"bytes"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"get_deposit_root","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes4","name":"interfaceId","type":"bytes4"}],"name":"supportsInterface","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"pure","type":"function"}];
const INTERFACE = new ethers.Interface(ABI);
const ADDRESS = process.env.ADDRESS;
const ETHERSCANAPIKEY = process.env.ETHERSCANAPIKEY;
const BACKOFFSECONDS = 5;
let progressBar;

// set up the database
const DB = new Database(process.env.DATABASE);
DB.pragma('journal_mode = WAL');
let sql = '';
if (process.argv[2] === '--reset') { sql = 'DROP TABLE IF EXISTS deposits;'; }
sql += `
CREATE TABLE IF NOT EXISTS deposits (
	timestamp INTEGER NOT NULL,
	deposit_address TEXT NOT NULL,
	block INTEGER NOT NULL,
	hash TEXT NOT NULL,
	pubkey TEXT NOT NULL,
	withdrawal_credentials TEXT NOT NULL,
	signature TEXT NOT NULL,
	value TEXT NOT NULL
);`;
DB.exec(sql, (err) => {
	if (err) { throw new Error(err.message); }
});

// prepare desposits data structure and DB multi-call
const DEPOSITDATA = { block: 1, deposit_address: 1, hash: 1, timestamp: 1, pubkey: 1, withdrawal_credentials: 1, signature: 1, value: 1 };
const COLUMNS = Object.keys(DEPOSITDATA).join(", ");
const PLACEHOLDERS = Object.keys(DEPOSITDATA).fill('?').join(", ");
const INSERT = DB.prepare('INSERT INTO deposits (' + COLUMNS + ') VALUES (' + PLACEHOLDERS + ')');
const INSERTDEPOSITDATA = DB.transaction(depositDataArray => {
	for (const depositData of depositDataArray) {
		INSERT.run(Object.values(depositData));
	}
});

// set up some block boundaries
let startBlock = 0;
let lastBlock = DB.prepare('SELECT MAX(block) AS lastBlock FROM deposits').pluck().all();
if (!lastBlock || lastBlock[0] === null || lastBlock[0] === 0) {
	startBlock = process.env.STARTDEPOSITBLOCK;
} else {
	startBlock = lastBlock[0];
}

// get the latest block number from the Provider
// const PROVIDER = new ethers.JsonRpcProvider($ELRPCADDRESS + ':' + $ELRPCPORT);
// const ENDBLOCK = await PROVIDER.getBlockNumber();

// get the latest block number from etherscan
const URL = 'https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_blockNumber&apikey=' + ETHERSCANAPIKEY;
const request = await fetch(URL, { method: 'GET' });
if (request.status !== 200) { throw new Error(request); }
const response = await request.json();
const ENDBLOCK = ethers.getNumber(response.result);

/**
 * Utility function to pause execution for a number of seconds
 * @param {Number} seconds - number of second to pause
 * @returns {void}
 */
const wait = (seconds) => {
	const waitTill = new Date(new Date().getTime() + seconds * 1000);
	while (waitTill > new Date()) {
		// wait
	}
}

/**
 * get transactions recursively from Etherscan
 * @async
 * @param {Number} page - page number
 * @param {string} action - Etherscan endpoint action
 * @returns {Promise<Boolean>}
 */
const getTXs = async (page, action) => {
	let params = '&startBlock=' + startBlock + '&endblock=' + ENDBLOCK;
	const URL = 'https://api.etherscan.io/v2/api?chainid=1&module=account&action=' + action + '&address=' + ADDRESS + params + '&page=' + page + '&offset=1000&sort=asc&apikey=' + ETHERSCANAPIKEY;
	const request = await fetch(URL, {
		method: 'GET'
	});
	if (request.status !== 200) {
		console.log(request);
		return false;
	}
	const response = await request.json();
	if (response.message && response.message === 'OK') {
		if (response.status !== '1') { // we're done
			return true;
		} else { // process transactions
			let depositDataArray = [];
			for (let i = 0; i < response.result.length; i++) { // process this batch of transactions
				const tx = response.result[i];
				if (tx.methodId !== '0x22895118' || tx.isError === '1' || tx.to.toLowerCase() !== ADDRESS.toLowerCase()) { // we only want deposit transactions (0x22895118), that didn't error, and where the to address is the staking contract
					continue;
				}
				const decoded = INTERFACE.parseTransaction({ data: tx.input });
				// we have to convert the tx.value from BigInt to a String for storage in sqlite
				depositDataArray.push({ block: tx.blockNumber, deposit_address: tx.from, hash: tx.hash, timestamp: tx.timeStamp, pubkey: decoded.args[0], withdrawal_credentials: decoded.args[1], signature: decoded.args[2], value: ethers.toBeHex(tx.value) });
			}
			if (depositDataArray.length > 0) { // store our deposit data in the DB
				INSERTDEPOSITDATA(depositDataArray);
			}
			lastBlock = parseInt(response.result[response.result.length - 1].blockNumber, 10);
			progressBar.update(lastBlock);
			page += 1;
			if (page > 10) { // etherscan won't let you pull more than 10k records across pages from their DB
				page = 1; // so we reset the page
				startBlock = lastBlock; // and update the range
			}
			await getTXs(page, action);
		}
	} else if (response.message && response.message === 'NOTOK') {
		console.log(response);
		console.log('Backing off Etherscan for', BACKOFFSECONDS, 'seconds...');
		wait(BACKOFFSECONDS);
		await getTXs(page, action);
	} else if (response.message && response.message === 'No transactions found') { // we 're done
		return true;
	} else {
		console.log(response);
		console.log('Backing off Etherscan for', BACKOFFSECONDS, 'seconds...');
		wait(BACKOFFSECONDS);
		await getTXs(page, action);
	}
	return true;
}

/**
 * De-dupe the db. The may be necessary if there are multiple start/stop runs or rate-limit backoffs as the same block can be processed more than once
 * @async
 * @returns {Promise<Boolean>}
 */
const deDupe = async () => {
	// SELECT hash, COUNT(*) FROM deposits GROUP BY hash HAVING COUNT(*) > 1; // find duplicates
	let sql = `
	DELETE FROM deposits
	WHERE rowid NOT IN (
		SELECT MIN(rowid)
		FROM deposits
		GROUP BY hash
	);`;
	DB.exec(sql, (err) => {
		if (err) { throw new Error(err.message); }
	});
	return true;
}

/**
 * Main function
 * @async
 * @returns {void}
 */
const go = async () => {
	console.log('Starting block:\t', startBlock);
	console.log('Ending block:\t', ENDBLOCK);
	progressBar = new cliProgress.SingleBar({ format: 'Retrieving deposits: [{bar}] {percentage}% || {value}/{total} Blocks || ETA: {eta}s' }, cliProgress.Presets.rect);
	progressBar.start(ENDBLOCK, startBlock);
	await getTXs(1, 'txlist');
	await deDupe();
	DB.close();
	progressBar.update(ENDBLOCK);
	progressBar.stop();
}

go();
