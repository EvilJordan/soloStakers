import dotenv from 'dotenv';
dotenv.config({ path: './.env', quiet: true });
import fs from 'fs';
import Database from 'better-sqlite3';
import cliProgress from 'cli-progress';
import { ethers } from "ethers";

const DB = new Database(process.env.DATABASE, { readonly: true });
DB.pragma('journal_mode = WAL');

// determine if depositTransactions table has any data in it, because it might not yet
const depositTransactionsLength = DB.prepare("SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='depositTransactions')").pluck().all();
let depositAddresses;
if (process.argv[2] === '--reset' || !depositTransactionsLength || depositTransactionsLength == 0) {
	depositAddresses = DB.prepare("SELECT DISTINCT(deposits.deposit_address) AS depositAddress, 'numTXs' = 0, 'numNonETHTXs' = 0, 'txETHOut' = 0 FROM deposits").all();
	console.log('numTXs set to 0 for deposits.');
	console.log('numNonETHTXs set to 0 for deposits.');
	console.log('txETHOut set to 0 for deposits.');
	console.log('Unique deposit addresses:', depositAddresses.length);
} else {
	depositAddresses = DB.prepare("SELECT DISTINCT(deposits.deposit_address) AS depositAddress, numTXs, numNonETHTXs, txETHOut FROM deposits, depositTransactions WHERE deposits.deposit_address = depositTransactions.deposit_address").all();
	console.log('Unique active deposit addresses:', depositAddresses.length);
}
// depositAddresses = [ { depositAddress: process.env.TESTDEPOSITADDRESS.toLowerCase() } ];
let progressBar;
progressBar = new cliProgress.SingleBar({ format: 'Retrieving info: [{bar}] {percentage}% || {value}/{total} deposit addresses || ETA: {eta}s' }, cliProgress.Presets.rect);
progressBar.start(depositAddresses.length, 0);

let depositData = {};
// command line argument to start from scratch
if (process.argv[2] === '--reset') {
	try {
		fs.unlinkSync('./deposits.json');
	} catch(e) {
		// continue
	}
} else { // load any existing deposits.json file so we can patch deposit addresses
	depositData = JSON.parse(fs.readFileSync('./deposits.json', 'utf8'));
}

const graffitiExclusions = fs.readFileSync('./graffitiExclusions.txt', 'utf8').split(/\r?\n/);
const inclusions = JSON.parse(fs.readFileSync('./inclusions.json', 'utf8'));
const exclusions = JSON.parse(fs.readFileSync('./exclusions.json', 'utf8'));
const withdrawal_addressRegex = /0x01|0x02/;

// pull all withdrawal_credentials and pubkeys for a given deposit address and creates a lookup list with deposit_address as the key
for (let i = 0; i < depositAddresses.length; i++) {
	const depositAddress = depositAddresses[i].depositAddress;
	let depositAddressData = {};
	if (process.argv[2] === '--reset') { // we can skip if not doing a --reset and only process the second run stuff
		depositAddressData = { isSolo: true, withdrawalAddresses: [], pubkeys: [], vindex: [], graffiti: [] };
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
				for (let j = 0; j < depositAddressData.graffiti.length; j++) {
					const graffiti = depositAddressData.graffiti[j];
					if (!depositAddressData.isSolo) { continue; }
					let decodedGraffiti;
					try {
						decodedGraffiti = ethers.toUtf8String(graffiti).toLowerCase(); // decode graffiti and compare against our graffiti exclusions
					} catch (e) {
						continue; // unable to decode the graffiti, so we're just gonna let it pass for now
					}
					if (decodedGraffiti) {
						graffitiExclusions.forEach(graffitiExclusion => {
							const regex = new RegExp(graffitiExclusion, "gi");
							if (decodedGraffiti.toLowerCase().match(regex)) {
								depositAddressData.isSolo = false; // graffiti matches our known exclusion list, not a solo staker
								if (!depositAddressData.reason) { depositAddressData.reason = []; }
								depositAddressData.reason.push('matchedGraffiti (' + graffitiExclusion + ')');
								return
							}
						});
					}
				}
			}
		}
		// if effective staked balance is > 2560, not a solo staker
		if (depositAddressData.balance && ( parseInt(ethers.formatUnits(depositAddressData.balance, "gwei"), 10) > 2560) ) {
			depositAddressData.isSolo = false;
			if (!depositAddressData.reason) { depositAddressData.reason = []; }
			depositAddressData.reason.push('balance');
		}

		// explicit inclusions or exclusions
		if (inclusions.includes(depositAddress)) {
			depositAddressData.isSolo = true;
			if (!depositAddressData.reason) { depositAddressData.reason = []; }
			if (!depositAddressData.reason.includes('explicitInclusion')) {
				depositAddressData.reason.push('explicitInclusion');
			}
		}
		if (exclusions.includes(depositAddress)) {
			depositAddressData.isSolo = false;
			if (!depositAddressData.reason) { depositAddressData.reason = []; }
			depositAddressData.reason.push('explicitExclusion');
		}

		// set the inactive flag to true for this deposit address to prevent further unnecessary processing
		if (!depositAddressData.numValidators || !depositAddressData.balance || !depositAddressData.status || !depositAddressData.status.includes('active_ongoing')) {
			depositAddressData.inactive = true; 
		}

		// separate out active and non-active validators for more accurate reporting - do not rely on these numbers for validators that are completely inactive or active
		if (depositAddressData.status?.length > 1 && depositAddressData.status?.includes('active_ongoing')) {
			const activeValidatorQuery = DB.prepare('SELECT COUNT(status) AS activeValidators FROM validators WHERE vindex IN ('+ depositAddressData.vindex.join(',') + ') AND status = \'active_ongoing\'').pluck().all();
			depositAddressData.numActiveValidators = activeValidatorQuery[0]; 
			depositAddressData.numInactiveValidators = depositAddressData.numValidators - activeValidatorQuery[0];
		}
	} else { // second and third-run processing
		depositAddressData = depositData[depositAddress];
		// if numTXs > 10,000, not a solo staker
		depositAddressData.numTXs = depositAddresses[i].numTXs;
		if (depositAddressData.numTXs >= 10000) {
			depositAddressData.isSolo = false;
			if (!depositAddressData.reason) { depositAddressData.reason = []; }
			depositAddressData.reason.push('numTXs');
		}
		// if number of 0 ETH outgoing transactions > 100, not a solo staker
		depositAddressData.numNonETHTXs = depositAddresses[i].numNonETHTXs;
		if (depositAddressData.numNonETHTXs > 100) {
			depositAddressData.isSolo = false;
			if (!depositAddressData.reason) { depositAddressData.reason = []; }
			depositAddressData.reason.push('numNonETHTXs');
		}
		// if amount of ETH in outgoing transactions > 9,000, not a solo staker
		depositAddressData.txETHOut = depositAddresses[i].txETHOut;
		if (ethers.toBigInt(depositAddressData.txETHOut ? depositAddressData.txETHOut : 0) > ethers.parseEther('9000')) {
			depositAddressData.isSolo = false;
			if (!depositAddressData.reason) { depositAddressData.reason = []; }
			depositAddressData.reason.push('txETHOut');
		}
		if (inclusions.includes(depositAddress)) {
			depositAddressData.isSolo = true;
			if (!depositAddressData.reason) { depositAddressData.reason = []; }
			if (!depositAddressData.reason.includes('explicitInclusion')) {
				depositAddressData.reason.push('explicitInclusion');
			}
		}
	}

	depositData[depositAddress] = depositAddressData;
	progressBar.update(i);
}

fs.writeFileSync('./depositsTemp.json', JSON.stringify(depositData, null, '\t'));
fs.renameSync('./depositsTemp.json', './deposits.json');
progressBar.stop();
DB.close();
