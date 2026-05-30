cluster_name      = "my-eks-cluster"
vpc_cidr          = "10.0.0.0/16"
subnet_cidrs      = ["10.0.1.0/24", "10.0.2.0/24"]
node_count        = 2
node_instance_type = "t3.medium"
aws_region        = "us-east-1"
