# Instagram Access Token Setup Guide

## Problem: Token Expired

If you see this error:
```
Error validating access token: Session has expired
```

Your Instagram access token has expired and needs to be renewed.

## How to Get a New Instagram Access Token

### Step 1: Go to Facebook Graph API Explorer

Visit: https://developers.facebook.com/tools/explorer/

### Step 2: Select Your App

1. Click the dropdown next to "Meta App" at the top
2. Select your Facebook App (the one connected to your Instagram Business Account)

### Step 3: Generate Access Token

1. Click "Generate Access Token" button
2. Grant the following permissions:
   - `instagram_basic`
   - `pages_show_list`
   - `pages_read_engagement`
   - `instagram_content_publish` (required for posting)

### Step 4: Exchange for Long-Lived Token

Short-lived tokens expire in 1 hour. You need a long-lived token (60 days):

1. Go to: https://developers.facebook.com/tools/debug/accesstoken/
2. Paste your short-lived token
3. Click "Extend Access Token"
4. Copy the new long-lived token

### Step 5: Update Your Configuration

**Option A: Update .env file**

Edit `backend/.env`:
```env
INSTAGRAM_ACCESS_TOKEN=your_new_long_lived_token_here
INSTAGRAM_USER_ID=your_instagram_user_id
```

**Option B: Update via Settings Page**

1. Go to Settings page in the app
2. Update the Instagram channel credentials
3. Enter the new access token

### Step 6: Restart Backend

After updating the token, restart your backend server:
```bash
# Stop the current server (Ctrl+C)
# Then restart
./run.sh
# or
cd backend && python -m uvicorn app.main:app --reload --port 8000
```

## Token Requirements

- ✅ Must be a **User Access Token** (not Page Access Token)
- ✅ Must be **Long-Lived** (60 days, can be refreshed)
- ✅ Must have `instagram_content_publish` permission
- ✅ Must be associated with an Instagram Business Account

## Troubleshooting

### "Invalid OAuth access token"
- Token format is wrong (may have extra quotes/spaces)
- Check `.env` file - remove any quotes around the token
- Ensure no trailing spaces

### "Session has expired"
- Token has expired (short-lived tokens last 1 hour)
- Get a new long-lived token following steps above

### "User does not have permission"
- Missing required permissions
- Re-generate token with all required permissions listed above

### "Invalid user ID"
- Check `INSTAGRAM_USER_ID` in `.env`
- Should be your Instagram Business Account ID (not username)

## Refreshing Long-Lived Tokens

Long-lived tokens (60 days) can be refreshed before expiration:

1. Go to: https://developers.facebook.com/tools/debug/accesstoken/
2. Enter your current token
3. Click "Extend Access Token"
4. Update your `.env` file with the new token

## Need Help?

- Facebook Graph API Docs: https://developers.facebook.com/docs/instagram-api/
- Token Debugger: https://developers.facebook.com/tools/debug/accesstoken/
- Graph API Explorer: https://developers.facebook.com/tools/explorer/
