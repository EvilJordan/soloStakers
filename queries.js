import dotenv from 'dotenv';
dotenv.config({ path: './.env', quiet: true });
import fs from 'fs';
import Database from 'better-sqlite3';
import cliProgress from 'cli-progress';
import { ethers } from "ethers";

const DB = new Database(process.env.DATABASE);
DB.pragma('journal_mode = WAL');

let depositAddresses = DB.prepare("SELECT DISTINCT(deposits.deposit_address) AS depositAddress, numTXs FROM deposits, depositTransactions WHERE deposits.deposit_address = depositTransactions.deposit_address").all();
console.log('Unique deposit addresses:', depositAddresses.length);
// depositAddresses = [ { depositAddress: process.env.TESTDEPOSITADDRESS.toLowerCase() } ];
let progressBar;
progressBar = new cliProgress.SingleBar({ format: 'Retrieving info: [{bar}] {percentage}% || {value}/{total} deposit addresses || ETA: {eta}s' }, cliProgress.Presets.rect);
progressBar.start(depositAddresses.length, 0);

try {
	fs.unlinkSync('./deposits.json');
} catch(e) {
	// continue
}
const stream = fs.createWriteStream('./deposits.json');
stream.write('{\n');
let comma = ','
const withdrawal_addressRegex = /0x01|0x02/;

// pull all withdrawal_credentials and pubkeys for a given deposit address and creates a lookup list with deposit_address as the key
for (let i = 0; i < depositAddresses.length; i++) {
	const depositAddress = depositAddresses[i].depositAddress;
	const depositAddressData = { numTXs: depositAddresses[i].numTXs, withdrawalAddresses: [], pubkeys: [], vindex: [], graffiti: [] };
	let query = DB.prepare("SELECT GROUP_CONCAT(DISTINCT(withdrawal_credentials)) AS withdrawal_address FROM deposits WHERE deposit_address = '" + depositAddress + "'").all();
	if (query[0].withdrawal_address?.length > 0) {
		depositAddressData.withdrawalAddresses = query[0].withdrawal_address.split(",");
	}
	query = DB.prepare("SELECT GROUP_CONCAT(DISTINCT(pubkey)) AS pubkey FROM deposits WHERE deposit_address = '" + depositAddress + "'").all();
	if (query[0].pubkey?.length > 0) {
		depositAddressData.pubkeys = query[0].pubkey.split(",");
	}

	// for each deposit_address, pull updated withdrawal_credentials from the latest validator set and add to our lookup object, along with other metadata
	query = DB.prepare("SELECT GROUP_CONCAT(DISTINCT status) AS status, COUNT(status) AS numValidators, GROUP_CONCAT(DISTINCT vindex) AS vindices, SUM(balance) AS balance, withdrawal_credentials AS withdrawal_address FROM (SELECT DISTINCT(pubkey) AS pubkey1 FROM deposits WHERE deposit_address = '" + depositAddress + "'), validators WHERE pubkey1 = pubkey").all();
	if (query[0].status?.length > 0) {
		depositAddressData.status = query[0].status.split(","); // what if only some of the validators are active_ongoing?
	}
	depositAddressData.numValidators = query[0].numValidators;
	depositAddressData.balance = query[0].balance;
	depositAddressData.withdrawalAddresses.push(...[ query[0].withdrawal_address ].filter(address => withdrawal_addressRegex.test(address))); // filter withdrawal_address (withdrawal_credentials) and only pull out ones that are 0x01 or 0x02
	depositAddressData.withdrawalAddresses = [...new Set(depositAddressData.withdrawalAddresses)]; // dedupe withdrawalAddresses
	if (query[0].vindices?.length > 0) {
		depositAddressData.vindex = query[0].vindices.split(",");
		// for each vindex, pull the graffiti associated with it
		query = DB.prepare("SELECT GROUP_CONCAT(DISTINCT(graffiti)) AS graffiti FROM graffiti WHERE vindex IN (" + query[0].vindices + ")").all();
		if (query[0].graffiti?.length > 0) {
			depositAddressData.graffiti = query[0].graffiti.split(",");
		}
	}
	// if our status field contains anything other than active_ongoing, we need to create a new object to determine which indexes, pubkeys, and withdrawal_credentials are not part of the active set?
	// pull in numTXs from depositTransactions
	if (i == depositAddresses.length - 1) { comma = ''; }
	stream.write('"' + depositAddress + '": ' + JSON.stringify(depositAddressData, null, '\t') + comma + '\n');
	progressBar.update(i);
}

stream.write('}\n');
stream.end();
progressBar.stop();
DB.close();

/*
statuses:
active_ongoing
withdrawal_possible
withdrawal_done
active_exiting
exited_slashed
pending_initialized
exited_unslashed
pending_queued
*/
