source .env

echo "Creating database indexes..."
sqlite3 $DATABASE \
"DROP INDEX IF EXISTS withdrawal_credentials_index; \
DROP INDEX IF EXISTS pubkey_index; \
DROP INDEX IF EXISTS withdrawal_credentials_deposits_index; \
DROP INDEX IF EXISTS deposit_address_deposits_index; \
DROP INDEX IF EXISTS pubkey_deposits_index; \
DROP INDEX IF EXISTS vindex_index; \
CREATE INDEX IF NOT EXISTS withdrawal_credentials_index ON validators (withdrawal_credentials); \
CREATE INDEX IF NOT EXISTS pubkey_index ON validators (pubkey); \
CREATE INDEX IF NOT EXISTS withdrawal_credentials_deposits_index ON deposits (withdrawal_credentials); \
CREATE INDEX IF NOT EXISTS deposit_address_deposits_index ON deposits (deposit_address); \
CREATE INDEX IF NOT EXISTS pubkey_deposits_index ON deposits (pubkey); \
CREATE INDEX IF NOT EXISTS vindex_index ON graffiti (vindex);"
echo "Done!"
