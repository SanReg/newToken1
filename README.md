# RyneTry - Docker Deployment Guide

A Puppeteer-based token extractor for ryne.ai.

---

## Quick Start

### 1. Install Docker on Azure VM

```bash
# SSH into your VM
ssh azureuser@<YOUR_VM_PUBLIC_IP>

# Install Docker
sudo apt update
sudo apt install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group (avoids needing sudo)
sudo usermod -aG docker $USER

# Log out and back in for changes to take effect
exit
```

### 2. Clone the Repository

```bash
git clone https://github.com/SanReg/newToken1.git
cd newToken1
```

### 3. Build the Docker Image

```bash
docker build -t rynetry .
```

### 4. Run the Container

```bash
docker run -d \
  --name rynetry \
  -p 3000:3000 \
  -e EMAIL=your-email@example.com \
  -e PASSWORD=your-password \
  --restart unless-stopped \
  rynetry
```

### 5. Access the Application

```
http://<YOUR_VM_PUBLIC_IP>:3000
```

---

## Running Multiple Instances

You can run multiple containers with different credentials on different ports.

### Example: Two Instances

**Instance 1 (port 3000):**
```bash
docker run -d \
  --name rynetry1 \
  -p 3000:3000 \
  -e EMAIL=user1@example.com \
  -e PASSWORD=password1 \
  --restart unless-stopped \
  rynetry
```

**Instance 2 (port 5000):**
```bash
docker run -d \
  --name rynetry2 \
  -p 5000:3000 \
  -e EMAIL=user2@example.com \
  -e PASSWORD=password2 \
  --restart unless-stopped \
  rynetry
```


To access your app externally, open ports in Azure:

1. Go to Azure Portal → Your VM → **Networking**
2. Click **Add inbound port rule**
3. Configure:

| Field | Value |
|-------|-------|
| Source | Any |
| Source port ranges | * |
| Destination | Any |
| Service | Custom |
| Destination port ranges | 3000 (or 5000, etc.) |
| Protocol | TCP |
| Action | Allow |
| Priority | 100 |
| Name | Allow-3000 |

Repeat for each port you want to expose (3000, 5000, etc.).

---

## Useful Docker Commands

| Task | Command |
|------|---------|
| List running containers | `docker ps` |
| List all containers | `docker ps -a` |
| View logs | `docker logs rynetry` |
| Follow logs (live) | `docker logs -f rynetry` |
| Stop container | `docker stop rynetry` |
| Start container | `docker start rynetry` |
| Restart container | `docker restart rynetry` |
| Remove container | `docker rm -f rynetry` |
| Rebuild image | `docker build -t rynetry .` |

---

## Updating the Application

When code changes:

```bash
cd ~/newToken1
git pull
docker build -t rynetry .
docker rm -f rynetry
docker run -d \
  --name rynetry \
  -p 3000:3000 \
  -e EMAIL=your-email@example.com \
  -e PASSWORD=your-password \
  --restart unless-stopped \
  rynetry
```