import dotenv from 'dotenv';
dotenv.config({ path: './.env', quiet: true });
import { ethers } from "ethers";
import fs from 'fs';
const depositData = JSON.parse(fs.readFileSync('./deposits.json', 'utf8'));

let numSoloDepositAddresses = 0;
let numNonSoloDepositAddresses = 0;
let numSoloValidators = 0;
let numNonSoloValidators = 0;
let inactive = 0;
let totalValidators = 0;
let numInactiveValidators = 0;
let soloAddresses = [];
const depositAddresses = Object.keys(depositData);

for (let i = 0; i < depositAddresses.length; i++) {
	const thisDepositAddress = depositData[depositAddresses[i]];
	totalValidators += thisDepositAddress.numValidators;
	if (thisDepositAddress.isSolo) {
		if (thisDepositAddress.inactive || !thisDepositAddress.numValidators || !thisDepositAddress.balance || !thisDepositAddress.status || !thisDepositAddress.status.includes('active_ongoing')) {
			numInactiveValidators += thisDepositAddress.numValidators;
			inactive++;
			continue;
		}
		if (thisDepositAddress.numInactiveValidators) { // it's possible status includes other states than active_ongoing
			numSoloValidators += thisDepositAddress.numActiveValidators;
			numInactiveValidators += thisDepositAddress.numInactiveValidators;
		} else {
			numSoloValidators += thisDepositAddress.numValidators;
		}
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

console.log('deposits.json file data:');
console.log('Total Deposit Addresses:', depositAddresses.length);
console.log('Inactive Deposit Addresses:', inactive);
console.log('Active Deposit Addresses:', numSoloDepositAddresses + numNonSoloDepositAddresses);
console.log('Solo Deposit Addresses:', numSoloDepositAddresses, '(' + ((numSoloDepositAddresses / (numSoloDepositAddresses + numNonSoloDepositAddresses)) * 100).toFixed(2) + '%)');
console.log('Non-Solo Deposit Addresses:', numNonSoloDepositAddresses, '(' + ((numNonSoloDepositAddresses / (numSoloDepositAddresses + numNonSoloDepositAddresses)) * 100).toFixed(2) + '%)');
console.log('---');
console.log('Total Validators:', totalValidators);
console.log('Inactive Validators:', numInactiveValidators);
console.log('Active Validators:', totalValidators - numInactiveValidators);
console.log('Solo Validators:', numSoloValidators, '(' + ((numSoloValidators / (totalValidators - numInactiveValidators)) * 100).toFixed(2) + '%)');
console.log('Non-Solo Validators:', numNonSoloValidators, '(' + ((numNonSoloValidators / (totalValidators - numInactiveValidators)) * 100).toFixed(2) + '%)');
console.log('---');
