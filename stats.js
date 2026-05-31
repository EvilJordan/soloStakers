import dotenv from 'dotenv';
dotenv.config({ path: './.env', quiet: true });
import Database from 'better-sqlite3';
import { ethers } from "ethers";
import fs from 'fs';
const depositData = JSON.parse(fs.readFileSync('./deposits.json', 'utf8'));

let numSoloDepositAddresses = 0;
let numNonSoloDepositAddresses = 0;
let numSoloValidators = 0;
let numNonSoloValidators = 0;
let inactive = 0;
let totalValidators = 0;
let totalInactiveValidators = 0;
let soloAddresses = [];
const depositAddresses = Object.keys(depositData);

for (let i = 0; i < depositAddresses.length; i++) {
	const thisDepositAddress = depositData[depositAddresses[i]];
	totalValidators += thisDepositAddress.numValidators;
	if (thisDepositAddress.isSolo) {
		if (thisDepositAddress.inactive || !thisDepositAddress.numValidators || !thisDepositAddress.balance || !thisDepositAddress.status || !thisDepositAddress.status.includes('active_ongoing')) {
			totalInactiveValidators += thisDepositAddress.numValidators;
			inactive++;
			continue;
		}
		numSoloValidators += thisDepositAddress.numValidators; // it's possible status includes other states than active_ongoing, in which case this number is not accurate
		numSoloDepositAddresses++;
		if (process.argv[2] === '--save') { soloAddresses.push(depositAddresses[i]); }
	}
	else {
		numNonSoloValidators += thisDepositAddress.numValidators;
		numNonSoloDepositAddresses++;
	}
}

if (process.argv[2] === '--save') {
	fs.writeFileSync('./soloAddresses.json', JSON.stringify(soloAddresses, null, '\t'));
}

/*
const DB = new Database(process.env.DATABASE, { readonly: true });
DB.pragma('journal_mode = WAL');
const depositAddressesDB = DB.prepare("SELECT * FROM depositTransactions WHERE firstTXTimestamp > 0").all();

let numSoloDepositAddressesDB = 0;
let numNonSoloDepositAddressesDB = 0;
for (let i = 0; i < depositAddressesDB.length; i++) {
	const thisDepositAddress = depositAddressesDB[i];
	if (thisDepositAddress.numNonETHTXs > 100 || ethers.toBigInt(thisDepositAddress.txETHOut) > ethers.parseEther('9000')) {
		numNonSoloDepositAddressesDB++;
		continue;
	}
	numSoloDepositAddressesDB++;
}
*/

console.log('deposits.json file data:');
console.log('Total Deposit Addresses:', depositAddresses.length);
console.log('Inactive Deposit Addresses:', inactive);
console.log('Active Deposit Addresses:', numSoloDepositAddresses + numNonSoloDepositAddresses);
console.log('Solo Deposit Addresses:', numSoloDepositAddresses, '(' + ((numSoloDepositAddresses / (numSoloDepositAddresses + numNonSoloDepositAddresses)) * 100).toFixed(2) + '%)');
console.log('Non-Solo Deposit Addresses:', numNonSoloDepositAddresses, '(' + ((numNonSoloDepositAddresses / (numSoloDepositAddresses + numNonSoloDepositAddresses)) * 100).toFixed(2) + '%)');
console.log('---');
console.log('Total Validators:', totalValidators);
console.log('Inactive Validators:', totalInactiveValidators);
console.log('Active Validators:', totalValidators - totalInactiveValidators);
console.log('Solo Validators:', numSoloValidators, '(' + ((numSoloValidators / (totalValidators - totalInactiveValidators)) * 100).toFixed(2) + '%)');
console.log('Non-Solo Validators:', numNonSoloValidators, '(' + ((numNonSoloValidators / (totalValidators - totalInactiveValidators)) * 100).toFixed(2) + '%)');
/*
console.log('-----');
console.log('depositTransactions DB data:');
console.log('Total Validators:', depositAddressesDB.length);
console.log('Solo:', numSoloDepositAddressesDB);
console.log('Non-Solo:', numNonSoloDepositAddressesDB, '(' + ((numNonSoloDepositAddressesDB / depositAddressesDB.length) * 100).toFixed(2) + '%)');
*/
