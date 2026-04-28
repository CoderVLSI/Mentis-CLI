---
description: Configure Telegram bot integration
argument-hint: "<setup|status>"
---
## Usage
/telegram setup   - Interactive setup wizard
/telegram status  - Check current config

## Instructions

### Setup
If $ARGUMENTS contains "setup":

Tell the user:

**Step 1:** Open Telegram, message @BotFather, send `/newbot`

**Step 2:** Follow prompts to name your bot and get a token

**Step 3:** Run this command and paste your token when prompted:
```
node -e "const fs=require('fs'),os=require('os'),h=os.homedir()+'/.mentisrc',c=JSON.parse(fs.readFileSync(h)||'{}');process.stdin.once('data',t=>{c.telegram={botToken:t.toString().trim(),allowedChatIds:[],autoApprove:false};fs.writeFileSync(h,JSON.stringify(c,null,2));console.log('Saved! Bot configured. Run /telegram status to verify.')})"
```

**Step 4:** Start mentis: `mentis`

The bot runs automatically when you start mentis if configured.

### Status
If $ARGUMENTS contains "status":
!`node -e "const fs=require('fs'),os=require('os');try{const c=JSON.parse(fs.readFileSync(os.homedir()+'/.mentisrc'));if(c.telegram&&c.telegram.botToken){console.log('Telegram: Configured');console.log('Bot Token: '+c.telegram.botToken.substring(0,12)+'...');console.log('Allowed Chat IDs: '+(c.telegram.allowedChatIds?.length?c.telegram.allowedChatIds:'Anyone'));console.log('Auto-Approve: '+!!c.telegram.autoApprove)}else{console.log('Telegram: Not configured - run /telegram setup')}}"`

### No Arguments
Show: "Usage: /telegram setup | /telegram status"
