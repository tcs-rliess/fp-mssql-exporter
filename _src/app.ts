// Config
const config = require("./config");
import * as fs from "fs";
import * as _ from "lodash";
import * as sql from "mssql";
import * as async from "async";
const VERSION = JSON.parse(fs.readFileSync("package.json").toString()).version;

import S3 from 'aws-sdk/clients/s3';
const s3 = new S3(_.extend({apiVersion: "2006-03-01"}, config.aws_credentials));
import SQS from 'aws-sdk/clients/sqs';
const sqs = new SQS(_.extend({apiVersion: "2012-11-05"}, config.aws_credentials));

let QUERY_RUNNING = 0;

class Exporter {
	private db = null;
	constructor() {
		this.initDb((err, resp) => {
			if (err) {
				console.log("Database connection error", err);
				process.exit(1);
			}
			console.log(`Database connected.`);
			// Start the getData routine once on startup
			this.getData();
			// And then every n seconds
			setInterval(this.getData, config.execute_interval * 1000);
		});

	}
	
	private cursorGet (cb) {
		const params = {
			Bucket: config.s3.Bucket,
			Key: config.fleetplan_queue_uuid
		}
		
		s3.getObject(params, function(err, data) {
			if (err) {
				console.log("ERROR", err, err.stack);
				process.exit(1);
			}
			cb(null, data.Body.toString());
		});
	}

	private cursorSet (value, cb) {
		const params = {
			Bucket: config.s3.Bucket,
			Key: config.fleetplan_queue_uuid,
			Body: `${value}`
		}
		s3.putObject(params, cb);
	}

	private initDb (cb) {
		this. db = new sql.ConnectionPool(config.mssql);
		this.db.connect((err) => {
			cb(err, true)
			this.db.on("error", (err) => {
				console.log("Database error", err);
				return;
			});
		});
	}

	private getData = () => {
		console.log(`Trying to fetch data. Calling stored procedure '${config.mssql_sproc_name}'`)
		QUERY_RUNNING++;
		if (QUERY_RUNNING > 1) {
			// There is already a query running.
			if (QUERY_RUNNING > 3) {
				// More than 3 tries did not finish and return data
				console.log("Failed too often. Exiting");
				process.exit(1);
			}
			return;
		}
		QUERY_RUNNING = QUERY_RUNNING + 1;
		this.cursorGet((err, cursor) => {
			const request = new sql.Request(this.db);
			request.input("cursor", sql.Int, cursor);
			request.execute(config.mssql_sproc_name, (err, resp) => {
				if (err) {
					console.log("Error executing stored procedure:" + config.mssql_sproc_name, err);
					process.exit(1);
				}
				QUERY_RUNNING = 0;
				if (resp.recordset.length === 0) {
					console.log(`No data received. Waiting ${config.execute_interval} seconds.`)
				}
				if (resp.recordset.length) {
					// We found some data.
					console.log("DATA", resp.recordset)
					// Make sure we don't get flooded
					if (resp.recordset.length > 50) {
						console.log("Error: Please return max. 50 rows from stored procedure" + config.mssql_sproc_name);
						process.exit(1);
					}
					// Make sure the process.env.CURSOR_NAME / config.cursor_name is present in the query
					if (!resp.recordset[0][config.cursor_name]) {
						console.log("Error: Must supply the", config.cursor_name, "field in the returned query result.");
						process.exit(1);
					}
					this.storeMessages(resp.recordset, (err) => {
						if (err) {
							console.log("Error: Storing messages failed", err);
							process.exit(1);
						}
					});
				}
			});
		});
	}
	private storeMessages(rows: Array<object>, cb) {
		// We want to store max 4 messages at a time. So we can keep the 64kb max size per message.
		const jobs = [];
		let messagepacket = {
			Entries: [],
			QueueUrl: "https://sqs.eu-central-1.amazonaws.com/151879656186/MSSQL-Exporter.fifo"
		}
		// Send all rows as messages to SQS
		for (let row of rows) {
			const o = {
				fleetplan_queue_uuid: config.fleetplan_queue_uuid, // This can be used by FP to identify the customer / data set
				row: row,
				MessageDeduplicationId: config.fleetplan_queue_uuid + "_" + row[config.cursor_name]
			}
			// a single row
			messagepacket.Entries.push(
				{
					Id: o.MessageDeduplicationId,
					MessageBody: JSON.stringify(o),
					MessageDeduplicationId: o.MessageDeduplicationId,
					MessageGroupId: config.fleetplan_queue_uuid
				}
			);
			if (messagepacket.Entries.length === 4) {
				// Send the message
				const params = _.cloneDeep(messagepacket);
				jobs.push(
					(callback) => {
						sqs.sendMessageBatch(params, callback);
					}
				)
				messagepacket.Entries = [];
			}
		}
		if (messagepacket.Entries.length) {
			// Flush the last message
			const params = _.cloneDeep(messagepacket);
			jobs.push(
				(callback) => {
					sqs.sendMessageBatch(params, callback);
				}
			)
		}
		async.series(jobs, (err, results) => {
			if (err) {
				console.log("Error sending messages", err);
				process.exit(1);
			}
			const lastid = _.last(rows)[config.cursor_name];
			console.log("SUCCESS", JSON.stringify(results, null, 2));
			this.cursorSet(lastid, (err, resp) => {
				if (err) {
					console.log("Error setting last cursor", err);
					process.exit(1);
				}
				console.log("Success setting cursor", resp);
			})
		})
		
	}
}

new Exporter();

// trap sigint and exit process - this is needed to make ctrl+c work in docker
process.on("SIGINT", () => {
	console.log("Received SIGINT, stopping application");
	process.exit();
});
