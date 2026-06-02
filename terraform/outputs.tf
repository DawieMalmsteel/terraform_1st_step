output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.main.id
}

output "subnet_ids" {
  description = "The IDs of the public subnets"
  value       = aws_subnet.public[*].id
}
output "private_subnet_ids" {
  description = "The IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "nat_gateway_ip" {
  description = "Public IP of the NAT Gateway"
  value       = aws_eip.nat.public_ip
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
  description = "SSH command to connect to EC2"
  value       = "ssh ubuntu@${aws_instance.this.public_ip}"
}

output "eks_cluster_name" {
  description = "The name of the EKS cluster"
  value       = aws_eks_cluster.this.name
}

output "eks_cluster_endpoint" {
  description = "The endpoint for the EKS cluster API server"
  value       = aws_eks_cluster.this.endpoint
}

output "eks_cluster_certificate_authority" {
  description = "Base64 encoded certificate data for the EKS cluster"
  value       = aws_eks_cluster.this.certificate_authority[0].data
}

output "kubeconfig_command" {
  description = "Command to update kubeconfig"
  value       = "aws eks update-kubeconfig --name ${aws_eks_cluster.this.name} --region ${var.aws_region}"
}

output "nginx_url" {
  description = "URL to access nginx"
  value       = "http://${kubernetes_service.nginx.status[0].load_balancer[0].ingress[0].hostname}"
}
