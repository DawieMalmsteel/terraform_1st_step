# Repository Guidelines

## Project Overview

Terraform Infrastructure-as-Code project for provisioning AWS VPC with public subnets and an EC2 instance. Originally built for LocalStack testing, migrated to real AWS deployment.

**Current state:** AWS-ready (VPC + EC2 on real AWS via `terraform` CLI profile).

---

## Architecture & Data Flow

```
terraform/
├── main.tf          → Provider config + VPC (VPC, subnets, IGW, route table)
├── ec2.tf           → AMI lookup + Security Group + EC2 instance
├── variables.tf     → Input variable declarations
├── outputs.tf       → Output values (IPs, SSH command)
├── terraform.tfvars → Variable values (override defaults)
├── .gitignore       → Excludes state files, lock files
└── *.md             → Documentation (guide, run, migration)
```

**Resource dependency graph:**
```
VPC → Subnets, IGW, Route Table
Subnets + IGW + Route Table → Route Table Associations
VPC + Subnets → Security Group
Security Group + Subnets + AMI → EC2 Instance
```

---

## Key Directories

| Path | Purpose |
|------|---------|
| `terraform/` | All Terraform configuration files |
| `terraform/.terraform/` | Downloaded provider plugins (gitignored) |

---

## Development Commands

```bash
cd terraform/

# Initialize (download providers)
terraform init

# Validate syntax
terraform validate

# Preview changes
terraform plan

# Apply changes
terraform apply

# Show current state
terraform state list

# Destroy all resources
terraform destroy
```

**Prerequisites:**
- Terraform >= 1.5.0
- AWS CLI configured with profile named `terraform`
  ```bash
  aws configure --profile terraform
  ```

---

## Code Conventions & Common Patterns

### Naming
- Resource names: lowercase, underscores (`aws_vpc.main`, `aws_instance.this`)
- Tags: `${var.project_name}-<resource>` (e.g., `my-aws-project-vpc`)
- Variables: snake_case (`project_name`, `instance_type`)

### File Organization
- `main.tf` — provider + networking (VPC, subnets, IGW, routes)
- `ec2.tf` — compute resources (AMI, security group, EC2)
- `variables.tf` — all input variables
- `outputs.tf` — all outputs
- Separation by concern: networking vs compute

### Patterns
- **Count-based resources:** `aws_subnet.public` uses `count = length(var.subnet_cidrs)` for dynamic subnet creation
- **Data sources:** `aws_availability_zones` for dynamic AZ lookup, `aws_ami` for latest Ubuntu AMI
- **Security groups:** Inline ingress/egress rules (not separate `aws_security_group_rule` resources)
- **Public access:** `map_public_ip_on_launch = true` + `associate_public_ip_address = true`

---

## Important Files

| File | Description |
|------|-------------|
| `terraform/main.tf` | Entry point — provider config + VPC infrastructure |
| `terraform/ec2.tf` | EC2 instance + security group + AMI data source |
| `terraform/variables.tf` | All configurable inputs with defaults |
| `terraform/outputs.tf` | Exposed values (VPC ID, IPs, SSH command) |
| `terraform/terraform.tfvars` | Actual variable values used in deployments |

---

## Runtime/Tooling Preferences

- **IaC Tool:** Terraform >= 1.5.0
- **Provider:** `hashicorp/aws` ~> 5.0
- **AWS Auth:** CLI profile `terraform` (not environment variables)
- **State:** Local backend (no remote state configured)
- **No test framework** — validation via `terraform validate` and `terraform plan`

---

## Testing & QA

```bash
# Syntax check
terraform validate

# Dry-run to verify resource plan
terraform plan

# Check state after apply
terraform state list
terraform show
```

**No unit tests.** Correctness verified through:
1. `terraform validate` — syntax and argument validation
2. `terraform plan` — resource graph and dependency verification
3. Manual review of plan output before apply

---

## Variables Reference

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `project_name` | string | `my-aws-project` | Resource naming prefix |
| `vpc_cidr` | string | `10.0.0.0/16` | VPC CIDR block |
| `subnet_cidrs` | list(string) | `["10.0.1.0/24", "10.0.2.0/24"]` | Public subnet CIDRs |
| `instance_type` | string | `t3.micro` | EC2 instance type |
| `aws_region` | string | `us-east-1` | AWS region |

---

## Outputs Reference

| Output | Description |
|--------|-------------|
| `vpc_id` | VPC ID |
| `subnet_ids` | List of subnet IDs |
| `ec2_public_ip` | EC2 public IP |
| `ec2_private_ip` | EC2 private IP |
| `ssh_command` | SSH connection command |
