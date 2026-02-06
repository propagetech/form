const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { removeUndefinedValues: true }
});

const TABLE_NAME = "FormSubmissions";

/**
 * Save a new submission to DynamoDB.
 * Also updates the form metadata counter.
 */
async function saveSubmission(siteId, formName, data, metadata) {
    const timestamp = new Date().toISOString();
    const uuid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    const safeFormName = (formName || "default").replace(/[^a-zA-Z0-9-_]/g, "_");

    const submissionItem = {
        PK: `SITE#${siteId}`,
        SK: `SUBMISSION#${safeFormName}#${timestamp}#${uuid}`,
        siteId,
        formName: safeFormName,
        submittedAt: timestamp,
        id: uuid,
        data,
        metadata
    };

    // 1. Save Submission
    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: submissionItem
    }));

    // 2. Update Form Metadata (Fire and forget or await, depending on consistency needs. Await is safer)
    try {
        await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `SITE#${siteId}`,
                SK: `FORM#${safeFormName}`
            },
            UpdateExpression: "SET #count = if_not_exists(#count, :start) + :inc, lastSubmissionAt = :ts",
            ExpressionAttributeNames: { "#count": "submissionCount" },
            ExpressionAttributeValues: {
                ":start": 0,
                ":inc": 1,
                ":ts": timestamp
            }
        }));
    } catch (e) {
        console.warn("Failed to update form metadata:", e.message);
        // Non-fatal
    }

    return { id: uuid, timestamp };
}

/**
 * Get all forms for a specific site.
 */
async function getForms(siteId) {
    const command = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
            ":pk": `SITE#${siteId}`,
            ":sk": "FORM#"
        }
    });

    const response = await docClient.send(command);
    return response.Items.map(item => ({
        formName: item.SK.split("#")[1],
        submissionCount: item.submissionCount,
        lastSubmissionAt: item.lastSubmissionAt
    }));
}

/**
 * Get submissions for a specific form.
 * Supports pagination via lastEvaluatedKey.
 */
async function getSubmissions(siteId, formName, limit = 50, startKey = null) {
    const safeFormName = (formName || "default").replace(/[^a-zA-Z0-9-_]/g, "_");
    
    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
            ":pk": `SITE#${siteId}`,
            ":sk": `SUBMISSION#${safeFormName}#`
        },
        Limit: limit,
        ScanIndexForward: false // Newest first
    };

    if (startKey) {
        params.ExclusiveStartKey = startKey;
    }

    const response = await docClient.send(new QueryCommand(params));
    
    return {
        items: response.Items,
        lastEvaluatedKey: response.LastEvaluatedKey
    };
}

module.exports = { saveSubmission, getForms, getSubmissions };
