# API Integration & Dashboard Management Guide

This guide provides comprehensive instructions for integrating the Form Management API into your websites and managing submissions via the Dashboard.

## Table of Contents

1.  [API Integration](#api-integration)
    *   [Overview](#overview)
    *   [Authentication](#authentication)
    *   [Endpoint Configuration](#endpoint-configuration)
    *   [Public Submission Endpoint](#public-submission-endpoint)
    *   [Error Handling](#error-handling)
    *   [Code Examples](#code-examples)
2.  [Dashboard Management](#dashboard-management)
    *   [Authentication & Setup](#authentication--setup)
    *   [Dashboard API Reference](#dashboard-api-reference)
    *   [Workflow: Form Creation & Management](#workflow-form-creation--management)
    *   [Submission Tracking & Updates](#submission-tracking--updates)
3.  [Troubleshooting & Support](#troubleshooting--support)

---

## API Integration

### Overview

The Form Management API is a serverless backend service designed to handle form submissions from your 50+ static websites hosted on GitHub Pages or S3. It provides:
*   **Secure Data Storage**: All submissions are stored in DynamoDB.
*   **Email Notifications**: Instant email alerts via AWS SES v2.
*   **CORS Support**: Ready for cross-origin requests from any domain.

### Authentication

*   **Public Submission Endpoint**: No authentication required. This is designed for public-facing forms.
*   **Admin Dashboard Endpoints**: Protected by an API Key.
    *   **Header**: `x-api-key`
    *   **Value**: Your secret admin key (configured in `deploy_lambda.js`).

### Endpoint Configuration

After deployment, you will receive a **Base URL**.
*   **Format**: `https://{api-id}.execute-api.{region}.amazonaws.com/prod`
*   **Example**: `https://xyz123.execute-api.eu-north-1.amazonaws.com/prod`

### Public Submission Endpoint

**POST** `/submit/{siteId}`

Use this endpoint to submit form data from your website.

*   **Path Parameter**: `siteId` (String) - A unique identifier for the website (e.g., `site_001`, `landing_page_a`).
*   **Body** (JSON):
    *   `formName` (String, Optional): Name of the form (default: "default").
    *   `data` (Object, Required): The actual form fields.
    *   `metadata` (Object, Optional): Browser info, timestamps, etc.

#### Request Example

```json
POST /submit/site_001
Content-Type: application/json

{
  "formName": "contact_us",
  "data": {
    "name": "Alice Smith",
    "email": "alice@example.com",
    "message": "Hello, I would like a quote."
  },
  "metadata": {
    "source": "footer_form",
    "userAgent": "Mozilla/5.0..."
  }
}
```

#### Response Example

```json
200 OK
{
  "message": "Submission received",
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Error Handling

The API returns standard HTTP status codes:

*   `200`: Success.
*   `400`: Bad Request (Missing `data` or invalid JSON).
*   `403`: Forbidden (CORS issue or blocked origin).
*   `500`: Server Error (DynamoDB or Email service failure).

### Code Examples

#### JavaScript (Fetch API) - Recommended for Static Sites

```javascript
const API_BASE_URL = "https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/prod";
const SITE_ID = "site_001";

async function submitForm(formData) {
  try {
    const response = await fetch(`${API_BASE_URL}/submit/${SITE_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        formName: "contact_form",
        data: formData, // e.g., { name: "John", email: "..." }
        metadata: {
          submittedAt: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const result = await response.json();
    alert("Form submitted successfully! ID: " + result.id);
    
  } catch (error) {
    console.error("Submission failed:", error);
    alert("Failed to submit form. Please try again.");
  }
}
```

#### cURL

```bash
curl -X POST https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/prod/submit/site_001 \
     -H "Content-Type: application/json" \
     -d '{
           "formName": "newsletter",
           "data": { "email": "test@example.com" }
         }'
```

---

## Dashboard Management

The Dashboard API allows administrators to view, manage, and delete submissions.

### Authentication & Setup

All requests to the Dashboard API must include the `x-api-key` header.

### Dashboard API Reference

**Base URL**: `https://{api-id}.execute-api.{region}.amazonaws.com/prod/admin/dashboard`

#### 1. List All Websites
*   **Method**: `GET`
*   **Params**: None
*   **Response**: List of unique `siteId`s.

#### 2. List Forms for a Website
*   **Method**: `GET`
*   **Params**: `?siteId=site_001`
*   **Response**: List of forms with submission counts.

#### 3. List Entries for a Form
*   **Method**: `GET`
*   **Params**: `?siteId=site_001&formName=contact_us&limit=50`
*   **Response**: Array of submission objects.

#### 4. Delete a Submission
*   **Method**: `DELETE`
*   **Body**:
    ```json
    {
      "siteId": "site_001",
      "formName": "contact_us",
      "timestamp": "2023-10-27T10:00:00.000Z",
      "uuid": "submission-uuid"
    }
    ```

#### 5. Update a Submission
*   **Method**: `PUT`
*   **Body**:
    ```json
    {
      "siteId": "site_001",
      "formName": "contact_us",
      "timestamp": "2023-10-27T10:00:00.000Z",
      "uuid": "submission-uuid",
      "updates": {
        "status": "read",
        "notes": "Followed up via phone"
      }
    }
    ```

### Workflow: Form Creation & Management

**"Just-in-Time" Form Creation**:
You do not need to "create" forms in the backend. Forms are automatically registered in the system the moment the first submission is received.
1.  **Frontend**: Add a new `<form>` to your website HTML.
2.  **JS**: Send data to `/submit/{siteId}` with a new `formName`.
3.  **Backend**: The system detects the new `formName` and automatically creates the metadata index for it.

### Submission Tracking & Updates

You can build a simple Admin UI using the API endpoints above.
*   **Fetch**: Use `GET` with `limit` to page through submissions.
*   **Status Tracking**: Use the `PUT` endpoint to add fields like `status: "processed"` or `assignedTo: "Team A"` to the submission data.

---

## Troubleshooting & Support

### Common Issues

1.  **CORS Errors (Access-Control-Allow-Origin)**
    *   **Cause**: The API Gateway is not sending the correct CORS headers.
    *   **Fix**: The API is configured to allow `*`. Ensure your browser is making a standard `POST` request. If using custom headers (other than Content-Type), you may need to update the API Gateway CORS settings.

2.  **403 Forbidden on Dashboard**
    *   **Cause**: Missing or incorrect `x-api-key`.
    *   **Fix**: Verify the `ADMIN_API_KEY` in your `.env` file matches the header you are sending.

3.  **Emails Not Arriving**
    *   **Cause**: SES Sandbox mode or unverified sender.
    *   **Fix**:
        *   Verify the `SENDER_EMAIL` in AWS SES Console.
        *   If in Sandbox, verify the *recipient* email as well.
        *   Check Lambda logs in CloudWatch for SES error messages.

### Version Compatibility

*   **API Version**: 1.0.0
*   **Node.js Runtime**: 18.x
*   **AWS SDK**: v3

### Testing Procedures

1.  **Connectivity Test**:
    *   Run `curl -I https://{api-id}.../submit/test_site`
    *   Expected: `405 Method Not Allowed` (since it accepts POST, not HEAD/GET) or `200` if testing OPTIONS.

2.  **Full Flow Test**:
    *   Send a POST request via Postman or cURL.
    *   Check DynamoDB table `FormSubmissions` for the new item.
    *   Check the configured email inbox for the notification.
