echo "Creating database indexes..."
sqlite3 $DATABASE "CREATE INDEX IF NOT EXISTS withdrawal_credentials_index ON validators (withdrawal_credentials); CREATE INDEX IF NOT EXISTS pubkey_index ON validators (pubkey); CREATE INDEX IF NOT EXISTS withdrawal_credentials_deposits_index ON deposits (withdrawal_credentials); CREATE INDEX IF NOT EXISTS deposit_address_deposits_index ON deposits (deposit_address); CREATE INDEX IF NOT EXISTS pubkey_deposits_index ON deposits (pubkey);" ".quit"
echo "Done!"
