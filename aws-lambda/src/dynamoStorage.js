const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
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

    // 2. Update Form Metadata
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
    }

    return { id: uuid, timestamp };
}

/**
 * Delete a submission.
 * Note: Requires exact timestamp to construct the SK.
 * If timestamp is not provided, we might need to query first (less efficient).
 * For this API, we will require 'timestamp' and 'id' in the request to delete.
 */
async function deleteSubmission(siteId, formName, timestamp, uuid) {
    const safeFormName = (formName || "default").replace(/[^a-zA-Z0-9-_]/g, "_");
    
    await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: `SITE#${siteId}`,
            SK: `SUBMISSION#${safeFormName}#${timestamp}#${uuid}`
        }
    }));
    
    // Optional: Decrement count (skipping for simplicity/performance as counts are approximate metrics)
    return true;
}

/**
 * Update a submission (e.g. mark as read, update data).
 */
async function updateSubmission(siteId, formName, timestamp, uuid, updates) {
    const safeFormName = (formName || "default").replace(/[^a-zA-Z0-9-_]/g, "_");
    
    // Construct UpdateExpression dynamically
    let updateExp = "SET";
    const expNames = {};
    const expValues = {};
    
    Object.keys(updates).forEach((key, idx) => {
        const attrName = `#attr${idx}`;
        const attrVal = `:val${idx}`;
        updateExp += ` ${attrName} = ${attrVal},`;
        expNames[attrName] = key;
        expValues[attrVal] = updates[key];
    });
    
    // Remove trailing comma
    updateExp = updateExp.slice(0, -1);

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: `SITE#${siteId}`,
            SK: `SUBMISSION#${safeFormName}#${timestamp}#${uuid}`
        },
        UpdateExpression: updateExp,
        ExpressionAttributeNames: expNames,
        ExpressionAttributeValues: expValues
    }));
    
    return true;
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

module.exports = { saveSubmission, deleteSubmission, updateSubmission, getForms, getSubmissions };
