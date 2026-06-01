# Giải thích luồng chạy Terraform

## Tổng quan

Terraform là công cụ Infrastructure as Code (IaC). Bạn viết code mô tả tài nguyên mong muốn, Terraform sẽ tạo ra tài nguyên thật trên AWS.

```
Code (.tf) → Plan (bản nháp) → Apply (tạo thật) → State (lưu trạng thái)
```

---

## Luồng chạy chi tiết

### Bước 1: `terraform init`

```bash
terraform init
```

**Làm gì:**
- Đọc file `terraform` block trong `main.tf`
- Download provider plugin `hashicorp/aws` về thư mục `.terraform/`
- Tạo file `.terraform.lock.hcl` (lock version provider)
- Khởi tạo backend (local state)

**Kết quả:** Thư mục `.terraform/` xuất hiện, chứa binary provider.

---

### Bước 2: `terraform validate`

```bash
terraform validate
```

**Làm gì:**
- Kiểm tra syntax tất cả file `.tf`
- Kiểm tra tên resource, attribute có hợp lệ không
- Kiểm tra type mismatch (VD: string vs number)
- Kiểm tra reference có tồn tại không

**KHÔNG** gọi AWS API — chỉ check code nội bộ.

**Kết quả:** `Success! The configuration is valid.` hoặc lỗi chi tiết.

---

### Bước 3: `terraform plan`

```bash
terraform plan
```

**Làm gì:**
1. Đọc tất cả file `.tf` + `terraform.tfvars`
2. Đọc `terraform.tfstate` (nếu có) — biết tài nguyên hiện tại
3. So sánh: code mong muốn vs tài nguyên hiện tại
4. Tạo "execution plan" — danh sách hành động cần thực hiện

**Ví dụ output:**
```
Plan: 5 to add, 0 to change, 0 to destroy.

  + aws_vpc.main              (mới)
  + aws_subnet.public[0]      (mới)
  + aws_subnet.public[1]      (mới)
  + aws_internet_gateway.main (mới)
  + aws_instance.this         (mới)
```

**Ký hiệu:**
- `+` = tạo mới
- `~` = sửa đổi
- `-` = xóa
- `-/+` = thay thế (xóa旧, tạo mới)

**KHÔNG** tạo tài nguyên thật — chỉ hiển thị "bản nháp".

---

### Bước 4: `terraform apply`

```bash
terraform apply
```

**Làm gì:**
1. Chạy plan (giống bước 3)
2. Hỏi xác nhận: `Do you want to perform these actions?`
3. Nếu gõ `yes` → thực thi plan
4. Gọi AWS API để tạo/sửa/xóa tài nguyên
5. Lưu kết quả vào `terraform.tfstate`

**Ví dụ output:**
```
aws_vpc.main: Creating...
aws_vpc.main: Creation complete after 10s [id=vpc-0abc123]
aws_subnet.public[0]: Creating...
aws_subnet.public[0]: Creation complete after 5s [id=subnet-0def456]
...
Apply complete! Resources: 5 added, 0 changed, 0 destroyed.
```

**Lưu ý:** Nếu dùng `-auto-approve` thì không hỏi xác nhận.

---

### Bước 5: `terraform state`

```bash
terraform state list          # Liệt kê tất cả tài nguyên
terraform show                # Chi tiết tất cả tài nguyên
terraform state show aws_vpc.main  # Chi tiết 1 tài nguyên
```

**Làm gì:**
- Đọc file `terraform.tfstate`
- Hiển thị tài nguyên Terraform đang quản lý

**File `terraform.tfstate`:**
```json
{
  "version": 4,
  "resources": [
    {
      "type": "aws_vpc",
      "name": "main",
      "attributes": {
        "id": "vpc-0abc123",
        "cidr_block": "10.0.0.0/16"
      }
    }
  ]
}
```

**Quan trọng:** Không sửa file này bằng tay. Luôn dùng `terraform` command.

---

### Bước 6: `terraform destroy`

```bash
terraform destroy
```

**Làm gì:**
1. Đọc `terraform.tfstate` — biết có tài nguyên nào
2. Tạo plan: xóa tất cả tài nguyên
3. Hỏi xác nhận
4. Gọi AWS API để xóa từng tài nguyên
5. Xóa nội dung `terraform.tfstate`

**Kết quả:** Tất cả tài nguyên bị xóa, AWS charged $0 (nếu đúng.Resources).

---

## Luồng dữ liệu

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  .tf files  │────▶│   Terraform  │────▶│  AWS API     │
│  (code)     │     │   Engine     │     │  (tài nguyên)│
└─────────────┘     └──────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ terraform    │
                    │ .tfstate     │
                    │ (trạng thái) │
                    └──────────────┘
```

1. **`.tf` files** — Mô tả tài nguyên mong muốn (declarative)
2. **Terraform Engine** — Đọc code, so sánh với state, tạo plan
3. **AWS API** — Thực thi plan, tạo tài nguyên thật
4. **`terraform.tfstate`** — Lưu ID và attribute của tài nguyên đã tạo

---

## Ví dụ thực tế trong project này

### Khi chạy `terraform plan`:

```
Terraform sẽ tạo:
1. aws_vpc.main          → VPC CIDR 10.0.0.0/16
2. aws_subnet.public[0]  → Subnet 10.0.1.0/24 (AZ[0])
3. aws_subnet.public[1]  → Subnet 10.0.2.0/24 (AZ[1])
4. aws_internet_gateway  → IGW gắn vào VPC
5. aws_route_table       → Route 0.0.0.0/0 → IGW
6. aws_route_table_association[0] → Subnet 0 + Route Table
7. aws_route_table_association[1] → Subnet 1 + Route Table
8. aws_security_group    → SSH/HTTP/HTTPS rules
9. aws_instance          → EC2 Ubuntu 24.04

Tổng: 9 resources to add
```

### Khi chạy `terraform apply`:

```
Terraform gọi AWS API:
1. ec2:CreateVpc         → VPC ID: vpc-0abc123
2. ec2:CreateSubnet      → Subnet ID: subnet-0def456, subnet-0789abc
3. ec2:CreateInternetGateway → IGW ID: igw-0123def
4. ec2:CreateRouteTable  → RTB ID: rtb-0456ghi
5. ec2:CreateRoute       → Route 0.0.0.0/0 → igw-0123def
6. ec2:AssociateRouteTable → x2
7. ec2:CreateSecurityGroup → SG ID: sg-0789jkl
8. ec2:RunInstances      → Instance ID: i-0abc123

Kết quả: 9 created, 0 changed, 0 destroyed
```

### Khi chạy `terraform destroy`:

```
Terraform gọi AWS API theo thứ tự ngược:
1. ec2:TerminateInstances → xóa EC2
2. ec2:DeleteSecurityGroup → xóa SG
3. ec2:DisassociateRouteTable → x2
4. ec2:DeleteRoute        → xóa route
5. ec2:DeleteRouteTable   → xóa RTB
6. ec2:DetachInternetGateway → tách IGW
7. ec2:DeleteInternetGateway → xóa IGW
8. ec2:DeleteSubnet       → xóa subnets
9. ec2:DeleteVpc          → xóa VPC

Kết quả: 0 added, 0 changed, 9 destroyed
```

---

## State management

### Tại sao cần state?

- Terraform cần biết tài nguyên nào đã tạo
- Để so sánh: "code nói gì vs thực tế có gì"
- Để biết cần tạo/sửa/xóa gì

### State file chứa gì?

```json
{
  "resources": [
    {
      "type": "aws_vpc",
      "name": "main",
      "instances": [
        {
          "attributes": {
            "id": "vpc-0abc123",
            "cidr_block": "10.0.0.0/16",
            "tags": {"Name": "my-aws-project-vpc"}
          }
        }
      ]
    }
  ]
}
```

### Best practices

1. **KHÔNG commit `terraform.tfstate` vào git** (đã `.gitignore`)
2. **Không sửa state bằng tay** — luôn dùng `terraform state` commands
3. **Backup state** — file `.tfstate.backup` tự động tạo
4. **Dùng remote state** cho team (S3 + DynamoDB lock)

---

## Summary

| Command | Gọi AWS API? | Tạo tài nguyên? | Lưu state? |
|---------|-------------|----------------|-----------|
| `init` | ❌ | ❌ | ❌ |
| `validate` | ❌ | ❌ | ❌ |
| `plan` | ✅ (read-only) | ❌ | ❌ |
| `apply` | ✅ | ✅ | ✅ |
| `destroy` | ✅ | ❌ (xóa) | ✅ |
| `state list` | ❌ | ❌ | ❌ (read-only) |
