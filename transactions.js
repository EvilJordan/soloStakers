import dotenv from 'dotenv';
dotenv.config({ path: './.env', quiet: true });
import Database from 'better-sqlite3';
import cliProgress from 'cli-progress';
import { ethers } from "ethers";
const ETHERSCANAPIKEY = process.env.ETHERSCANAPIKEY;
const BACKOFFSECONDS = 3;
const RATELIMIT = 3;
const ENDBLOCK = 999999999;
let startBlock = 0;
let calls = 0;
let progressBar;

const DB = new Database(process.env.DATABASE);
DB.pragma('journal_mode = WAL');
const depositAddresses = DB.prepare("SELECT DISTINCT(deposit_address) AS depositAddress FROM depositTransactions WHERE firstTXTimestamp = 0").all();
let depositTXData = {};

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
 * @param {string} address - 0x address
 * @returns {Promise<Boolean>}
 */
const getTXs = async (page, action, address) => {
	calls++;
	if (calls > RATELIMIT - 1) { wait(1); calls = 0; }
	let params = '&startBlock=' + startBlock + '&endblock=' + ENDBLOCK;
	const URL = 'https://api.etherscan.io/v2/api?chainid=1&module=account&action=' + action + '&address=' + address + params + '&page=' + page + '&offset=1000&sort=asc&apikey=' + ETHERSCANAPIKEY;
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
			for (let i = 0; i < response.result.length; i++) { // process this batch of transactions
				if (depositTXData[address].numNonETHTXs > 100 || ethers.toBigInt(depositTXData[address].txETHOut) > ethers.parseEther('9000')) { depositTXData[address].isSolo = false; return true; }
				const tx = response.result[i];
				// if firstTXTimestamp is 0, change it to tx.timeStamp
				if (tx.from.toLowerCase() !== address.toLowerCase()) { continue; }
				if (depositTXData[address].firstTXTimestamp == 0) {
					depositTXData[address].firstTXTimestamp = tx.timeStamp;
				}
				if (tx.value > 0) { // collect tx where FROM is deposit address and tx.value > 0 and add value to txETHOut total - if we hit > 9000, we can stop
					depositTXData[address].txETHOut = ethers.toBeHex(BigInt(ethers.toBeHex(tx.value)) + BigInt(depositTXData[address].txETHOut));
				} else { // collect tx where FROM is deposit address and tx.value == 0 and add +1 to numNonETHTXs - if we hit > 100, we can stop
					depositTXData[address].numNonETHTXs++;
				}
				if (depositTXData[address].numNonETHTXs > 100 || ethers.toBigInt(depositTXData[address].txETHOut) > ethers.parseEther('9000')) { depositTXData[address].isSolo = false; return true; }
			}
			let lastBlock = parseInt(response.result[response.result.length - 1].blockNumber, 10);
			page += 1;
			if (page > 10) { // etherscan won't let you pull more than 10k records across pages from their DB
				page = 1; // so we reset the page
				startBlock = lastBlock; // and update the range
			}
			await getTXs(page, action, address);
		}
	} else if (response.message && response.message === 'NOTOK') {
		console.log(response);
		console.log('Backing off Etherscan for', BACKOFFSECONDS, 'seconds...');
		wait(BACKOFFSECONDS);
		await getTXs(page, action, address);
	} else if (response.message && response.message === 'No transactions found') { // we 're done
		return true;
	} else {
		console.log(response);
		console.log('Backing off Etherscan for', BACKOFFSECONDS, 'seconds...');
		wait(BACKOFFSECONDS);
		await getTXs(page, action, address);
	}
	return true;
}

/**
 * Main function
 * @async
 * @returns {void}
 */
const go = async () => {
	console.log('Unique active deposit addresses:', depositAddresses.length);
	progressBar = new cliProgress.SingleBar({ format: 'Retrieving info: [{bar}] {percentage}% || {value}/{total} deposit addresses || ETA: {eta}s' }, cliProgress.Presets.rect);
	progressBar.start(depositAddresses.length, 0);
	for (let i = 0; i < depositAddresses.length; i++) {
		const thisDepositAddress = depositAddresses[i].depositAddress;
		depositTXData[thisDepositAddress] = { txETHOut: ethers.toBeHex(0), firstTXTimestamp: 0, numNonETHTXs: 0 };
		await getTXs(1, 'txlist', thisDepositAddress);
		DB.prepare('UPDATE depositTransactions SET txETHOut = \'' + depositTXData[thisDepositAddress].txETHOut + '\', firstTXTimestamp = ' + depositTXData[thisDepositAddress].firstTXTimestamp + ', numNonETHTXs = ' + depositTXData[thisDepositAddress].numNonETHTXs + ' WHERE deposit_address = \'' + thisDepositAddress + '\' LIMIT 1').run();
		progressBar.increment();
	}
	DB.close();
	progressBar.stop();
}

go();