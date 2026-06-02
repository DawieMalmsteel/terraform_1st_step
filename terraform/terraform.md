# Terraform Commands - VPC + EKS + Nginx

## Tổng quan

```
Terraform tạo:
├── VPC (10.0.0.0/16)
│   ├── 2 Public Subnets (10.0.1.0/24, 10.0.2.0/24)
│   ├── 2 Private Subnets (10.0.10.0/24, 10.0.11.0/24)
│   ├── Internet Gateway
│   ├── NAT Gateway + EIP
│   └── Route Tables + Associations
│
├── EKS Cluster (dinpd-eks-cluster)
│   ├── Control Plane (AWS managed)
│   └── 2 Worker Nodes (t3.small)
│
├── EC2 Instance (t3.micro, Ubuntu 24.04)
│
└── Kubernetes
    ├── Deployment (nginx:alpine, 2 replicas)
    └── Service (LoadBalancer)
```

---

## Bước 1: Init

```bash
cd terraform/
terraform init
```

Tải providers: `hashicorp/aws`, `hashicorp/kubernetes`

---

## Bước 2: Validate

```bash
terraform validate
```

Kiểm tra syntax. Output mong đợi: `Success! The configuration is valid.`

---

## Bước 3: Plan

```bash
terraform plan
```

Xem trước 26 resources sẽ tạo.

---

## Bước 4: Apply

```bash
terraform apply
```

Nhập `yes` khi hỏi xác nhận.

**Thời gian:** ~15-20 phút (EKS cluster mất nhiều thời gian nhất)

---

## Bước 5: Lấy outputs

```bash
# Lấy tất cả outputs
terraform output

# Lấy URL nginx
terraform output nginx_url

# Lấy SSH command
terraform output ssh_command

# Lấy kubeconfig command
terraform output kubeconfig_command
```

---

## Bước 6: Kết nối EKS

```bash
# Cấu hình kubectl
aws eks update-kubeconfig --name dinpd-eks-cluster --region ap-southeast-1 --profile terraform

# Kiểm tra nodes
kubectl get nodes

# Kiểm tra pods
kubectl get pods

# Kiểm tra services
kubectl get svc
```

---

## Bước 7: Check nginx

### Cách 1: Từ terraform output

```bash
terraform output nginx_url
# Output: http://a1b2c3-xxxx.ap-southeast-1.elb.amazonaws.com

# Mở trình duyệt
curl http://$(terraform output -raw nginx_url | sed 's|http://||')
```

### Cách 2: Từ kubectl

```bash
# Lấy External IP
kubectl get svc nginx
# NAME    TYPE           CLUSTER-IP      EXTERNAL-IP                           PORT(S)        AGE
# nginx   LoadBalancer   10.100.xx.xx    a1b2c3-xxxx.ap-southeast-1.elb...    80:31234/TCP   5m

# Mở trình duyệt
curl http://a1b2c3-xxxx.ap-southeast-1.elb.amazonaws.com
```

### Cách 3: Từ AWS Console

```
1. Đăng nhập AWS Console
2. EC2 → Load Balancers
3. Tìm ALB tên chứa "nginx"
4. Copy DNS name
5. Mở trình duyệt
```

---

## Bước 8: Dọn dẹp

```bash
# Xóa tất cả
terraform destroy
```

Nhập `yes` khi hỏi xác nhận.

---

## Lệnh check state

```bash
# Liệt kê tất cả resources
terraform state list

# Chi tiết 1 resource
terraform state show aws_vpc.main

# Xem outputs
terraform show
```

---

## Troubleshooting

### EKS apply bị timeout

```bash
# Kiểm tra progress
aws eks describe-cluster --name dinpd-eks-cluster --region ap-southeast-1 --profile terraform

# Nếu cluster đang ACTIVE, chờ nodes
aws eks list-nodegroups --cluster-name dinpd-eks-cluster --region ap-southeast-1 --profile terraform
```

### kubectl không kết nối được

```bash
# Re-configure
aws eks update-kubeconfig --name dinpd-eks-cluster --region ap-southeast-1 --profile terraform

# Kiểm tra
kubectl cluster-info
kubectl get nodes
```

### Nginx không accessible

```bash
# Kiểm tra pods
kubectl get pods -o wide

# Kiểm tra logs
kubectl logs -l app=nginx

# Kiểm tra service
kubectl describe svc nginx
```

---

## Tổng kết outputs

| Output | Giá trị |
|--------|---------|
| `vpc_id` | VPC ID |
| `subnet_ids` | Public subnet IDs |
| `private_subnet_ids` | Private subnet IDs |
| `nat_gateway_ip` | NAT Gateway public IP |
| `ec2_public_ip` | EC2 public IP |
| `ec2_private_ip` | EC2 private IP |
| `ssh_command` | SSH command |
| `eks_cluster_name` | `dinpd-eks-cluster` |
| `eks_cluster_endpoint` | EKS API server URL |
| `eks_cluster_certificate_authority` | Base64 cert |
| `kubeconfig_command` | kubectl config command |
| `nginx_url` | Nginx Load Balancer URL |
