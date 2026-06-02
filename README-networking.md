# Docker Network Types: Bridge vs Macvlan

## Tổng quan

Demo này so sánh 2 kiểu mạng chính trong Docker:

1. **Bridge** - Default Docker networking
2. **Macvlan** - Dedicated MAC address

## Bảng so sánh

| Feature | Bridge | Macvlan | AWS Equivalent |
|---------|--------|---------|----------------|
| IP assignment | Docker manages | Static/DHCP on LAN | VPC DHCP / ENI |
| Port mapping | Required | Not needed | Internet Gateway |
| Performance | Good | Better (no NAT) | ENI direct |
| Isolation | Strong | Less (same LAN) | Security Groups |
| Use case | Development | Production/legacy | Production |
| **AWS equivalent** | **VPC + Subnets** | **Dedicated ENI** | - |

## Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│  HOST MACHINE                                               │
│  ├── eth0: 192.168.1.x (physical LAN)                       │
│  └── docker0: 172.17.0.1 (docker bridge)                    │
├─────────────────────────────────────────────────────────────┤
│  BRIDGE NETWORK (172.23.0.0/16)                             │
│  ├── nginx-bridge: 172.23.0.10  ← Port 8080映射到 host      │
│  ├── node-bridge: 172.23.0.20   ← Port 3000映射到 host      │
│  └── curl-tools: 172.23.0.30                                │
├─────────────────────────────────────────────────────────────┤
│  MACVLAN NETWORK (192.168.1.0/24)                           │
│  ├── nginx-macvlan: 192.168.1.200  ← Direct IP trên LAN     │
│  └── node-macvlan: 192.168.1.201   ← Direct IP trên LAN     │
└─────────────────────────────────────────────────────────────┘
```

## Chạy demo

### Bước 1: Kiểm tra interface

```bash
# Xem interface vật lý
ip addr show

# Thường là eth0, enp0s3, wlan0, etc.
# Cập nhật macvlan-network.parent trong docker-compose.yml nếu cần
```

### Bước 2: Start services

```bash
docker compose up -d

# Xem containers
docker ps
```

### Bước 3: Test Bridge network

```bash
# Truy cập nginx qua port mapping
curl http://localhost:8080

# Truy cập node-app qua port mapping
curl http://localhost:3000/health

# Từ curl-tools (cùng bridge network)
docker exec curl-tools curl http://nginx-bridge:80
docker exec curl-tools curl http://node-bridge:3000/health
```

### Bước 4: Test Macvlan network

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

### Bước 5: Xem network details

```bash
# Bridge network
docker network inspect bridge-network

# Macvlan network
docker network inspect macvlan-network
```

### Bước 6: Cleanup

```bash
docker compose down -v
```

## Giải thích chi tiết

### 1. Bridge Network (≈ VPC + Subnets)

```yaml
bridge-network:
  driver: bridge
  ipam:
    config:
      - subnet: 172.23.0.0/16
```

**Đặc điểm:**
- Containers giao tiếp qua `docker0` bridge interface
- **Cần port mapping** để truy cập từ host (ví dụ: `8080:80`)
- IP được Docker quản lý (172.23.x.x)
- Isolation tốt - containers riêng biệt

**AWS equivalent:**
- VPC + Public/Private Subnets
- Internet Gateway (port mapping)
- Security Groups (isolation)

### 2. Macvlan Network (≈ Dedicated ENI)

```yaml
macvlan-network:
  driver: macvlan
  driver_opts:
    parent: eth0    # Interface vật lý
  ipam:
    config:
      - subnet: 192.168.1.0/24
        gateway: 192.168.1.1
```

**Đặc điểm:**
- Container có **MAC address riêng**
- Appears như **physical device** trên network
- **Không cần port mapping** - container trực tiếp accessible từ LAN
- IP trên cùng subnet với host (192.168.1.x)
- Performance tốt hơn (không qua NAT)

**AWS equivalent:**
- Dedicated ENI (Elastic Network Interface)
- Container có IP riêng trên VPC
- Directly accessible từ instances khác

## Test cases

### Test 1: Port mapping

```bash
# Bridge: CẦN port mapping
docker run -d --name test-bridge -p 8888:80 nginx:alpine
curl http://localhost:8888  # ✅ Hoạt động

# Macvlan: KHÔNG cần port mapping
docker run -d --name test-macvlan --network macvlan-network --ip 192.168.1.250 nginx:alpine
curl http://192.168.1.250    # ✅ Hoạt động (từ host)
curl http://localhost:8889   # ❌ Không hoạt động (không có port mapping)
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

## Key Takeaways

1. **Bridge** = VPC + Subnets (default, isolated, cần port mapping)
2. **Macvlan** = Dedicated ENI (IP riêng, không cần port mapping, better performance)
3. **Chọn Bridge** khi: development, cần isolation, đơn giản
4. **Chọn Macvlan** khi: production, cần performance, legacy apps
5. **AWS**: VPC = Bridge, ENI = Macvlan
