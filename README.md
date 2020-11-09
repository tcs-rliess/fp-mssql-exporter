# FP MSSQL Exporter / Importer

This repository creates a docker container that can be used to 

* Call a stored procedure on a MS SQL Server (with a cursor) to get the latest items of some query
* Send all items to SQS

## Terminology

A docker container can run exactly one exporter job on a scheduled basis (e.g. every 10 minutes).

An Exporter will get a `FLEETPLAN_QUEUE_UUID` (for example `50aca7b6-9153-42ac-9da0-43bc25c7ea21`) and a `CURSOR_NAME` (usually `id`). The value of `CURSOR_NAME` is the name of PrimaryKey / UniqueKey of the returned data. The data returned **must be sorted** by this row in ascending order.

The routine will run every `n` seconds (`n` can be set in `EXECUTE_INTERVAL`) and execute a stored procedure defined in `MSSQL_SPROC_NAME`.
The data returned should contain max. 50 rows and will be sent as single messages to a SQS FIFO queue.

As this will spool all new rows of a table to Fleetplan the table to query should be a "log-like" table. Not a table where changes in the data occur. **Important: UPDATE and DELETE statements will not be detected.**

## Setup for a new customer

Follow these steps to set up a new customer

### Create a stored procedure to query the data.

Example:

```
USE [TheDatabase]
GO
SET ANSI_NULLS OFF
GO
SET QUOTED_IDENTIFIER OFF
GO

CREATE PROCEDURE [dbo].[logDataGet] 
@cursor Int
AS

SET NOCOUNT ON
SELECT TOP 5
  id,
  kid,
  timestamp,
  app,
  description,
  account
FROM KundenLog
WHERE id > @cursor
ORDER BY id
```

### Create a new UUID

You may use this tool: https://www.uuidtools.com/v4

Save a file with the name of the created UUID in S3. The content of the file should be the `cursor` to start the query. 

For example: If the customer table contains a lot of data you might want to start at a later id. Like '180000'. In this case save a file with the content of `180000` and the name of the UUID in the S3 folder `mssql-exporter-cursors`.

### Start the docker container in the customers network

The container must have network access to the customers MS-SQL Server. To start the container supply all needed environment variables (see below) to the container.

Example:


## Environment variables

| name                   | default        | description                        |
| -----------------------| ---------------|------------------------------------|
| MSSQL_SERVER           | localhost      | required                           |
| MSSQL_PORT             | 1433           | required                           |
| MSSQL_USER             | null           | required                           |
| MSSQL_PASSWORD         | null           | required                           |
| MSSQL_DATABASE         | null           | required                           |
| MSSQL_SPROC_NAME       | null           | required                           |
| AWS_ACCESS_KEY_ID      | NONE           | required                           |
| AWS_SECRET_ACCESS_KEY  | NONE           | required                           |
| AWS_SQS_QUEUE          | null           | MSSQL-Exporter.fifo                |
| FLEETPLAN_QUEUE_UUID   | null           | required                           |
| CURSOR_NAME            | id             | The name of the range key          |
| EXECUTE_INTERVAL       | 600            | Execute interval in seconds        |

## Build the docker container

`docker build -t fp-mssql-exporter .`

## Run the docker container

Configure the docker.env file with the correct values (see environment variables above).

Run: `docker run -ti --env-file docker.env fp-mssql-exporter`