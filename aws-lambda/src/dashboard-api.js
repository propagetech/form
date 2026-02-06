const { getForms, getSubmissions } = require("./dynamoStorage");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

exports.handler = async (event) => {
    // CORS Headers
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    try {
        const { siteId, formName, limit, startKey } = event.queryStringParameters || {};
        
        // 1. Get All Websites (Scan - deduplication happens on client or via refined query)
        // If no siteId is provided, we assume the admin wants to list sites.
        // Since we don't have a Sites table, we scan FormSubmissions and aggregate unique siteIds.
        // This is inefficient for large datasets but acceptable for MVP.
        if (!siteId) {
             const command = new ScanCommand({
                TableName: "FormSubmissions",
                ProjectionExpression: "siteId",
                // In a real scenario, we'd limit this or use a separate Sites table
            });
            const response = await docClient.send(command);
            const uniqueSites = [...new Set(response.Items.map(i => i.siteId))];
            return { statusCode: 200, headers, body: JSON.stringify({ items: uniqueSites }) };
        }

        // 2. Get Forms for a Site
        if (siteId && !formName) {
            const forms = await getForms(siteId);
            return { statusCode: 200, headers, body: JSON.stringify({ items: forms }) };
        }

        // 3. Get Entries for a Form
        if (siteId && formName) {
            const result = await getSubmissions(siteId, formName, limit ? parseInt(limit) : 50, startKey ? JSON.parse(startKey) : undefined);
            return { statusCode: 200, headers, body: JSON.stringify(result) };
        }

    } catch (error) {
        console.error("Dashboard API Error:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};
