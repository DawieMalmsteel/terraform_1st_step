# Hướng dẫn: Terraform tạo VPC + EKS trên LocalStack

## Mục lục

1. [Giới thiệu](#1-giới-thiệu)
2. [Kiến thức cần biết](#2-kiến-thức-cần-biết)
3. [Kiến trúc tổng quan](#3-kiến-trúc-tổng-quan)
4. [Cấu trúc thư mục](#4-cấu-trúc-thư-mục)
5. [Walkthrough từng file](#5-walkthrough-từng-file)
   - [5.1 main.tf — Provider + VPC](#51-maintf--provider--vpc)
   - [5.2 eks.tf — IAM + EKS](#52-ekstf--iam--eks)
   - [5.3 variables.tf](#53-variablestf)
   - [5.4 outputs.tf](#54-outputstf)
6. [Cách chạy](#6-cách-chạy)
7. [Kết quả thực tế](#7-kết-quả-thực-tế)
8. [Deploy lên real AWS](#8-deploy-lên-real-aws)

---

## 1. Giới thiệu

Dự án này sử dụng **Terraform** (công cụ Infrastructure as Code) để tạo ra một **VPC** (mạng ảo riêng) và cụm **EKS** (Elastic Kubernetes Service — dịch vụ managed Kubernetes của AWS) chạy trên **LocalStack**.

**LocalStack** là một tool giả lập các dịch vụ AWS chạy hoàn toàn trên máy của bạn. Thay vì gửi request đến AWS thật, Terraform sẽ gửi request đến `localhost:4566` — nơi LocalStack đang lắng nghe — và LocalStack sẽ giả lập cách AWS xử lý request đó.

**Mục đích:** kiểm tra xem code Terraform có đúng không (IaC correctness) trước khi deploy lên AWS thật. Bạn có thể chạy, test, sửa lỗi mà không tốn bất kỳ chi phí AWS nào.

---

## 2. Kiến thức cần biết

Trước khi bắt đầu, bạn nên nắm các kiến thức sau:

### Terraform basics
- **`terraform init`** — khởi động project, tải provider plugin.
- **`terraform plan`** — xem trước Terraform sẽ tạo/sửa/xóa những gì (như "bản nháp" trước khi thực thi).
- **`terraform apply`** — thực thi plan, tạo ra tài nguyên thật.
- **`terraform destroy`** — xóa tất cả tài nguyên đã tạo.

### AWS VPC concepts
- **VPC (Virtual Private Cloud)** — mạng ảo riêng của bạn trên AWS, giống như một_router ảo_.
- **Subnet** — mạng con bên trong VPC. Subnet public có thể truy cập Internet; subnet private thì không.
- **Internet Gateway (IGW)** — cổng kết nối VPC với Internet.
- **Route Table** — bảng định tuyến, quyết định traffic đi đâu (ví dụ: "traffic nào đi ra Internet?").

### AWS EKS concepts
- **EKS Cluster** — cụm Kubernetes managed. AWS quản lý control plane (API server, etcd, scheduler...).
- **Node Group** — nhóm các EC2 instance chạy pods của bạn.
- **IAM Roles** — quyền hạn mà cluster và node cần để hoạt động (đọc từ ECR, sử dụng CNI...).

### Docker basics
- Biết cách chạy container: `docker run`, `docker stop`.

---

## 3. Kiến trúc tổng quan

```
┌─────────────┐         ┌─────────────────────┐
│   Terraform  │ ──req──▶│  LocalStack          │
│   (máy bạn)  │◀──resp──│  localhost:4566      │
│              │         │  (giả lập AWS API)   │
└─────────────┘         └─────────────────────┘
```

**Flow hoạt động:**

1. Bạn viết code Terraform (`.tf` files) mô tả tài nguyên mong muốn.
2. `terraform apply` — Terraform dùng AWS provider để gửi request tạo tài nguyên.
3. Provider AWS được cấu hình gửi request đến `localhost:4566` (thay vì `amazonaws.com`).
4. LocalStack nhận request, giả lập việc tạo VPC, subnet, IAM roles...
5. Kết quả được lưu vào `terraform.tfstate` — file state của Terraform.

> **Lưu ý:** EKS là dịch vụ phức tạp nên LocalStack community edition chỉ hỗ trợ một phần. VPC, subnet, IAM... sẽ hoạt động tốt. EKS cluster có thể fail — nhưng điều này chấp nhận được vì mục đích là test phần infrastructure network.

---

## 4. Cấu trúc thư mục

```
terraform/
├── main.tf              # Provider AWS + tài nguyên VPC (VPC, subnet, IGW, route table)
├── eks.tf               # Tài nguyên IAM Roles + EKS Cluster + Node Group
├── variables.tf         # Khai báo các biến (input variables)
├── outputs.tf           # Khai báo các giá trị đầu ra
├── terraform.tfvars     # Giá trị thực tế cho các biến
├── .gitignore           # Loại bỏ file nhạy cảm khỏi git
├── .terraform/          # (auto-generated) Plugin provider đã download
├── terraform.tfstate    # (auto-generated) State file
└── terraform.tfstate.backup  # (auto-generated) Backup state
```

| File | Vai trò |
|------|---------|
| `main.tf` | Nơi định nghĩa provider và các tài nguyên mạng (VPC, subnet, IGW, route table) |
| `eks.tf` | Nơi định nghĩa IAM roles và tài nguyên EKS (cluster, node group) |
| `variables.tf` | Khai báo tên, kiểu, và giá trị mặc định cho các biến |
| `outputs.tf` | Định nghĩa những giá trị Terraform in ra sau khi apply |
| `terraform.tfvars` | File chứa giá trị biến thực tế (bạn có thể ghi đè default) |
| `.gitignore` | Loại `.terraform/`, `*.tfstate`, `*.tfstate.backup`, `*.lock.hcl` khỏi git — vì chúng chứa state nhạy cảm |

---

## 5. Walkthrough từng file

---

### 5.1 main.tf — Provider + VPC

#### Phần 1: Khai báo Terraform và Provider

```hcl
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

- **`required_version = ">= 1.5.0"`** — đảm bảo bạn đang dùng Terraform phiên bản 1.5.0 trở lên. Nếu phiên bản thấp hơn, Terraform sẽ báo lỗi.
- **`required_providers`** — khai báo rằng project cần provider `aws` từ `hashicorp/aws`, phiên bản 5.x (ký hiệu `~> 5.0` nghĩa là >= 5.0 và < 6.0).

```hcl
provider "aws" {
  region                      = var.aws_region
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
}
```

- **`region = var.aws_region`** — vùng AWS sẽ deploy (mặc định `us-east-1`). Dùng biến để dễ thay đổi.
- **`access_key = "test"` / `secret_key = "test"`** — credentials giả lập cho LocalStack. LocalStack không kiểm tra thật, nên dùng giá trị "test" được.
- **`skip_credentials_validation = true`** — bỏ qua việc kiểm tra credentials có hợp lệ không. Vì LocalStack không có AWS real credentials.
- **`skip_metadata_api_check = true`** — bỏ qua việc gọi `http://169.254.169.254` (EC2 metadata service). LocalStack không có.
- **`skip_requesting_account_id = true`** — bỏ qua việc lấy AWS account ID.
- **`endpoints`** — đây là **phần quan trọng nhất**. Thay vì gọi AWS service thật (ví dụ `https://ec2.us-east-1.amazonaws.com`), tất cả request sẽ được gửi đến `localhost:4566` — nơi LocalStack lắng nghe. Mỗi service (ec2, eks, iam, sts) đều trỏ đến cùng một endpoint vì LocalStack xử lý tất cả trên một cổng.

#### Phần 2: VPC

```hcl
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.cluster_name}-vpc"
  }
}
```

- **`resource "aws_vpc" "main"`** — tạo một VPC mới. `"main"` là tên nội bộ của resource trong Terraform (dùng để reference, ví dụ `aws_vpc.main.id`).
- **`cidr_block = var.vpc_cidr`** — dải IP của VPC. Mặc định `10.0.0.0/16` nghĩa là VPC có khoảng 65,000 IP khả dụng (từ `10.0.0.0` đến `10.0.255.255`).
- **`enable_dns_support = true`** — bật DNS resolution bên trong VPC. Pod/Kubernetes cần DNS để service discovery.
- **`enable_dns_hostnames = true`** — bật hostnames DNS cho instances trong VPC. Cần thiết cho EKS.
- **`tags`** — gắn tag `Name` để dễ nhận diện trong console/debug.

#### Phần 3: Availability Zones

```hcl
data "aws_availability_zones" "available" {
  state = "available"
}
```

- **`data`** — đây là **data source** (nguồn dữ liệu), không tạo tài nguyên mới mà chỉ _đọc_ thông tin từ AWS/LocalStack.
- **`state = "available"`** — chỉ lấy các AZ đang khả dụng. Ở `us-east-1` thường có 3 AZ (a, b, c). LocalStack có thể trả về ít hơn.
- Mục đích: dùng tên AZ động thay vì hardcode `us-east-1a`, code sẽ hoạt động ở mọi region.

#### Phần 4: Public Subnets

```hcl
resource "aws_subnet" "public" {
  count = length(var.subnet_cidrs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.cluster_name}-public-${count.index + 1}"
    "kubernetes.io/role/elb" = "1"
  }
}
```

- **`count = length(var.subnet_cidrs)`** — tạo subnet theo số lượng CIDR trong danh sách. Mặc định có 2 CIDR (`10.0.1.0/24` và `10.0.2.0/24`) nên sẽ tạo 2 subnets.
- **`count.index`** — index hiện tại (0, 1, 2...). Dùng để chọn CIDR và AZ tương ứng.
- **`vpc_id = aws_vpc.main.id`** — subnet thuộc về VPC nào.
- **`cidr_block = var.subnet_cidrs[count.index]`** — CIDR của subnet. `10.0.1.0/24` có 256 IP, `10.0.2.0/24` cũng có 256 IP.
- **`availability_zone = data.aws_availability_zones.available.names[count.index]`** — subnet đặt ở AZ nào. Subnet 0 ở AZ[0], subnet 1 ở AZ[1]...
- **`map_public_ip_on_launch = true`** — instance trong subnet này sẽ tự động được gán public IP khi khởi động. Cần thiết cho subnet public.
- **`"kubernetes.io/role/elb" = "1"`** — tag đặc biệt cho AWS Load Balancer Controller. Tag này báo cho AWS biết subnet này có thể dùng để đặt Elastic Load Balancer (ELB).

#### Phần 5: Internet Gateway

```hcl
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.cluster_name}-igw"
  }
}
```

- **Internet Gateway** — cầu nối giữa VPC và Internet. Without IGW, instances trong VPC public subnet vẫn không thể truy cập Internet.
- **`vpc_id`** — gắn IGW vào VPC.

#### Phần 6: Route Table

```hcl
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.cluster_name}-public-rt"
  }
}
```

- **Route Table** — bảng định tuyến quyết định traffic đi đâu.
- **`route`** — định tuyến: mọi traffic đi đến địa chỉ IP ngoài (`0.0.0.0/0` = "mọi IP") sẽ được gửi qua Internet Gateway.
- **`0.0.0.0/0`** là CIDR wildcard, đại diện cho toàn bộ Internet.

#### Phần 7: Route Table Association

```hcl
resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
```

- **`count = length(aws_subnet.public)`** — tạo association cho mỗi subnet (2 subnets = 2 associations).
- **`subnet_id`** — subnet nào cần gắn route table.
- **`route_table_id`** — route table nào sẽ được gắn.
- Without association, subnet không có route table → không biết traffic đi đâu → không thể truy cập Internet.

---

### 5.2 eks.tf — IAM + EKS

#### Phần 1: IAM Role cho EKS Cluster

```hcl
resource "aws_iam_role" "eks_cluster" {
  name = "${var.cluster_name}-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
  })
}
```

- **`aws_iam_role`** — tạo IAM Role, là "tài khoản dịch vụ" mà AWS service dùng để thực hiện hành động.
- **`assume_role_policy`** — chính sách cho phép ai được phép "assume" (đóng vai) role này.
  - **`sts:AssumeRole`** — hành động cho phép assume role.
  - **`Principal = { Service = "eks.amazonaws.com" }`** — chỉ dịch vụ EKS mới được assume role này.
  - **`jsonencode({...})`** — chuyển policy từ HCL sang JSON (vì AWS API cần JSON).

```hcl
resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster.name
}
```

- **`aws_iam_role_policy_attachment`** — gắn policy có sẵn của AWS vào role.
- **`AmazonEKSClusterPolicy`** — policy chuẩn của AWS cho phép EKS cluster thực hiện các hành động cần thiết (tạo ENI, quản lý security groups...).
- **`role`** — role nào nhận policy này.

#### Phần 2: IAM Role cho EKS Node Group

```hcl
resource "aws_iam_role" "eks_nodes" {
  name = "${var.cluster_name}-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}
```

- Tương tự như role cluster, nhưng **`Principal = { Service = "ec2.amazonaws.com" }`** — vì worker nodes là EC2 instances.

```hcl
resource "aws_iam_role_policy_attachment" "eks_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_nodes.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_nodes.name
}

resource "aws_iam_role_policy_attachment" "eks_ecr_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_nodes.name
}
```

3 policy cần thiết cho worker nodes:

| Policy | Mục đích |
|--------|----------|
| `AmazonEKSWorkerNodePolicy` | Cho phép node register với cluster, nhận pods... |
| `AmazonEKS_CNI_Policy` | Cho phép node quản lý network (CNI = Container Network Interface) — gán IP cho pods |
| `AmazonEC2ContainerRegistryReadOnly` | Cho phép node pull image từ Amazon ECR (container registry) |

#### Phần 3: EKS Cluster

```hcl
resource "aws_eks_cluster" "this" {
  name     = var.cluster_name
  role_arn = aws_iam_role.eks_cluster.arn

  vpc_config {
    subnet_ids              = aws_subnet.public[*].id
    endpoint_public_access  = true
    endpoint_private_access = false
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
  ]
}
```

- **`aws_eks_cluster`** — tạo cụm EKS.
- **`name = var.cluster_name`** — tên cluster (mặc định `my-eks-cluster`).
- **`role_arn = aws_iam_role.eks_cluster.arn`** — ARN (Amazon Resource Name) của role IAM mà cluster dùng.
- **`vpc_config`** — cấu hình mạng cho cluster:
  - **`subnet_ids = aws_subnet.public[*].id`** — cluster đặt trong những subnets. `[*]` là splat expression — lấy `id` của _mọi_ subnet trong danh sách.
  - **`endpoint_public_access = true`** — cho phép truy cập cluster API từ bên ngoài (Internet).
  - **`endpoint_private_access = false`** — tắt truy cập nội bộ (vì đang test trên LocalStack).
- **`depends_on`** — đảm bảo policy attachment hoàn thành trước khi tạo cluster. Without this, Terraform có thể cố gắng tạo cluster trước khi role có đủ quyền.

#### Phần 4: EKS Node Group

```hcl
resource "aws_eks_node_group" "this" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.cluster_name}-nodes"
  node_role_arn   = aws_iam_role.eks_nodes.arn
  subnet_ids      = aws_subnet.public[*].id

  instance_types = [var.node_instance_type]

  scaling_config {
    desired_size = var.node_count
    min_size     = 1
    max_size     = var.node_count + 1
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_node_policy,
    aws_iam_role_policy_attachment.eks_cni_policy,
    aws_iam_role_policy_attachment.eks_ecr_policy,
  ]
}
```

- **`cluster_name = aws_eks_cluster.this.name`** — node group thuộc cluster nào.
- **`node_group_name`** — tên node group.
- **`node_role_arn`** — role IAM cho nodes.
- **`subnet_ids`** — nodes đặt ở những subnets (giống cluster).
- **`instance_types = [var.node_instance_type]`** — loại EC2 instance (mặc định `t3.medium`: 2 vCPU, 4GB RAM).
- **`scaling_config`** — cấu hình auto-scaling:
  - **`desired_size`** — số node mong muốn (mặc định 2).
  - **`min_size`** — ít nhất 1 node.
  - **`max_size`** — tối đa `node_count + 1` (3 node). Auto-scaler có thể scale lên/xuống trong khoảng này.
- **`depends_on`** — đảm bảo cả 3 policy attachment hoàn thành trước khi tạo node group.

---

### 5.3 variables.tf

File này khai báo các **input variables** — cách bạn "tham số hóa" code Terraform.

```hcl
variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "my-eks-cluster"
}
```

- **`cluster_name`** — tên cluster EKS. Dùng xuyên suốt trong `main.tf` và `eks.tf` (để đặt tên VPC, subnet, IAM roles...).

```hcl
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}
```

- **`vpc_cidr`** — dải IP cho VPC. `/16` = 65,536 IP.

```hcl
variable "subnet_cidrs" {
  description = "CIDR blocks for the public subnets (2 AZs)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}
```

- **`subnet_cidrs`** — danh sách CIDR cho các subnets. `type = list(string)` nghĩa là danh sách chuỗi. Mỗi phần tử là CIDR của một subnet.

```hcl
variable "node_count" {
  description = "Number of worker nodes in the EKS node group"
  type        = number
  default     = 2
}
```

- **`node_count`** — số worker nodes. Dùng trong `scaling_config`.

```hcl
variable "node_instance_type" {
  description = "EC2 instance type for worker nodes"
  type        = string
  default     = "t3.medium"
}
```

- **`node_instance_type`** — loại EC2 instance (ví dụ: `t3.medium`, `t3.large`, `m5.large`...).

```hcl
variable "aws_region" {
  description = "AWS region (used for AZ suffixes)"
  type        = string
  default     = "us-east-1"
}
```

- **`aws_region`** — vùng AWS. `us-east-1` là vùng phổ biến nhất, miễn phí tier.

> **Lưu ý:** Giá trị default trong `variables.tf` sẽ bị ghi đè bởi `terraform.tfvars` nếu bạn khai báo giá trị ở đó.

---

### 5.4 outputs.tf

File này định nghĩa các **output values** — giá trị Terraform in ra sau khi `terraform apply`.

```hcl
output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.main.id
}
```

- **`vpc_id`** — ID của VPC đã tạo (ví dụ: `vpc-0abc123`). Dùng khi cần reference VPC ở nơi khác.

```hcl
output "subnet_ids" {
  description = "The IDs of the public subnets"
  value       = aws_subnet.public[*].id
}
```

- **`subnet_ids`** — danh sách IDs của subnets. `[*]` = splat expression, lấy `id` của mọi subnet. Kết quả dạng danh sách: `["subnet-aaa", "subnet-bbb"]`.

```hcl
output "eks_cluster_name" {
  description = "The name of the EKS cluster"
  value       = aws_eks_cluster.this.name
}
```

- **`eks_cluster_name`** — tên cluster. Dùng với `kubectl`: `aws eks update-kubeconfig --name <cluster_name>`.

```hcl
output "eks_cluster_endpoint" {
  description = "The endpoint for the EKS cluster API server"
  value       = aws_eks_cluster.this.endpoint
}
```

- **`eks_cluster_endpoint`** — URL của Kubernetes API server (ví dụ: `https://XXXXX.us-east-1.eks.amazonaws.com`). Dùng để kết nối `kubectl`.

```hcl
output "eks_cluster_certificate_authority" {
  description = "Base64 encoded certificate data for the EKS cluster"
  value       = aws_eks_cluster.this.certificate_authority[0].data
}
```

- **`eks_cluster_certificate_authority`** — certificate Base64-encoded để `kubectl` xác thực với cluster. Dùng trong kubeconfig.

---

## 6. Cách chạy

### Bước 1: Start LocalStack

```bash
docker run --name ministack -d -p 4566:4566 localstack/localstack
```

- `--name ministack` — đặt tên container là `ministack`.
- `-d` — chạy nền (detach).
- `-p 4566:4566` — map cổng 4566 từ container ra host.
- LocalStack sẽ khởi động và lắng nghe trên `localhost:4566`.

### Bước 2: terraform init

```bash
cd terraform/
terraform init
```

- Tải provider `hashicorp/aws` về thư mục `.terraform/`.
- Chỉ cần chạy lần đầu hoặc khi thay đổi provider.

### Bước 3: terraform validate

```bash
terraform validate
```

- Kiểm tra syntax — xem file `.tf` có hợp lệ không (sai cú pháp sẽ báo lỗi ngay).

### Bước 4: terraform plan

```bash
terraform plan
```

- Hiển thị "bản nháp": Terraform sẽ tạo những tài nguyên nào, với thông số gì.
- Bạn sẽ thấy `Plan: X to add, 0 to change, 0 to destroy`.

### Bước 5: terraform apply

```bash
terraform apply
```

- Hỏi xác nhận `Do you want to perform these actions?` → gõ `yes`.
- Terraform bắt đầu tạo tài nguyên trên LocalStack.

### Bước 6: Kiểm tra state

```bash
terraform show
```

- Xem toàn bộ tài nguyên đã được lưu trong state.

### Bước 7: terraform destroy

```bash
terraform destroy
```

- Xóa tất cả tài nguyên đã tạo. Hỏi xác nhận → gõ `yes`.
- LocalStack vẫn giữ nguyên — chỉ tài nguyên Terraform quản lý bị xóa.

### Bước 8: Dừng LocalStack

```bash
docker stop ministack
docker rm ministack
```

- Dừng và xóa container LocalStack.

---

## 7. Kết quả thực tế

Khi chạy trên LocalStack community edition, kết quả thực tế là:

| Bước | Kết quả | Chi tiết |
|------|---------|----------|
| `terraform plan` | **15 resources to add** | Plan hiển thị đầy đủ: VPC, 2 subnets, IGW, route table, 2 associations, 2 IAM roles, 4 policy attachments, EKS cluster, node group |
| `terraform apply` | **13/15 thành công** | VPC, subnets, IGW, route table, IAM roles — **tạo thành công**. EKS cluster và node group — **thất bại** (LocalStack community không hỗ trợ đầy đủ EKS API) |
| `terraform destroy` | **13 resources destroyed** | Tất cả tài nguyên đã tạo đều bị xóa sạch |

**Giải thích:** EKS là dịch vụ phức tạp (managed Kubernetes). LocalStack community edition giả lập được VPC, IAM... nhưng không thể giả lập đầy đủ control plane của EKS. Đây là hành vi expected — khi deploy lên AWS thật, EKS sẽ hoạt động đầy đủ.

---

## 8. Deploy lên real AWS

Nếu muốn deploy lên AWS thật (không qua LocalStack), bạn cần sửa 3 chỗ trong `main.tf`:

### 1. Bỏ `endpoints` block

Xóa toàn bộ block `endpoints { ... }` trong provider. Khi không có endpoints, Terraform sẽ gọi AWS service thật.

### 2. Bỏ skip flags

Đặt 3 flag thành `false` hoặc xóa chúng:
```hcl
skip_credentials_validation = false  # hoặc xóa dòng
skip_metadata_api_check     = false  # hoặc xóa dòng
skip_requesting_account_id  = false  # hoặc xóa dòng
```

### 3. Dùng credentials thật

Thay `"test"` bằng AWS access key thật:
```hcl
access_key = "AKIAIOSFODNN7EXAMPLE"   # Access Key ID thật
secret_key = "wJalrXUtnFEMI/K7MDENG..."  # Secret Access Key thật
```

> **Lưu ý an toàn:** Không bao giờ hardcode credentials trong file `.tf`. Nên dùng environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) hoặc AWS profiles (`~/.aws/credentials`).

Sau khi sửa, chạy lại `terraform init` (nếu thay đổi version provider), rồi `terraform plan` và `terraform apply`. Lần này EKS cluster và node group sẽ tạo thành công.
