const { saveSubmission, getForms, getSubmissions, deleteSubmission, updateSubmission } = require("../src/dynamoStorage");
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { mockClient } = require("aws-sdk-client-mock");

// Mock the DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

async function runTests() {
    console.log("🧪 Starting DynamoDB Storage Tests...");

    // Test 1: Save Submission
    console.log("\nTest 1: saveSubmission");
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});

    const siteId = "site_123";
    const formName = "contact_us";
    const data = { name: "John Doe", email: "john@example.com" };
    const metadata = { ip: "127.0.0.1" };
    let submissionResult;

    try {
        submissionResult = await saveSubmission(siteId, formName, data, metadata);
        console.log("✅ saveSubmission passed:", submissionResult);
        if (!submissionResult.id || !submissionResult.timestamp) throw new Error("Missing ID or timestamp");
    } catch (e) {
        console.error("❌ saveSubmission failed:", e);
    }

    // Test 2: Get Forms
    console.log("\nTest 2: getForms");
    ddbMock.on(QueryCommand).resolves({
        Items: [
            { PK: `SITE#${siteId}`, SK: `FORM#${formName}`, submissionCount: 5, lastSubmissionAt: new Date().toISOString() },
            { PK: `SITE#${siteId}`, SK: `FORM#newsletter`, submissionCount: 10, lastSubmissionAt: new Date().toISOString() }
        ]
    });

    try {
        const forms = await getForms(siteId);
        console.log("✅ getForms passed:", forms);
        if (forms.length !== 2) throw new Error("Expected 2 forms");
        if (forms[0].formName !== formName) throw new Error("Form name mismatch");
    } catch (e) {
        console.error("❌ getForms failed:", e);
    }

    // Test 3: Get Submissions
    console.log("\nTest 3: getSubmissions");
    ddbMock.on(QueryCommand).resolves({
        Items: [
            { PK: `SITE#${siteId}`, SK: `SUBMISSION#${formName}#1`, data: { name: "A" } },
            { PK: `SITE#${siteId}`, SK: `SUBMISSION#${formName}#2`, data: { name: "B" } }
        ],
        LastEvaluatedKey: { some: "key" }
    });

    try {
        const submissions = await getSubmissions(siteId, formName, 10);
        console.log("✅ getSubmissions passed:", submissions);
        if (submissions.items.length !== 2) throw new Error("Expected 2 submissions");
        if (!submissions.lastEvaluatedKey) throw new Error("Expected LastEvaluatedKey");
    } catch (e) {
        console.error("❌ getSubmissions failed:", e);
    }

    // Test 4: Update Submission
    console.log("\nTest 4: updateSubmission");
    ddbMock.on(UpdateCommand).resolves({});
    try {
        await updateSubmission(siteId, formName, submissionResult.timestamp, submissionResult.id, { read: true });
        console.log("✅ updateSubmission passed");
    } catch (e) {
        console.error("❌ updateSubmission failed:", e);
    }

    // Test 5: Delete Submission
    console.log("\nTest 5: deleteSubmission");
    ddbMock.on(DeleteCommand).resolves({});
    try {
        await deleteSubmission(siteId, formName, submissionResult.timestamp, submissionResult.id);
        console.log("✅ deleteSubmission passed");
    } catch (e) {
        console.error("❌ deleteSubmission failed:", e);
    }

    console.log("\n🏁 Tests Complete.");
}

runTests().catch(console.error);
