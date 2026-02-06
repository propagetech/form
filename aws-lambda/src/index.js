const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const { saveSubmission } = require("./dynamoStorage");

const sesClient = new SESv2Client({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
    console.log("Event:", JSON.stringify(event, null, 2));

    // 1. CORS Headers
    const headers = {
        "Access-Control-Allow-Origin": "*", // Configure strict CORS in production
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    try {
        // 2. Parse Body
        const body = JSON.parse(event.body || "{}");
        const { siteId } = event.pathParameters || {};
        const { data, metadata, formName } = body;

        if (!siteId || !data) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Missing siteId or data" })
            };
        }

        // 3. Save to DynamoDB
        const result = await saveSubmission(siteId, formName, data, metadata || {});

        // 4. Send Email (SES)
        const senderEmail = process.env.SENDER_EMAIL;
        const ownerEmail = process.env.OWNER_EMAIL || senderEmail; // Default to sender if not set

        if (senderEmail) {
            const emailSubject = `New Submission for ${siteId} - ${formName || "Default Form"}`;
            const emailBody = `You received a new submission:\n\n${JSON.stringify(data, null, 2)}\n\nID: ${result.id}\nTimestamp: ${result.timestamp}`;

            await sesClient.send(new SendEmailCommand({
                FromEmailAddress: senderEmail,
                Destination: { ToAddresses: [ownerEmail] },
                Content: {
                    Simple: {
                        Subject: { Data: emailSubject },
                        Body: { Text: { Data: emailBody } }
                    }
                }
            }));
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: "Submission received", id: result.id })
        };

    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Internal Server Error", details: error.message })
        };
    }
};
