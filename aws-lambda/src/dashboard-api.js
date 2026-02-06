const { getForms, getSubmissions, deleteSubmission, updateSubmission } = require("./dynamoStorage");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

exports.handler = async (event) => {
    // CORS Headers
    const headers = {
        "Access-Control-Allow-Origin": "*", // Allow all for GitHub Pages
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, x-api-key"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    // AUTHENTICATION CHECK
    // Simple API Key mechanism. In production, use API Gateway Authorizer or Cognito.
    const apiKey = event.headers["x-api-key"] || event.headers["X-Api-Key"];
    const validKey = process.env.ADMIN_API_KEY;

    if (!validKey || apiKey !== validKey) {
        return { 
            statusCode: 401, 
            headers, 
            body: JSON.stringify({ error: "Unauthorized: Invalid or missing x-api-key" }) 
        };
    }

    try {
        const method = event.httpMethod;
        const query = event.queryStringParameters || {};
        const body = event.body ? JSON.parse(event.body) : {};
        
        // --- READ OPERATIONS (GET) ---
        if (method === "GET") {
            const { siteId, formName, limit, startKey } = query;

            // 1. Get All Websites
            if (!siteId) {
                const command = new ScanCommand({
                    TableName: "FormSubmissions",
                    ProjectionExpression: "siteId"
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
        }

        // --- WRITE OPERATIONS (DELETE, PUT) ---
        // Expecting body: { siteId, formName, timestamp, uuid, updates? }
        
        if (method === "DELETE") {
            const { siteId, formName, timestamp, uuid } = body;
            if (!siteId || !formName || !timestamp || !uuid) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields for deletion" }) };
            }
            await deleteSubmission(siteId, formName, timestamp, uuid);
            return { statusCode: 200, headers, body: JSON.stringify({ message: "Deleted successfully" }) };
        }

        if (method === "PUT") {
            const { siteId, formName, timestamp, uuid, updates } = body;
            if (!siteId || !formName || !timestamp || !uuid || !updates) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields for update" }) };
            }
            await updateSubmission(siteId, formName, timestamp, uuid, updates);
            return { statusCode: 200, headers, body: JSON.stringify({ message: "Updated successfully" }) };
        }

        return { statusCode: 400, headers, body: JSON.stringify({ error: "Unsupported method or missing parameters" }) };

    } catch (error) {
        console.error("Dashboard API Error:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};
