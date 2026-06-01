# Hướng dẫn: Migrate từ LocalStack sang AWS thật (VPC + EC2)

## Tổng quan thay đổi

```
LocalStack (cũ)                    AWS thật (mới)
─────────────────                   ─────────────────
Provider → localhost:4566           Provider → aws.amazonaws.com
Dummy credentials                   Real credentials (AWS CLI profile)
EKS cluster + node group            EC2 instances + Security Group
```

---

## Bước 1: Cấu hình AWS credentials

### 1.1 Cài AWS CLI (nếu chưa có)

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### 1.2 Tạo IAM User trên AWS Console

1. Đăng nhập AWS Console → IAM → Users → Create user
2. Tên user: `terraform-admin`
3. Attach policy: `AdministratorAccess` (hoặc policy tùy ý)
4. Tạo Access Key → copy **Access Key ID** và **Secret Access Key**

### 1.3 Cấu hình AWS CLI profile

```bash
aws configure --profile terraform
```

Nhập:
```
AWS Access Key ID: <YOUR_ACCESS_KEY>
AWS Secret Access Key: <YOUR_SECRET_KEY>
Default region name: us-east-1
Default output format: json
```

### 1.4 Verify

```bash
aws sts get-caller-identity --profile terraform
```

Response hiển thị ARN của bạn là OK.

---

## Bước 2: Sửa main.tf — Provider

### 2.1 Xóa LocalStack config

Xóa toàn bộ những dòng sau trong `provider "aws"`:

```hcl
# XÓA các dòng này:
access_key                  = "test"
secret_key                  = "test"
skip_credentials_validation = true
skip_metadata_api_check     = true
skip_requesting_account_id  = true

endpoints {
  ec2          = "http://localhost:4566"
  eks          = "http://localhost:4566"
  iam          = "http://localhost:4566"
  sts          = "http://localhost:4566"
}
```

### 2.2 Provider mới

Provider block còn lại đơn giản như sau:

```hcl
provider "aws" {
  region  = var.aws_region
  profile = "terraform"   # dùng AWS CLI profile vừa tạo
}
```

> **Lưu ý:** `profile = "terraform"` tương ứng với profile name bạn đặt ở bước `aws configure --profile terraform`.

---

## Bước 3: Sửa eks.tf → ec2.tf

### 3.1 Xóa toàn bộ nội dung eks.tf

Xóa hết nội dung file `eks.tf` (hoặc rename thành `ec2.tf` và xóa nội dung cũ).

### 3.2 Tạo Security Group

Thêm Security Group cho EC2 — cho phép SSH (port 22) và HTTP (port 80):

```hcl
resource "aws_security_group" "ec2_sg" {
  name        = "${var.cluster_name}-ec2-sg"
  description = "Security group for EC2 instance"
  vpc_id      = aws_vpc.main.id

  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # TODO: đổi thành IP của bạn để an toàn hơn
  }

  # HTTP
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Cho phép tất cả traffic đi ra
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.cluster_name}-ec2-sg"
  }
}
```

### 3.3 Tìm AMI ID

AWS Ubuntu AMI thay đổi theo region và thời gian. Dùng data source để tìm AMI mới nhất:

```hcl
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]  # Canonical (Ubuntu)

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}
```

### 3.4 Tạo EC2 Instance

```hcl
resource "aws_instance" "this" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.node_instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.ec2_sg.id]

  associate_public_ip_address = true

  tags = {
    Name = "${var.cluster_name}-ec2"
  }
}
```

---

## Bước 4: Sửa variables.tf

### 4.1 Đổi tên biến

Đease `node_count` và `node_instance_type` cho phù hợp với EC2:

```hcl
variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"          # free tier eligible
}
```

### 4.2 Xóa biến không cần

Xóa `node_count` (không cần cho EC2 đơn).

---

## Bước 5: Sửa outputs.tf

Thay outputs EKS bằng outputs cho EC2:

```hcl
output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.main.id
}

output "subnet_ids" {
  description = "The IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "ec2_public_ip" {
  description = "Public IP of the EC2 instance"
  value       = aws_instance.this.public_ip
}

output "ec2_private_ip" {
  description = "Private IP of the EC2 instance"
  value       = aws_instance.this.private_ip
}

output "ssh_command" {
  description = "SSH command to connect"
  value       = "ssh ubuntu@${aws_instance.this.public_ip}"
}
```

---

## Bước 6: Xóa LocalStack

```bash
docker stop ministack && docker rm ministack
```

---

## Bước 7: Chạy trên AWS thật

```bash
cd terraform/

# Init lại (provider đã thay đổi)
terraform init

# Validate
terraform validate

# Plan — xem resources sẽ tạo
terraform plan

# Apply — tạo resources trên AWS
terraform apply

# Kiểm tra
terraform state list
```

---

## Bước 8: Kết nối EC2

```bash
# Lấy SSH command từ output
terraform output ssh_command

# Kết nối
ssh ubuntu@<PUBLIC_IP>
```

Hoặc dùng **EC2 Instance Connect** trên AWS Console:
1. EC2 → Instances → chọn instance
2. Connect → EC2 Instance Connect → Connect

---

## Bước 9: Dọn dẹp

```bash
terraform destroy
```

---

## Checklist tóm tắt

| # | Việc | File |
|---|------|------|
| 1 | Cấu hình AWS CLI profile | `~/.aws/credentials` |
| 2 | Xóa LocalStack config trong provider | `main.tf` |
| 3 | Thêm `profile = "terraform"` vào provider | `main.tf` |
| 4 | Xóa nội dung eks.tf, tạo Security Group + EC2 | `ec2.tf` |
| 5 | Đổi variable `node_instance_type` → `instance_type` | `variables.tf` |
| 6 | Đổi outputs từ EKS sang EC2 | `outputs.tf` |
| 7 | Chạy `terraform init && terraform plan && terraform apply` | - |
| 8 | Kết nối EC2 | SSH hoặc EC2 Instance Connect |
| 9 | Dọn dẹp: `terraform destroy` | - |
