# Hướng dẫn: Docker Networking - Bridge vs Macvlan

## Mục lục

1. [Giới thiệu](#1-giới-thiệu)
2. [Kiến trúc](#2-kiến-trúc)
3. [So sánh Docker vs AWS](#3-so-sánh-docker-vs-aws)
4. [Bridge Network chi tiết](#4-bridge-network-chi-tiết)
5. [Macvlan Network chi tiết](#5-macvlan-network-chi-tiết)
6. [Cách chạy](#6-cách-chạy)
7. [Test cases](#7-test-cases)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Giới thiệu

Demo này giúp bạn hiểu 2 kiểu mạng chính trong Docker:

- **Bridge** - Default Docker networking, giống VPC + Subnets
- **Macvlan** - Dedicated MAC address, giống Dedicated ENI trong AWS

**Mục đích:** Hiểu cách Docker networking hoạt động để apply vào AWS VPC/EKS.

---

## 2. Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│  HOST MACHINE                                              │
│  ├── enp0s31f6: 192.168.1.x (physical LAN)                │
│  └── docker0: 172.17.0.1 (docker bridge)                   │
├─────────────────────────────────────────────────────────────┤
│  BRIDGE NETWORK (172.23.0.0/16)                            │
│  ├── nginx-bridge: 172.23.0.10  ← Port 8080映射到 host     │
│  ├── node-bridge: 172.23.0.20   ← Port 3000映射到 host     │
│  └── curl-tools: 172.23.0.30                                │
├─────────────────────────────────────────────────────────────┤
│  MACVLAN NETWORK (192.168.1.0/24)                           │
│  ├── nginx-macvlan: 192.168.1.200  ← Direct IP trên LAN    │
│  └── node-macvlan: 192.168.1.201   ← Direct IP trên LAN    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. So sánh Docker vs AWS

### Bảng so sánh

| Feature | Bridge | Macvlan | AWS Equivalent |
|---------|--------|---------|----------------|
| IP assignment | Docker manages | Static/DHCP on LAN | VPC DHCP / ENI |
| Port mapping | Required | Not needed | Internet Gateway |
| Performance | Good | Better (no NAT) | ENI direct |
| Isolation | Strong | Less (same LAN) | Security Groups |
| Use case | Development | Production/legacy | Production |

### AWS Mapping

| Docker Concept | AWS Equivalent | Giải thích |
|----------------|----------------|------------|
| `docker network create` | `aws ec2 create-vpc` | Tạo network isolation |
| `driver: bridge` | VPC + Subnets | Default networking |
| `driver: macvlan` | Dedicated ENI | Container có IP riêng |
| `ports: "8080:80"` | Internet Gateway | Public access |
| `internal: true` | Private subnet (no IGW) | Không có Internet |
| Service name DNS | VPC DNS / Route53 | Service discovery |
| `depends_on` | Security Group rules | Dependency ordering |

---

## 4. Bridge Network chi tiết

### Khái niệm

Bridge là default Docker network. Containers giao tiếp qua `docker0` bridge interface.

```
┌─────────────────────────────────────────┐
│  HOST                                  │
│  ├── docker0: 172.17.0.1               │
│  └── eth0: 192.168.1.x                 │
├─────────────────────────────────────────┤
│  BRIDGE NETWORK (172.23.0.0/16)        │
│  ├── nginx-bridge: 172.23.0.10         │
│  ├── node-bridge: 172.23.0.20          │
│  └── curl-tools: 172.23.0.30           │
│                                         │
│  Port mapping: 8080:80, 3000:3000      │
└─────────────────────────────────────────┘
```

### Đặc điểm

1. **Port mapping cần thiết** để truy cập từ host
   - `8080:80` → host:8080 → container:80
   - Tương tự Internet Gateway trong AWS

2. **Isolation tốt** - containers riêng biệt
   - Mỗi container có IP riêng
   - Chỉ kết nối được trong cùng network

3. **DNS resolution** - service name hoạt động
   - `curl http://nginx-bridge:80` → resolve IP

### Code example

```yaml
nginx-bridge:
  image: nginx:alpine
  ports:
    - "8080:80"        # ← Port mapping
  networks:
    bridge-network:
      ipv4_address: 172.23.0.10

bridge-network:
  driver: bridge
  ipam:
    config:
      - subnet: 172.23.0.0/16
```

### Test

```bash
# Truy cập qua port mapping
curl http://localhost:8080

# Truy cập từ container khác trong cùng network
docker exec curl-tools curl http://nginx-bridge:80
```

---

## 5. Macvlan Network chi tiết

### Khái niệm

Macvlan cho phép container có **MAC address riêng**, appears như physical device trên network.

```
┌─────────────────────────────────────────┐
│  HOST                                  │
│  └── enp0s31f6: 192.168.1.x            │
├─────────────────────────────────────────┤
│  MACVLAN NETWORK (192.168.1.0/24)      │
│  ├── nginx-macvlan: 192.168.1.200      │
│  └── node-macvlan: 192.168.1.201       │
│                                         │
│  KHÔNG cần port mapping!               │
│  IP trực tiếp trên LAN                  │
└─────────────────────────────────────────┘
```

### Đặc điểm

1. **Không cần port mapping**
   - Container trực tiếp accessible từ LAN
   - `curl http://192.168.1.200` → nginx

2. **MAC address riêng**
   - Container appears như physical device
   - Router看到 container như một host riêng

3. **Performance tốt hơn**
   - Không qua NAT (docker0 bridge)
   - Direct routing

### Code example

```yaml
nginx-macvlan:
  image: nginx:alpine
  # KHÔNG có ports mapping!
  networks:
    macvlan-network:
      ipv4_address: 192.168.1.200

macvlan-network:
  driver: macvlan
  driver_opts:
    parent: enp0s31f6    # Interface vật lý
  ipam:
    config:
      - subnet: 192.168.1.0/24
        gateway: 192.168.1.1
```

### Test

```bash
# Truy cập trực tiếp bằng IP
curl http://192.168.1.200

# Từ container khác trong cùng macvlan network
docker exec node-macvlan curl http://192.168.1.200:80
```

---

## 6. Cách chạy

### Bước 1: Kiểm tra interface

```bash
# Xem interface vật lý
ip addr show

# Output:
# enp0s31f6: <BROADCAST,MULTICAST,UP> ...  ← Dùng cái này
# wlan0: <BROADCAST,MULTICAST,UP> ...        # Hoặc wireless
```

### Bước 2: Cập nhật docker-compose.yml

Nếu interface không phải `enp0s31f6`, sửa dòng:

```yaml
macvlan-network:
  driver: macvlan
  driver_opts:
    parent: wlan0    # ← Đổi thành interface của bạn
```

### Bước 3: Start services

```bash
docker compose up -d

# Kiểm tra
docker ps
```

### Bước 4: Test Bridge network

```bash
# Truy cập nginx qua port mapping
curl http://localhost:8080

# Truy cập node-app qua port mapping
curl http://localhost:3000/health

# Từ curl-tools (cùng bridge network)
docker exec curl-tools curl http://nginx-bridge:80
docker exec curl-tools curl http://node-bridge:3000/health
```

### Bước 5: Test Macvlan network

```bash
# Truy cập trực tiếp bằng IP (KHÔNG cần port mapping)
curl http://192.168.1.200      # nginx-macvlan
curl http://192.168.1.201:3000 # node-macvlan

# Từ curl-tools (KHÔNG kết nối được vì khác network)
docker exec curl-tools curl http://192.168.1.200
# Kết quả: timeout hoặc connection refused

# Từ node-macvlan (cùng macvlan network)
docker exec node-macvlan curl http://192.168.1.200:80
```

### Bước 6: Xem network details

```bash
# Bridge network
docker network inspect bridge-network

# Macvlan network
docker network inspect macvlan-network
```

### Bước 7: Cleanup

```bash
docker compose down -v
```

---

## 7. Test cases

### Test 1: Port mapping

```bash
# Bridge: CẦN port mapping
docker run -d --name test-bridge -p 8888:80 nginx:alpine
curl http://localhost:8888  # ✅ Hoạt động

# Macvlan: KHÔNG cần port mapping
docker run -d --name test-macvlan --network macvlan-network --ip 192.168.1.250 nginx:alpine
curl http://192.168.1.250    # ✅ Hoạt động (từ host)
```

### Test 2: Network isolation

```bash
# Tạo 2 bridge networks
docker network create net1
docker network create net2

# Tạo container trong net1
docker run -d --name c1 --network net1 nginx:alpine

# Tạo container trong net2
docker run -d --name c2 --network net2 nginx:alpine

# Test: c1 → c2 ❌ (không kết nối được)
docker exec c1 curl c2:80
# Kết quả: Could not resolve host

# Kết nối c1 vào net2
docker network connect net2 c1

# Test: c1 → c2 ✅ (giờ kết nối được)
docker exec c1 curl c2:80
```

### Test 3: Performance

```bash
# Bridge: qua NAT (docker0 bridge)
# Macvlan: direct (không qua NAT)

# Benchmark với iperf3
docker run -d --name iperf-server --network macvlan-network --ip 192.168.1.251 networkstatic/iperf3 -s
docker run --rm --network macvlan-network --ip 192.168.1.252 networkstatic/iperf3 -c 192.168.1.251
```

### Test 4: DNS resolution

```bash
# Bridge: DNS hoạt động
docker exec curl-tools curl http://nginx-bridge:80  # ✅

# Macvlan: DNS KHÔNG hoạt động (cần dùng IP)
docker exec curl-tools curl http://nginx-macvlan:80  # ❌
docker exec curl-tools curl http://192.168.1.200     # ✅
```

---

## 8. Troubleshooting

### Problem: Macvlan container không accessible từ host

**Nguyên nhân:** Host không thể truy cập macvlan containers trên cùng interface.

**Giải pháp:**
```bash
# Tạo macvlan interface trên host
ip link add macvlan-host link enp0s31f6 type macvlan mode bridge
ip addr add 192.168.1.254/32 dev macvlan-host
ip link set macvlan-host up
ip route add 192.168.1.200/32 dev macvlan-host
ip route add 192.168.1.201/32 dev macvlan-host

# Giờ host có thể truy cập
curl http://192.168.1.200
```

### Problem: Port mapping không hoạt động

**Nguyên nhân:** Port đã được sử dụng hoặc firewall.

**Giải pháp:**
```bash
# Kiểm tra port
netstat -tlnp | grep 8080

# Tắt firewall (nếu có)
sudo ufw disable
```

### Problem: Container không resolve DNS

**Nguyên nhân:** DNS service không chạy hoặc network isolation.

**Giải pháp:**
```bash
# Kiểm tra DNS
docker exec container-name nslookup nginx-bridge

# Thêm DNS server
docker run --dns 8.8.8.8 nginx:alpine
```

---

## Key Takeaways

1. **Bridge** = VPC + Subnets (default, isolated, cần port mapping)
2. **Macvlan** = Dedicated ENI (IP riêng, không cần port mapping, better performance)
3. **Chọn Bridge** khi: development, cần isolation, đơn giản
4. **Chọn Macvlan** khi: production, cần performance, legacy apps
5. **AWS**: VPC = Bridge, ENI = Macvlan
