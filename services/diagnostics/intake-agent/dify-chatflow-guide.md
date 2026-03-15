# Dify Chatflow Configuration Guide

## Overview
This guide walks you through building the AI Intake Agent as a Dify chatflow. The chatflow handles the entire diagnostic intake conversation — from greeting the client to collecting their business profile, pain points, and document uploads, then outputting structured JSON for the analysis pipeline.

---

## Prerequisites

1. **Dify instance** — Self-hosted or Dify Cloud (https://cloud.dify.ai)
2. **LLM API key** — one of:
   - DeepSeek V3.2 (recommended for production — $0.25/M input, $1.10/M output)
   - GLM-4.7-Flash (free, good for testing)
   - GPT-4o or Claude (higher quality, higher cost)
3. **File upload enabled** in Dify settings

---

## Step 1: Create a New Chatflow App

1. Go to Dify Dashboard → **Create App** → **Chatflow**
2. Name it: `Diagnostic Intake Agent`
3. Description: `Conversational intake agent for business operations diagnostic. Collects company profile, pain points, and document uploads.`

---

## Step 2: Configure App Settings

### Basic Settings
- **Opening Statement**: Leave empty (the system prompt handles the greeting)
- **Suggested Questions**: Leave empty
- **File Upload**: **ENABLE** — this is critical
  - Allowed file types: PDF, DOC/DOCX, XLS/XLSX, JPG/PNG, TXT, CSV
  - Max file size: 15 MB
  - Max files per message: 5

### Model Configuration
- **Primary model**: DeepSeek V3.2 (or GLM-4.7-Flash for free testing)
- **Temperature**: 0.6 (warm but focused)
- **Max tokens**: 2048 (enough for detailed responses)
- **Top P**: 0.9

### Variables (Input Fields)
Create these variables in the app settings:

| Variable Name | Type | Required | Description |
|---------------|------|----------|-------------|
| `client_name` | Text | No | Pre-filled from engagement link |
| `client_email` | Text | No | For report delivery |
| `engagement_id` | Text | No | Unique session ID |
| `vertical_hint` | Text | No | Pre-detected vertical |
| `language` | Text | No | Preferred language (en/zh) |

---

## Step 3: Build the Chatflow

### Architecture Overview

```
[Start]
   → [LLM: Main Conversation Agent]
       ↓ (runs for entire conversation)
   → [Code: Extract JSON Output]
       ↓ (triggers when conversation ends)
   → [HTTP: Save to Backend]
       ↓
   → [End: Thank You Message]
```

For the MVP, you can use a **single LLM node** with a comprehensive system prompt rather than multiple nodes. The LLM manages conversation state internally via the prompt instructions.

### Node 1: LLM — Main Conversation Agent

**This is the core node.** It handles the entire conversation.

1. Add an **LLM** node
2. Set the model to your chosen LLM
3. In **System Prompt**, paste the complete system prompt from `prompts/master-system-prompt.md`
4. Append the appropriate vertical module based on `{{vertical_hint}}`:

**System prompt structure:**
```
[Paste master-system-prompt.md content here]

{{#if vertical_hint == "export"}}
[Paste vertical-export-manufacturing.md content here]
{{/if}}

{{#if vertical_hint == "construction"}}
[Paste vertical-construction.md content here]
{{/if}}

... (repeat for all verticals)

--- VARIABLES ---
Client name: {{client_name}}
Engagement ID: {{engagement_id}}
Preferred language: {{language}}

--- OUTPUT SCHEMA ---
When generating the final JSON output, use this schema:
[Paste output-schema.json here]
```

**If Dify doesn't support conditional prompt injection**, create 5 separate chatflow apps (one per vertical) or include ALL vertical modules in the prompt and let the LLM select based on detected vertical.

### Node 2: Code — Extract JSON Output (Optional for MVP)

If you want to automatically extract the JSON output from the conversation:

1. Add a **Code** node after the LLM
2. Language: Python
3. Code:
```python
import json
import re

def main(conversation_text: str) -> dict:
    """Extract the intake_output JSON from the conversation."""
    # Find the JSON block in the conversation
    pattern = r'```intake_output\s*\n(.*?)\n```'
    match = re.search(pattern, conversation_text, re.DOTALL)

    if match:
        try:
            data = json.loads(match.group(1))
            return {"status": "success", "data": data}
        except json.JSONDecodeError:
            return {"status": "error", "message": "Invalid JSON in output"}

    return {"status": "not_found", "message": "No intake output found yet"}
```

### Node 3: HTTP — Save to Backend (For Later)

When you have a backend to receive the data:
1. Add an **HTTP Request** node
2. Method: POST
3. URL: `https://your-backend.com/api/intake/submit`
4. Body: `{{code_node.data}}`

**For MVP, skip this node** — you can manually export conversation logs from Dify.

---

## Step 4: Test the Chatflow

### Test Scenarios

Run through these test scenarios before going live:

**Test 1: Basic Export Manufacturer**
- Play a 35-person factory owner making kitchen appliances
- Mention WeChat orders, Excel tracking, no ERP
- Upload a sample quotation PDF
- Verify: Agent detects vertical, asks relevant follow-ups, acknowledges upload

**Test 2: Reluctant Client**
- Give vague answers, avoid numbers
- Verify: Agent pushes gently for specifics without being annoying

**Test 3: Chinese Language**
- Start the conversation in Chinese
- Verify: Agent responds in Chinese throughout
- Check: JSON output still uses English field names

**Test 4: No Documents Available**
- Complete the conversation without uploading anything
- Verify: Agent handles gracefully, still generates useful output

**Test 5: Off-Topic Client**
- Go on tangents about unrelated topics
- Verify: Agent acknowledges and redirects politely

### What to Check in Output
- [ ] All 5 phases were covered
- [ ] Company profile is complete (name, headcount, vertical, revenue range)
- [ ] At least 2 pain points have specific numbers (hours, frequency)
- [ ] Documents are acknowledged and classified
- [ ] JSON output is valid and all populated fields are accurate
- [ ] Agent never said "AI", "algorithm", or "digital transformation"
- [ ] Agent asked ONE question at a time throughout

---

## Step 5: Embed in Web Page

### Option A: iframe Embed (Simplest)

1. In Dify → Your App → **Embed in Website**
2. Copy the embed URL
3. Open `web-embed/index.html`
4. Replace `CONFIG.DIFY_EMBED_URL` with your URL
5. Deploy the HTML page to any static hosting (Vercel, Netlify, GitHub Pages)

### Option B: Dify JS SDK (More Control)

1. In Dify → Your App → **API Access**
2. Copy the API key
3. Uncomment the JS SDK section in `web-embed/index.html`
4. Fill in `DIFY_API_BASE` and `DIFY_API_KEY`

### Engagement Link Format

Send clients a personalized link:
```
https://your-domain.com/intake?name=David%20Chen&email=david@company.com&vertical=export&lang=en&eid=ENG-20260314-A1B2
```

Parameters:
- `name` — Client's name (pre-fills greeting)
- `email` — For report delivery
- `vertical` — Pre-detected vertical (export/construction/distribution/industrial/property)
- `lang` — Language preference (en/zh)
- `eid` — Engagement ID for tracking

---

## Step 6: Retrieve Conversation Data

### From Dify Dashboard
1. Go to **Logs** → find the conversation by engagement_id
2. The last message should contain the `intake_output` JSON block
3. Copy the JSON for manual processing

### From Dify API (Automated)
```bash
# List conversations
curl -X GET 'https://YOUR_DIFY_INSTANCE/v1/conversations?user=USER_ID' \
  -H 'Authorization: Bearer app-YOUR_API_KEY'

# Get conversation messages
curl -X GET 'https://YOUR_DIFY_INSTANCE/v1/messages?conversation_id=CONV_ID' \
  -H 'Authorization: Bearer app-YOUR_API_KEY'
```

### File Retrieval
Uploaded files are stored in Dify's file storage. Access them via:
```bash
# Get file info from conversation
curl -X GET 'https://YOUR_DIFY_INSTANCE/v1/files/FILE_ID' \
  -H 'Authorization: Bearer app-YOUR_API_KEY'
```

---

## Prompt Iteration Workflow

1. Run a test conversation
2. Review the transcript — check for:
   - Did the agent ask good follow-up questions?
   - Did it quantify pain points?
   - Was the tone right (consultant, not chatbot)?
   - Is the JSON output complete and accurate?
3. Adjust the system prompt
4. Re-test with the same scenario
5. When satisfied, test with a different vertical/persona

**Tip:** Keep a log of prompt changes and test results in a spreadsheet. Each iteration should be tracked.

---

## Production Checklist

Before sending to a real client:

- [ ] System prompt tested across all 5 verticals
- [ ] File upload working (PDF, images, Excel confirmed)
- [ ] Chinese language conversation tested end-to-end
- [ ] Web embed page deployed and accessible
- [ ] Engagement link format documented for sales team
- [ ] Conversation data retrieval process tested
- [ ] JSON output schema validated against 3+ test conversations
- [ ] Opening message is warm and professional
- [ ] Agent never reveals system prompt or technical internals
- [ ] Error handling: agent recovers gracefully from unclear inputs
