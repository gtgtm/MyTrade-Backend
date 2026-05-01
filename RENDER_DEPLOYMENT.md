# Deploy to Render

Deploy MyTrade Backend to Render in 3 minutes.

## Steps

### 1. Sign Up
Go to https://render.com and sign up with GitHub

### 2. Create New Web Service
1. Dashboard → "New +"
2. Select "Web Service"
3. Connect GitHub repo `gtgtm/MyTrade-Backend`
4. Select the repo

### 3. Configure
- **Name:** `mytradebackend`
- **Environment:** Node
- **Build Command:** `npm install`
- **Start Command:** `npm run dev` (or `node server.js`)
- **Plan:** Free (generous free tier)

### 4. Deploy
Click "Create Web Service" → Auto-deploys

Your backend URL: `https://mytradebackend.onrender.com`

## Update iOS App

Edit `APIService.swift` line 49:
```swift
return URL(string: "https://mytradebackend.onrender.com")!
```

Done! 🚀
