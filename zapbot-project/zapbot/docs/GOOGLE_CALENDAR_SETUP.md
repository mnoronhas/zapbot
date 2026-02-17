# Google Calendar API Setup Guide

## Prerequisites
- Google Cloud account (you already have this ✅)
- A Google Cloud project

## Step 1: Enable the Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create a new one called "ZapBot")
3. Navigate to **APIs & Services → Library**
4. Search for "Google Calendar API"
5. Click **Enable**

## Step 2: Configure OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** user type (since your clinic customers will authorize)
3. Fill in:
   - **App name:** ZapBot
   - **User support email:** your email
   - **App logo:** optional for now
   - **App domain:** leave blank for now (add when you have a domain)
   - **Developer contact:** your email
4. Click **Save and Continue**

### Scopes
1. Click **Add or Remove Scopes**
2. Add these scopes:
   - `https://www.googleapis.com/auth/calendar.events` (read/write events)
   - `https://www.googleapis.com/auth/calendar.readonly` (read calendars list)
3. Click **Save and Continue**

### Test Users
1. Add your own Google account as a test user
2. Add your co-founders' accounts
3. You can add up to 100 test users while in "Testing" status

> **IMPORTANT:** While in "Testing" status, only test users can authorize.
> You'll need to submit for **verification** before going public (takes 2-6 weeks).
> Start the verification process as soon as you have a live domain.

## Step 3: Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: "ZapBot Web Client"
5. **Authorized JavaScript origins:**
   - `http://localhost:3000` (development)
   - `https://your-domain.com` (add later)
6. **Authorized redirect URIs:**
   - `http://localhost:3000/api/auth/google/callback` (development)
   - `https://your-domain.com/api/auth/google/callback` (add later)
7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

## Step 4: Update Your Environment

Add these to your `.env.local`:

```bash
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

## Step 5: Test the OAuth Flow

With the ZapBot engine running, the OAuth flow works like this:

1. User clicks "Conectar Google Calendar" in ZapBot
2. ZapBot redirects to Google's OAuth consent screen
3. User authorizes access to their calendar
4. Google redirects back with an authorization code
5. ZapBot exchanges the code for access + refresh tokens
6. Tokens are encrypted and stored in the database

## Verification Checklist

Before going public, Google requires:
- [ ] Privacy policy URL
- [ ] Terms of service URL
- [ ] Homepage URL
- [ ] Verified domain ownership
- [ ] Description of how you use each scope

**Recommendation:** Start the verification process in Week 3-4 of development.
You can develop and test with test users until then.

## Quotas (Free Tier)

- 1,000,000 queries/day (more than enough for MVP)
- 100 test users in "Testing" mode
- No cost for Calendar API usage

## Common Issues

### "Access blocked: This app's request is invalid"
- Check that your redirect URI exactly matches what's in Google Cloud Console
- Include the full path: `/api/auth/google/callback`

### "This app isn't verified"
- Normal during development — click "Advanced" → "Go to ZapBot (unsafe)"
- Only test users can do this; non-test users will be blocked

### "Token has been expired or revoked"
- Refresh tokens are long-lived but can be revoked by the user
- Always handle token refresh errors gracefully
- Prompt user to re-authorize if refresh fails
