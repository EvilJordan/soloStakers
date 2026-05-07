source .env
GRAFFITIFILE=slotGraffiti.log

echo "Importing graffiti into db..."
sqlite3 $DATABASE ".mode csv" "$(head -n1 $GRAFFITIFILE | awk -F, '{printf "DROP TABLE IF EXISTS graffiti; CREATE TABLE graffiti ("; for(i=1;i<=NF;i++){col=$i; gsub(/\"/, "", col); if(col=="vindex" || col=="slot"){printf "\"%s\" INTEGER", col}else{printf "\"%s\" TEXT", col} if(i<NF) printf ", "} printf ");"}')" ".import --skip 1 $GRAFFITIFILE graffiti"
