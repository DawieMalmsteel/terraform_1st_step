# Run Commands — Test Terraform VPC + EKS trên LocalStack

## Prerequisites
- Docker đã cài đặt
- Terraform >= 1.5.0

---

## 1. Start LocalStack

```bash
docker run -d --name ministack -p 4566:4566 localstack/localstack:3.8
```

Chờ ~10s cho LocalStack khởi động, rồi verify:

```bash
curl http://localhost:4566/_localstack/health
```

Response `"ec2": "available"`, `"iam": "available"` là OK.

---

## 2. Chạy Terraform

```bash
cd terraform/

# Init — download provider
terraform init

# Validate — check syntax
terraform validate

# Plan — xem resources sẽ tạo
terraform plan

# Apply — tạo resources
terraform apply

# Kiểm tra state
terraform state list
```

---

## 3. Dọn dẹp

```bash
# Xóa tất cả resources
terraform destroy

# Dừng LocalStack
docker stop ministack
docker rm ministack
```

---

## Expected Results

| Step | Kết quả |
|------|---------|
| `terraform plan` | 15 to add |
| `terraform apply` | 13/15 OK (EKS fail trên LocalStack community) |
| `terraform destroy` | 13 destroyed |
