let config = require("../config.json");

config.execute_interval = process.env.EXECUTE_INTERVAL || config.execute_interval;
config.cursor_name = process.env.CURSOR_NAME || config.cursor_name;
config.fleetplan_queue_uuid = process.env.FLEETPLAN_QUEUE_UUID;
config.mssql.server = process.env.MSSQL_SERVER;
config.mssql.user = process.env.MSSQL_USER;
config.mssql.password = process.env.MSSQL_PASSWORD;
config.mssql.database = process.env.MSSQL_DATABASE;
config.mssql.port = process.env.MSSQL_PORT || config.mssql.port;
config.mssql_sproc_name = process.env.MSSQL_SPROC_NAME;
config.sqs_credentials.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
config.sqs_credentials.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
// console.log(config)
module.exports = config;
/*
"user"    : "webmart_user",
"password": "cms83qvr",
"server"  : "pikachu.webmart.net",
"database": "WMModules",
"connectionTimeout": 5000,
"encrypt": false,
"options": {
	"enableArithAbort": true
}
*/