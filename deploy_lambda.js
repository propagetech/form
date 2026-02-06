const { LambdaClient, CreateFunctionCommand, UpdateFunctionCodeCommand, GetFunctionCommand, UpdateFunctionConfigurationCommand, AddPermissionCommand } = require("@aws-sdk/client-lambda");
const { IAMClient, CreateRoleCommand, CreatePolicyCommand, AttachRolePolicyCommand, GetRoleCommand } = require("@aws-sdk/client-iam");
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { APIGatewayClient, ImportRestApiCommand, PutRestApiCommand, GetRestApisCommand, CreateDeploymentCommand } = require("@aws-sdk/client-api-gateway");
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

require('dotenv').config({ path: './.env' }); // Adjusted path for root execution

const REGION = process.env.AWS_REGION || "eu-north-1";
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID; 
const SUBMISSION_LAMBDA = "LambdaContactForm";
const DASHBOARD_LAMBDA = "LambdaDashboardAPI";
const ROLE_NAME = "LambdaContactFormRole";
const POLICY_NAME = "LambdaContactFormPermissions";
const API_NAME = "Form Management API";

const lambdaClient = new LambdaClient({ region: REGION });
const iamClient = new IAMClient({ region: REGION });
const ddbClient = new DynamoDBClient({ region: REGION });
const apiGatewayClient = new APIGatewayClient({ region: REGION });

async function deploy() {
    console.log(`🚀 Starting Deployment to ${REGION}...`);

    if (!ACCOUNT_ID) {
        console.error("❌ AWS_ACCOUNT_ID is missing in .env");
        return;
    }

    // 1. Create DynamoDB Table
    try {
        console.log("📊 Checking DynamoDB Table: FormSubmissions...");
        try {
            await ddbClient.send(new DescribeTableCommand({ TableName: "FormSubmissions" }));
            console.log("   Table exists.");
        } catch (e) {
            if (e.name === 'ResourceNotFoundException') {
                console.log("   Creating Table...");
                await ddbClient.send(new CreateTableCommand({
                    TableName: "FormSubmissions",
                    KeySchema: [
                        { AttributeName: "PK", KeyType: "HASH" },
                        { AttributeName: "SK", KeyType: "RANGE" }
                    ],
                    AttributeDefinitions: [
                        { AttributeName: "PK", AttributeType: "S" },
                        { AttributeName: "SK", AttributeType: "S" }
                    ],
                    BillingMode: "PAY_PER_REQUEST"
                }));
                console.log("   Table Created. Waiting for active status...");
                await new Promise(r => setTimeout(r, 10000));
            } else {
                throw e;
            }
        }
    } catch (e) {
        console.error("DynamoDB Error:", e.message);
    }

    // 2. IAM Role & Policy
    let roleArn;
    try {
        console.log("🔐 Setting up IAM Role...");
        try {
            const role = await iamClient.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
            roleArn = role.Role.Arn;
            console.log("   Role exists.");
        } catch (e) {
            const trustPolicy = fs.readFileSync('policies/trust_policy.json', 'utf8');
            const role = await iamClient.send(new CreateRoleCommand({
                RoleName: ROLE_NAME,
                AssumeRolePolicyDocument: trustPolicy
            }));
            roleArn = role.Role.Arn;
            console.log("   Role created.");
        }

        // Attach Policy (simplified)
        const permissionsPolicy = fs.readFileSync('policies/permissions_policy.json', 'utf8');
        try {
             const policyRes = await iamClient.send(new CreatePolicyCommand({
                PolicyName: POLICY_NAME,
                PolicyDocument: permissionsPolicy
            }));
            await iamClient.send(new AttachRolePolicyCommand({
                RoleName: ROLE_NAME,
                PolicyArn: policyRes.Policy.Arn
            }));
        } catch (e) {
            // Assume policy exists and is attached, or handle ARN lookup
             console.log("   Policy step skipped (likely exists).");
        }
        
        await new Promise(r => setTimeout(r, 5000)); // Propagate
    } catch (e) {
        console.error("IAM Error:", e);
        return;
    }

    // 3. Zip Lambda
    console.log("📦 Zipping Lambda...");
    execSync('zip -r function.zip src package.json node_modules', { cwd: 'aws-lambda' });
    const zipFile = fs.readFileSync('aws-lambda/function.zip');

    // 4. Deploy Lambdas (Submission & Dashboard)
    const envVars = {
        Variables: {
            SENDER_EMAIL: process.env.SENDER_EMAIL || "test@example.com",
            ADMIN_API_KEY: process.env.ADMIN_API_KEY || "secret-key",
            AWS_ACCOUNT_ID: ACCOUNT_ID
        }
    };

    const deployLambda = async (name, handler) => {
        try {
            console.log(`⚡ Deploying ${name}...`);
            await lambdaClient.send(new GetFunctionCommand({ FunctionName: name }));
            await lambdaClient.send(new UpdateFunctionCodeCommand({
                FunctionName: name,
                ZipFile: zipFile
            }));
            await lambdaClient.send(new UpdateFunctionConfigurationCommand({
                FunctionName: name,
                Environment: envVars,
                Handler: handler
            }));
            console.log(`   ${name} Updated.`);
        } catch (e) {
            if (e.name === 'ResourceNotFoundException') {
                await lambdaClient.send(new CreateFunctionCommand({
                    FunctionName: name,
                    Runtime: "nodejs18.x",
                    Role: roleArn,
                    Handler: handler,
                    Code: { ZipFile: zipFile },
                    Timeout: 900,
                    MemorySize: 512,
                    Environment: envVars
                }));
                console.log(`   ${name} Created.`);
            } else {
                console.error(`Lambda Error (${name}):`, e);
                throw e;
            }
        }
    };

    await deployLambda(SUBMISSION_LAMBDA, "src/index.handler");
    await deployLambda(DASHBOARD_LAMBDA, "src/dashboard-api.handler");

    // 5. Deploy API Gateway using OpenAPI
    console.log("🌐 Deploying API Gateway via OpenAPI Spec...");
    let openApiSpec = fs.readFileSync('aws-lambda/openapi.yaml', 'utf8');
    
    // Replace placeholders
    openApiSpec = openApiSpec.replace(/\${AWS_REGION}/g, REGION);
    openApiSpec = openApiSpec.replace(/\${AWS_ACCOUNT_ID}/g, ACCOUNT_ID);

    try {
        // Check if API exists to decide between Import (Create) or Put (Update)
        const apis = await apiGatewayClient.send(new GetRestApisCommand({}));
        const existingApi = apis.items.find(api => api.name === API_NAME);

        let apiId;
        if (existingApi) {
            console.log(`   Updating existing API: ${existingApi.id}`);
            apiId = existingApi.id;
            await apiGatewayClient.send(new PutRestApiCommand({
                restApiId: apiId,
                mode: 'overwrite',
                body: openApiSpec
            }));
        } else {
            console.log("   Creating new API from Spec...");
            const result = await apiGatewayClient.send(new ImportRestApiCommand({
                body: openApiSpec,
                failOnWarnings: false
            }));
            apiId = result.id;
        }

        console.log(`   API Gateway ID: ${apiId}`);

        // Deploy to 'prod' stage
        await apiGatewayClient.send(new CreateDeploymentCommand({
            restApiId: apiId,
            stageName: 'prod'
        }));

        console.log("\n✅ Deployment Complete!");
        console.log(`Base URL: https://${apiId}.execute-api.${REGION}.amazonaws.com/prod`);
        console.log(`Dashboard Endpoint: https://${apiId}.execute-api.${REGION}.amazonaws.com/prod/admin/dashboard`);
        console.log(`Submission Endpoint: https://${apiId}.execute-api.${REGION}.amazonaws.com/prod/submit/{siteId}`);
        
        // Grant permission for API Gateway to invoke Lambda
        const addPermission = async (lambdaName) => {
             try {
                await lambdaClient.send(new AddPermissionCommand({
                    FunctionName: lambdaName,
                    StatementId: `apigateway-invoke-${Date.now()}`,
                    Action: "lambda:InvokeFunction",
                    Principal: "apigateway.amazonaws.com",
                    SourceArn: `arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${apiId}/*/*/*`
                }));
             } catch (e) {
                 // Ignore if permission already exists
             }
        };
        await addPermission(SUBMISSION_LAMBDA);
        await addPermission(DASHBOARD_LAMBDA);

    } catch (e) {
        console.error("API Gateway Error:", e);
    }
}

deploy();
