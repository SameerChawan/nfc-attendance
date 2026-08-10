# NFC Attendance System

NFC-based attendance tracking for cubing competitions.

## Features

- **Competition Management** — Create and manage competitions with events
- **Competitor Registration** — Add competitors manually or via CSV upload
- **NFC Tag Assignment** — Tap-to-assign NFC tags to competitors
- **Attendance Logging** — Real-time check-in via NFC tap
- **Manual Fallback** — Check-in by WCA ID, Temp ID, or name search
- **CSV Export** — Export attendance data

## Tech Stack

- **Frontend:** Vanilla JS + Web NFC API
- **Backend:** Express.js (Node 22)
- **Database:** Supabase (PostgreSQL)
- **Container:** Docker
- **Reverse Proxy:** Nginx
- **Domain:** competitions.merasahayak-ai.in

## Architecture

```
User → Cloudflare (DNS + SSL)
         ↓
    Nginx (port 80/443)
         ↓
    competitions.merasahayak-ai.in
         ↓
    Docker Container (port 3004)
         ↓
    Express.js → Supabase
```

## Setup

### 1. Create Supabase Tables

Run `schema.sql` in Supabase SQL Editor.

### 2. Deploy to VPS

```bash
# SSH to VPS
ssh SameerChawan@103.160.106.84

# Clone repo
cd /opt/apps
git clone https://github.com/SameerChawan/nfc-attendance.git
cd nfc-attendance

# Create .env file
cp .env.example .env
# Edit .env with Supabase credentials

# Build and start
sudo docker compose up -d --build
```

### 3. Configure Nginx

```bash
# Copy Nginx config
sudo cp nginx/competitions.merasahayak-ai.in.conf /opt/nginx/sites-enabled/

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Add DNS Record

In Cloudflare, add A record:
- **Name:** `competitions`
- **Content:** `103.160.106.84`
- **Proxy:** Orange cloud (proxied)

## Deployment Workflow

```
Local → GitHub → VPS
```

1. Edit files locally
2. `git add . && git commit -m "msg" && git push origin main`
3. SSH to VPS:
   ```bash
   cd /opt/apps/nfc-attendance
   sudo git fetch origin
   sudo git reset --hard origin/main
   sudo docker compose up -d --build
   ```

## NFC Compatibility

| Browser | Support |
|---------|---------|
| Chrome 89+ Android | ✅ |
| Opera 76+ Android | ✅ |
| Edge 89+ Android | ✅ |
| iOS Safari | ❌ |
| Desktop | ❌ |

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Home | `/` | Landing page with NFC status |
| Admin | `/admin.html` | Competition & competitor management |
| Attendance | `/attendance.html` | Check-in table |
| Assign Tags | `/assign.html` | NFC tag assignment |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/competition` | Create competition |
| GET | `/api/competitions` | List competitions |
| GET | `/api/competition/:id` | Get competition |
| POST | `/api/competitor` | Add competitor |
| POST | `/api/competitors/csv` | Upload competitors CSV |
| GET | `/api/competitors/:comp_id` | List competitors |
| POST | `/api/tag/assign` | Assign NFC tag |
| POST | `/api/tags/csv` | Upload tags CSV |
| GET | `/api/tags/:comp_id` | List tags |
| GET | `/api/tag/lookup/:uid` | Lookup tag |
| POST | `/api/checkin` | Record check-in |
| GET | `/api/checkin/:comp_id` | Get check-ins |
| GET | `/api/checkin/:comp_id/export` | Export CSV |
| POST | `/api/checkin/manual` | Manual check-in |
| GET | `/api/stats/:comp_id` | Get stats |

## Port Map (VPS)

| Port | App |
|------|-----|
| 3001 | Annapurna Arogya Peeth |
| 3002 | VPS Monitoring Dashboard |
| 3003 | CubingIndia Dashboard |
| 3004 | NFC Attendance |
| 5678 | n8n |

## Cost

- VPS: ₹749/mo (shared with other apps)
- Domain: ₹70/mo (shared)
- Supabase: Free tier
- **Additional cost: ₹0**

## NFC Tag Recommendation

**NTAG213** — ₹15-20 each, 144 bytes, perfect for WCA ID

Buy: https://www.amazon.in/s?k=NTAG213+sticker

## License

Private — CubingIndia