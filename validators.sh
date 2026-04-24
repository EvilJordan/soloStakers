source .env

echo "Retrieving latest validator list from RPC node..."
curl $CLRPCADDRESS:$CLRPCPORT/eth/v1/beacon/states/head/validators > validators.json

echo "Extracting relevant validator data into CSV..."
jq -r ' (["vindex","balance","status","pubkey","withdrawal_credentials"]), (.data[] | [ .index, .balance, .status, .validator.pubkey, .validator.withdrawal_credentials ]) | @csv ' validators.json > validators.csv

echo "Importing validators into db..."
sqlite3 $DATABASE ".mode csv" "$(head -n1 validators.csv | awk -F, '{printf "DROP TABLE validators; CREATE TABLE validators ("; for(i=1;i<=NF;i++){col=$i; gsub(/\"/, "", col); if(col=="vindex"){printf "\"%s\" INTEGER", col}else{printf "\"%s\" TEXT", col} if(i<NF) printf ", "} printf ");"}')" ".import --skip 1 validators.csv validators"

echo "Cleaning up..."
rm validators.json
rm validators.csv
echo "Done!"
